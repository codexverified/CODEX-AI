/**
 * C☯︎DEX-AI — Command Handler
 * Single-pass loader: clears registry once, loads each file once.
 * Uses a flat Map registry so commands are never double-registered.
 */

const fs    = require('fs-extra');
const path  = require('path');
const chalk = require('chalk');
const { theme } = require('./theme');

class CommandHandler {
    constructor(bot) {
        this.bot         = bot;
        this.commandsDir = path.join(__dirname, '../commands');
        this.pluginsDir  = path.join(__dirname, '../plugins');
    }

    async loadCommands() {
        // ── Clear registry ONCE before loading ────────────────────────────────
        this.bot.commands.clear();

        let loaded = 0;
        let failed = 0;

        const loadedFiles = new Set();   // guard against double-require of same resolved path

        const categories = fs.readdirSync(this.commandsDir)
            .filter(f => fs.statSync(path.join(this.commandsDir, f)).isDirectory());

        for (const category of categories) {
            const categoryPath = path.join(this.commandsDir, category);
            const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

            for (const file of files) {
                try {
                    const filePath     = path.join(categoryPath, file);
                    const resolvedPath = require.resolve(filePath);

                    // Skip if we already loaded this exact file (symlink / duplicate)
                    if (loadedFiles.has(resolvedPath)) continue;
                    loadedFiles.add(resolvedPath);

                    // Always bust require cache so .reload works correctly
                    delete require.cache[resolvedPath];

                    const command = require(filePath);

                    if (command.name && command.execute) {
                        command.category = category;
                        this.wrapCommandReactions(command);

                        // Register by primary name (never overwrite an existing entry)
                        if (!this.bot.commands.has(command.name.toLowerCase()))
                            this.bot.commands.set(command.name.toLowerCase(), command);

                        // Register aliases — support both `alias` and `aliases`
                        const aliasList = command.aliases || command.alias || [];
                        const aliases   = Array.isArray(aliasList) ? aliasList : [aliasList];
                        for (const alias of aliases) {
                            if (!alias) continue;
                            const key = String(alias).toLowerCase();
                            if (!this.bot.commands.has(key))
                                this.bot.commands.set(key, command);
                        }

                        loaded++;
                    } else if (command?.commands && typeof command.run === 'function') {
                        const migrated = this.loadPluginFile(filePath);
                        loaded += Array.isArray(migrated) ? migrated.length : 1;
                    }
                } catch (err) {
                    // Details stay out of the panel; the startup summary reports only the total.
                    failed++;
                }
            }
        }

        const pluginResult = this.loadPlugins();
        loaded += pluginResult.loaded;
        failed += pluginResult.failed;

        const registeredCommandCount = this.bot.commands.size;

        this.bot.totalCmds    = registeredCommandCount + failed;
        this.bot.successCmds  = registeredCommandCount;
        this.bot.failedCmds   = failed;

        return { loaded: registeredCommandCount, failed };
    }

    wrapCommandReactions(command) {
        if (command.__reactionsWrapped || typeof command.execute !== 'function') return command;
        const originalExecute = command.execute;
        const reactions = command.reactions || { start: '⏳', success: '✅' };
        command.execute = async (...args) => {
            const sock = args[0];
            const message = args[1];
            const target = sock?.sock || sock;
            const enabled = sock?.config?.cmdReact?.enabled === true;
            const key = message?.key;
            const chat = message?.chat;
            if (enabled && key && target?.sendMessage) {
                await target.sendMessage(chat, { react: { text: reactions.start, key } }).catch(() => {});
            }
            try {
                return await originalExecute(...args);
            } finally {
                if (enabled && key && target?.sendMessage) {
                    await target.sendMessage(chat, { react: { text: '', key } }).catch(() => {});
                }
            }
        };
        command.__reactionsWrapped = true;
        return command;
    }

    loadPlugins() {
        fs.ensureDirSync(this.pluginsDir);

        let loaded = 0;
        let failed = 0;
        const files = this.findPluginFiles(this.pluginsDir);

        for (const filePath of files) {
            try {
                const command = this.loadPluginFile(filePath);
                if (command) loaded += Array.isArray(command) ? command.length : 1;
            } catch (err) {
                failed++;
                console.error(`[plugin-load] ${path.relative(process.cwd(), filePath)}: ${err?.stack || err}`);
            }
        }

        console.log(`[plugins] scanned=${files.length} loaded=${loaded} failed=${failed} directory=${this.pluginsDir}`);
        return { loaded, failed };
    }

    findPluginFiles(directory) {
        const files = [];
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) files.push(...this.findPluginFiles(filePath));
            else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('.')) files.push(filePath);
        }
        return files.sort();
    }

    loadPluginFile(filePath) {
        const resolvedPath = require.resolve(filePath);
        delete require.cache[resolvedPath];

        // Installed plugins carry a leading "// @source: <url>" comment (added
        // by lib/pluginManager.js on install) so .list can keep showing where
        // a plugin came from even after a restart — command.source only lived
        // in memory before, so it reset to undefined on every reload.
        let sourceUrl = null;
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const m = raw.match(/^\/\/\s*@source:\s*(\S+)/m);
            if (m) sourceUrl = m[1];
        } catch {}

        const exported = require(filePath);
        const definitions = Array.isArray(exported) ? exported : [exported];
        const loaded = [];

        for (const definition of definitions) {
            if (!definition?.commands || typeof definition.run !== 'function') continue;
            const names = Array.isArray(definition.commands) ? definition.commands : [definition.commands];
            const command = {
                name: String(names[0]),
                aliases: names.slice(1).map(String),
                description: definition.description,
                category: definition.category || path.basename(path.dirname(filePath)),
                permission: definition.permission,
                source: sourceUrl,
                // Mirror the plugin's own group/permission flags onto the
                // same gate fields the framework already enforces for native
                // commands (messageHandler checks command.groupOnly /
                // .adminOnly / .ownerOnly / .sudoOnly BEFORE execute() is
                // even reached). This gives plugins the same reliable,
                // LID-safe enforcement native commands get, as a safety net
                // that holds even if a plugin's own internal check is
                // missing or wrong — instead of every plugin being solely
                // responsible for correctly gating itself.
                // Only truly group-exclusive commands (group:true with
                // private explicitly NOT true) get groupOnly — many plugins
                // set group:true *and* private:true meaning "works in both",
                // and those must stay usable in DMs.
                groupOnly: definition.group === true && definition.private !== true,
                ownerOnly: definition.permission === 'owner',
                adminOnly: definition.permission === 'admin',
                sudoOnly: definition.permission === 'sudo',
                // NOTE: cmdName is passed as this function's 4th positional
                // argument by messageHandler._run() — it is a STRING, not a
                // context object. Silva-style plugins expect a real ctx
                // object here (isAdmin, isBotAdmin, jid, from, mentionedJid,
                // groupMetadata, theme, etc). Building it properly — instead
                // of spreading that string, which silently produced garbage
                // numeric keys and left every one of those fields undefined
                // — is what makes plugin admin/group checks (and anything
                // else reading ctx) actually work instead of always failing
                // closed (e.g. "I need to be an admin" even when it is one).
                execute: async (sock, message, args, cmdName = '') => {
                    const target = sock?.sock || sock;
                    const reply = text => target.sendMessage(message.chat, { text: String(text) }, { quoted: message });
                    const bot = this.bot;

                    let groupMetadata = null;
                    let isAdmin = false;
                    let isBotAdmin = false;
                    if (message.isGroup) {
                        try { groupMetadata = await target.groupMetadata(message.chat); } catch {}
                        try { isAdmin = await bot.permission.isAdmin(message.chat, message.sender, message._participantRaw); } catch {}
                        try { isBotAdmin = await bot.permission.isBotAdmin(message.chat); } catch {}
                    }
                    let isOwner = false;
                    try { isOwner = !!message.key?.fromMe || bot.permission.isOwner(message.sender); } catch {}

                    const ctx = {
                        jid: message.chat,
                        from: message.sender,
                        reply,
                        sock: target,
                        m: message,
                        command: cmdName,
                        args: args || [],
                        isGroup: !!message.isGroup,
                        isAdmin,
                        isBotAdmin,
                        isOwner,
                        mentionedJid: message.mentions || [],
                        groupMetadata,
                        pushName: message.pushName || message.pushname || '',
                        pushname: message.pushName || message.pushname || '',
                        theme,
                    };

                    return definition.run(target, message, args || [], ctx);
                },
            };
            this.wrapCommandReactions(command);
            command.__plugin = true;
            command.__pluginFile = resolvedPath;
            this.registerCommand(command, true);
            loaded.push(command);
        }

        if (!loaded.length && (!exported?.name || typeof exported.execute !== 'function')) {
            throw new Error('Plugin must export a command or command definitions.');
        }
        if (loaded.length) return loaded;
        exported.category = exported.category || 'plugin';
        this.wrapCommandReactions(exported);
        exported.__plugin = true;
        exported.__pluginFile = resolvedPath;
        this.registerCommand(exported, true);
        return exported;
    }

    registerCommand(command, allowReplacePlugin = false) {
        const names = [command.name, ...(Array.isArray(command.aliases || command.alias)
            ? (command.aliases || command.alias)
            : [command.aliases || command.alias]
        )].filter(Boolean).map(n => String(n).toLowerCase());

        const available = names.filter(name => {
            const existing = this.bot.commands.get(name);
            return !existing || (allowReplacePlugin && existing.__plugin);
        });

        // Codex bundles often include commands CODEX already provides. Keep the
        // CODEX implementation and register only genuinely new names.
        for (const name of available) {
            this.bot.commands.set(name, command);
        }

        return available.length > 0;
    }

    unloadPlugin(name) {
        const command = this.getCommand(name);
        if (!command?.__plugin) return null;

        for (const [key, cmd] of [...this.bot.commands.entries()]) {
            if (cmd === command) this.bot.commands.delete(key);
        }

        if (command.__pluginFile) {
            delete require.cache[command.__pluginFile];
        }

        return command;
    }

    getCommand(name) {
        return this.bot.commands.get(name?.toLowerCase());
    }

    getCommandCount() {
        return this.bot.commands.size;
    }

    getAllCommands() {
        const categories = {};
        for (const [name, cmd] of this.bot.commands) {
            if (!categories[cmd.category]) categories[cmd.category] = [];
            // Only list primary name entries, not alias duplicates.
            // This keeps the menu readable while a separate count method can
            // reflect the full registered-name total when needed.
            if (cmd.name === name) categories[cmd.category].push(cmd);
        }
        return categories;
    }
}

module.exports = CommandHandler;

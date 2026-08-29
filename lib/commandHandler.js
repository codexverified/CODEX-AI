/**
 * C☯︎DEX-AI — Command Handler
 * Single-pass loader: clears registry once, loads each file once.
 * Uses a flat Map registry so commands are never double-registered.
 */

const fs    = require('fs-extra');
const path  = require('path');
const chalk = require('chalk');

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

        const primaryCommands = Object.values(this.getAllCommands())
            .reduce((total, commands) => total + commands.length, 0);

        this.bot.totalCmds    = primaryCommands + failed;
        this.bot.successCmds  = primaryCommands;
        this.bot.failedCmds   = failed;

        return { loaded: primaryCommands, failed };
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
        const files = fs.readdirSync(this.pluginsDir).filter(f => f.endsWith('.js'));

        for (const file of files) {
            try {
                const filePath = path.join(this.pluginsDir, file);
                const command = this.loadPluginFile(filePath);
                if (command) loaded += Array.isArray(command) ? command.length : 1;
            } catch (err) {
                // Details stay out of the panel; the startup summary reports only the total.
                failed++;
            }
        }

        return { loaded, failed };
    }

    loadPluginFile(filePath) {
        const resolvedPath = require.resolve(filePath);
        delete require.cache[resolvedPath];

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
                execute: async (sock, message, args, context = {}) => {
                    const target = sock?.sock || sock;
                    const reply = text => target.sendMessage(message.chat, { text: String(text) }, { quoted: message });
                    return definition.run(target, message, args || [], { ...context, reply, sock: target, m: message });
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

        // Silva bundles often include commands CODEX already provides. Keep the
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

    getAllCommands() {
        const categories = {};
        for (const [name, cmd] of this.bot.commands) {
            if (!categories[cmd.category]) categories[cmd.category] = [];
            // Only list primary name entries, not alias duplicates
            if (cmd.name === name) categories[cmd.category].push(cmd);
        }
        return categories;
    }
}

module.exports = CommandHandler;

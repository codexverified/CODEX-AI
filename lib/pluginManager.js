const fs = require('fs-extra');
const path = require('path');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const axios = require('axios');
const { getVar } = require('./utils');

const ROOT = PROJECT_ROOT;
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const API_BASE_DEFAULT = 'https://codex-ai-j8wh.onrender.com';

function getApiBase(bot) {
    return getVar(bot, 'apiBase', API_BASE_DEFAULT).replace(/\/+$/, '');
}

function cleanName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

function pluginPath(name) {
    const clean = cleanName(name);
    if (!clean) throw new Error('Invalid plugin name.');
    return path.join(PLUGINS_DIR, `${clean}.js`);
}

function toRawUrl(input, bot) {
    const url = String(input || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Send a valid http(s) plugin link.');

    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid plugin URL.'); }

    if (parsed.hostname === 'gist.github.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const gistId = parts[1] || parts[0];
        if (!gistId) throw new Error('Invalid GitHub Gist link.');
        return { url: `https://gist.githubusercontent.com/${parts[0]}/${gistId}/raw`, format: 'text' };
    }

    if (parsed.hostname === 'github.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const blob = parts.indexOf('blob');
        if (parts.length >= 5 && blob === 2) {
            const owner = parts[0];
            const repo = parts[1];
            const branch = parts[3];
            const file = parts.slice(4).join('/');
            return { url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`, format: 'text' };
        }
    }

    // A link copied from our own site's plugin page, e.g.
    // https://<any-domain>/plugins/<id> — that page is HTML for humans,
    // not raw JS, so fetch the plugin's JSON record from our own backend
    // instead and pull the "code" field out of it.
    const pageMatch = parsed.pathname.match(/\/plugins\/([A-Za-z0-9_-]+)\/?$/);
    if (pageMatch) {
        const id = pageMatch[1];
        return { url: `${getApiBase(bot)}/api/plugins/${id}`, format: 'json' };
    }

    return { url, format: 'text' };
}

async function fetchPluginCode(link, bot) {
    const { url, format } = toRawUrl(link, bot);
    const res = await axios.get(url, {
        timeout: 30000,
        responseType: 'text',
        transformResponse: [data => data],
        validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
        throw new Error(`Fetch failed: HTTP ${res.status}`);
    }

    let code;
    if (format === 'json') {
        let parsed;
        try {
            parsed = JSON.parse(res.data);
        } catch {
            throw new Error('Plugin lookup did not return valid JSON.');
        }
        code = String(parsed?.code || '').trim();
        if (!code) throw new Error('That plugin has no code on record.');
    } else {
        code = String(res.data || '').trim();
    }

    if (!code) throw new Error('Plugin link returned empty code.');
    if (!/module\.exports|exports\./.test(code)) {
        throw new Error('Plugin must export a command with module.exports.');
    }

    return { code, url };
}

// Puts bot.commands back exactly as it was (same Map object, same entries).
function restoreRegistry(bot, snapshot) {
    bot.commands.clear();
    for (const [key, value] of snapshot) bot.commands.set(key, value);
}

/**
 * Installs a plugin from a link.
 *   - returns { skipped: true } when that plugin is ALREADY installed — nothing is
 *     downloaded over it, replaced or reloaded, and the caller should say nothing.
 *   - otherwise returns { command, commands, file, source } once it is saved + live.
 * `onName(name)` is called as soon as the plugin's command name is known.
 */
async function saveAndLoad(bot, link, onName) {
    // Same link already installed? Nothing to do — don't even download it.
    try {
        const { url: wantedUrl } = toRawUrl(link, bot);
        const same = listPlugins(bot).find(c => c.source === wantedUrl);
        if (same) return { skipped: true, command: same, source: wantedUrl };
    } catch { /* bad link — fetchPluginCode below reports it properly */ }

    const { code, url } = await fetchPluginCode(link, bot);
    await fs.ensureDir(PLUGINS_DIR);

    // Embed the source link as a leading comment so it survives on disk —
    // command.source used to only exist in memory for the current process,
    // so a restart lost track of where an installed plugin came from and
    // .list could no longer show its link.
    const codeWithSource = `// @source: ${url}\n${code}`;

    const tempPath = path.join(PLUGINS_DIR, `.install-${Date.now()}.js`);
    await fs.writeFile(tempPath, codeWithSource);

    // Loading the temp file registers its command(s), and for a plugin that is
    // already installed that REPLACES the live one — so remember the registry
    // as it was and put it back if this turns out to be a duplicate or fails.
    const snapshot = new Map(bot.commands);
    const dropTemp = async () => {
        try { delete require.cache[require.resolve(tempPath)]; } catch {}
        try { await fs.remove(tempPath); } catch {}
    };

    try {
        const first = bot.commandHandler.loadPluginFile(tempPath);
        // Plugins written as { commands: [...], run } come back as an array.
        const loaded = Array.isArray(first) ? first : [first];
        const command = loaded[0];
        if (!command?.name) throw new Error('Plugin has no command name.');
        if (typeof onName === 'function') { try { await onName(command.name); } catch {} }

        const before = snapshot.get(String(command.name).toLowerCase());
        if (before && !before.__plugin) {
            throw new Error(`Command "${command.name}" already exists as a built-in command.`);
        }

        // Already installed → ignore quietly (leave the installed copy untouched).
        if (before && before.__plugin) {
            restoreRegistry(bot, snapshot);
            await dropTemp();
            return { skipped: true, command: before, source: url };
        }

        const finalPath = pluginPath(command.name);
        await fs.move(tempPath, finalPath, { overwrite: true });
        for (const c of loaded) bot.commandHandler.unloadPlugin(c.name);
        const reloaded = bot.commandHandler.loadPluginFile(finalPath);
        const finalCommands = Array.isArray(reloaded) ? reloaded : [reloaded];
        for (const c of finalCommands) c.source = url;

        return { command: finalCommands[0], commands: finalCommands, file: finalPath, source: url };
    } catch (e) {
        try { restoreRegistry(bot, snapshot); } catch {}
        await dropTemp();
        throw e;
    }
}

async function removePlugin(bot, name) {
    const command = bot.commandHandler.unloadPlugin(name);
    const file = command?.__pluginFile || pluginPath(name);
    await fs.remove(file);
    return command;
}

function listPlugins(bot) {
    // Only plugins downloaded through the external plugin installer carry
    // the source marker. Bundled files in plugins/ remain executable, but
    // they are not counted as website-installed plugins.
    const seen = new Set();
    const plugins = [];
    for (const command of bot.commands.values()) {
        if (!command.__plugin || !command.source || seen.has(command.name)) continue;
        seen.add(command.name);
        plugins.push(command);
    }
    return plugins;
}

module.exports = {
    PLUGINS_DIR,
    cleanName,
    pluginPath,
    toRawUrl,
    saveAndLoad,
    removePlugin,
    listPlugins
};
                    

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { getVar } = require('./utils');

const ROOT = process.cwd();
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

async function saveAndLoad(bot, link, onName) {
    const { code, url } = await fetchPluginCode(link, bot);
    await fs.ensureDir(PLUGINS_DIR);

    // Embed the source link as a leading comment so it survives on disk —
    // command.source used to only exist in memory for the current process,
    // so a restart lost track of where an installed plugin came from and
    // .list could no longer show its link.
    const codeWithSource = `// @source: ${url}\n${code}`;

    const tempPath = path.join(PLUGINS_DIR, `.install-${Date.now()}.js`);
    await fs.writeFile(tempPath, codeWithSource);

    let command;
    try {
        command = bot.commandHandler.loadPluginFile(tempPath);
        // Name is only known once the temp file is parsed — fire here so the
        // caller can print "Installing <name>..." instead of a generic line.
        if (typeof onName === 'function') { try { await onName(command.name); } catch {} }
        const finalPath = pluginPath(command.name);

        if (fs.existsSync(finalPath) && path.resolve(finalPath) !== path.resolve(tempPath)) {
            const existing = bot.commandHandler.getCommand(command.name);
            if (existing && !existing.__plugin) {
                throw new Error(`Command "${command.name}" already exists as a built-in command.`);
            }
            bot.commandHandler.unloadPlugin(command.name);
        }

        await fs.move(tempPath, finalPath, { overwrite: true });
        bot.commandHandler.unloadPlugin(command.name);
        command = bot.commandHandler.loadPluginFile(finalPath);
        command.source = url;

        return { command, file: finalPath, source: url };
    } catch (e) {
        try {
            if (command?.name) bot.commandHandler.unloadPlugin(command.name);
            await fs.remove(tempPath);
        } catch {}
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
    // Only plugins that actually came in through .install (they carry the
    // "// @source: <url>" marker read into command.source by loadPluginFile).
    // Every file that ships in plugins/ also gets __plugin = true, so
    // filtering on that alone used to list the ~180 built-in plugin files
    // right alongside anything the owner installed themselves — this keeps
    // .plugins showing only what was actually installed.
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

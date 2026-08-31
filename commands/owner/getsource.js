const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const EXCLUDE_DIRS = new Set([
    'node_modules', '.npm', '.git', 'session', 'sessions', 'auth_info_baileys',
    'tmp', 'temp', 'cache', '.cache', 'dist', 'build', '.next',
    '__pycache__', '.vscode', '.idea', 'logs', 'log', 'backup', 'backups',
    'uploads', 'downloads',
]);

const EXCLUDE_FILES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.env', '.env.local', '.env.production', '.env.development',
    'Thumbs.db', '.DS_Store',
]);

function shouldExclude(relativePath) {
    const parts = relativePath.split(path.sep);
    if (parts.some(p => EXCLUDE_DIRS.has(p))) return true;
    const fileName = path.basename(relativePath);
    if (EXCLUDE_FILES.has(fileName)) return true;
    if (/\.log$|\.tmp$|\.temp$/.test(fileName)) return true;
    return false;
}

function collectFiles(dir, base, rel = '', out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { return out; }

    for (const entry of entries) {
        const full = path.join(dir, entry);
        const relPath = rel ? path.join(rel, entry) : entry;
        if (shouldExclude(relPath)) continue;

        let stat;
        try { stat = fs.lstatSync(full); } catch { continue; }

        if (stat.isDirectory()) {
            collectFiles(full, base, relPath, out);
        } else if (stat.isFile()) {
            out.push({ path: relPath, full });
        }
    }
    return out;
}

module.exports = {
    name: 'getsource',
    category: 'owner',
    reactions: { start: '📦' },
    description: 'Zip and send the current deployment source code (excludes node_modules, sessions, .env, lockfiles).',
    ownerOnly: true,

    async execute(bot, m) {
        try {
            await m.reply('🔄 Collecting source files...');

            const cwd = process.cwd();
            const files = collectFiles(cwd, cwd);

            if (files.length === 0) return await m.reply('❌ No files found to zip.');

            const zip = new AdmZip();
            let ok = 0;
            for (const f of files) {
                try {
                    zip.addLocalFile(f.full, path.dirname(f.path) === '.' ? '' : path.dirname(f.path));
                    ok++;
                } catch (e) {
                    // skip unreadable file
                }
            }

            const buffer = zip.toBuffer();
            const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            await bot.sock.sendMessage(m.chat, {
                document: buffer,
                mimetype: 'application/zip',
                fileName: `deployment_source_${timestamp}.zip`,
                caption: `📦 *Deployment Source Code*\n\nFiles: ${ok}\nSize: ${sizeMB} MB\n\n🚫 Excluded: node_modules, sessions, .env, lockfiles, logs, etc.`
            });
        } catch (err) {
            await m.reply(`❌ Failed to get source code: ${err.message}`);
        }
    },
};

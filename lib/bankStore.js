const fs   = require('fs-extra');
const path = require('path');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');


const DB = path.join(PROJECT_ROOT, 'database/bank.json');

const readDB = () => {
    try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
    catch { return {}; }
};

const saveDB = (d) => {
    fs.ensureDirSync(path.dirname(DB));
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
};

function get() {
    return readDB();
}

function set(details) {
    saveDB(details);
}

module.exports = { get, set };

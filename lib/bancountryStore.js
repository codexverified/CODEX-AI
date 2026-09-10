const fs   = require('fs-extra');
const path = require('path');
const { normalizeCode } = require('./countryCodes');

// Anchored to the project root (not process.cwd()) so persistent data lands
// in the same place regardless of the directory the process was launched
// from (e.g. a host that cds elsewhere before running `node index.js`).
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const DB = path.join(PROJECT_ROOT, 'database/bancountry.json');
const readDB = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; } };
const saveDB = (d) => { fs.ensureDirSync(path.dirname(DB)); fs.writeFileSync(DB, JSON.stringify(d, null, 2)); };

function add(groupId, code) {
    const db = readDB();
    if (!db[groupId]) db[groupId] = [];
    const clean = normalizeCode(code);
    if (!clean) return null;
    if (!db[groupId].includes(clean)) db[groupId].push(clean);
    saveDB(db);
    return clean;
}

function remove(groupId, code) {
    const db = readDB();
    if (!db[groupId]) return false;
    const clean = normalizeCode(code);
    const before = db[groupId].length;
    db[groupId] = db[groupId].filter(c => c !== clean);
    saveDB(db);
    return db[groupId].length !== before;
}

function clear(groupId) {
    const db = readDB();
    delete db[groupId];
    saveDB(db);
}

function list(groupId) {
    const db = readDB();
    return db[groupId] || [];
}

function isBanned(groupId, code) {
    const db = readDB();
    return (db[groupId] || []).includes(normalizeCode(code));
}

module.exports = { add, remove, clear, list, isBanned, readDB };

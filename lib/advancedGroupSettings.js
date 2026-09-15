// Advanced Group AntiSystems Settings — .low / .smart / .hyper
// Mass-toggles every per-group anti-system (same enabled/action/maxWarns
// shape as .antilink/.antispam/etc). Anti-GC-Status is pinned to 'kick'.
// Anti-Fake has no delete action, so LOW leaves it unchanged.
const fs = require('fs-extra');
const path = require('path');


const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const SYSTEMS = [
  { key: 'antilink',         label: 'Anti-Link',          file: 'antilink.json',         default: { enabled: true,  action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antispam',         label: 'Anti-Spam',          file: 'antispam.json',         default: { enabled: true,  action: 'warn',   maxWarns: 3, limit: 5, cooldown: 10000 }, supportsDelete: true },
  { key: 'antitag',          label: 'Anti-Tag',           file: 'antitag.json',          default: { enabled: true,  action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antigame',         label: 'Anti-Game',          file: 'antigame.json',         default: { enabled: false, action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antigroupmention', label: 'Anti-Group-Mention', file: 'antigroupmention.json', default: { enabled: false, action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antigcstatus',     label: 'Anti-GC-Status',     file: 'antigcstatus.json',     default: { enabled: false, action: 'warn',   maxWarns: 3 },                         supportsDelete: true, forceAction: 'kick' },
  { key: 'antibot',          label: 'Anti-Bot',           file: 'antibot.json',          default: { enabled: false, action: 'kick',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antiword',         label: 'Anti-Word',          file: 'antiword.json',         default: { enabled: false, words: [], action: 'warn', maxWarns: 3 },                supportsDelete: true },
  { key: 'antiscam',         label: 'Anti-Scam',          file: 'antiscam.json',         default: { enabled: false, action: 'delete', maxWarns: 3 },                         supportsDelete: true },
  { key: 'antibeg',          label: 'Anti-Beg',           file: 'antibeg.json',          default: { enabled: false, action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antiforwarding',   label: 'Anti-Forwarding',    file: 'antiforwarding.json',   default: { enabled: false, action: 'warn',   maxWarns: 3 },                         supportsDelete: true },
  { key: 'antifake',         label: 'Anti-Fake',          file: 'antifake.json',         default: { enabled: false, action: 'kick',   maxWarns: 3 },                         supportsDelete: false },
];

function dbPath(file) {
  return path.join(PROJECT_ROOT, 'database', file);
}

function loadDB(file) {
  try {
    return JSON.parse(fs.readFileSync(dbPath(file), 'utf8'));
  } catch {
    return {};
  }
}

function saveDB(file, db) {
  fs.ensureDirSync(path.join(PROJECT_ROOT, 'database'));
  fs.writeFileSync(dbPath(file), JSON.stringify(db, null, 2));
}

// Per-group on/off switch for .low/.smart/.hyper themselves.
const TOGGLE_FILES = { low: 'lowmode.json', smart: 'smartmode.json', hyper: 'hypermode.json' };

function isModeEnabled(groupId, mode) {
  const db = loadDB(TOGGLE_FILES[mode]);
  return db[groupId]?.enabled !== false;
}

function setModeEnabled(groupId, mode, enabled) {
  const db = loadDB(TOGGLE_FILES[mode]);
  db[groupId] = { enabled };
  saveDB(TOGGLE_FILES[mode], db);
}


/**
 * @param {string} groupId
 * @param {'low'|'smart'|'hyper'} mode
 * @param {number} [maxWarns] only used by 'smart' — clamped to 1-3, default 3
 * @returns {{ applied: string[], skipped: string[], warns: number }}
 */
function applyMode(groupId, mode, maxWarns = 3) {
  const warns = Math.min(Math.max(parseInt(maxWarns) || 3, 1), 3);
  const applied = [];
  const skipped = [];

  for (const sys of SYSTEMS) {
    const db = loadDB(sys.file);
    const entry = { ...sys.default, ...(db[groupId] || {}) };

    entry.enabled = true;

    if (sys.forceAction) {
      entry.action = sys.forceAction;
    } else if (mode === 'low') {
      if (sys.supportsDelete) {
        entry.action = 'delete';
      } else {
        skipped.push(sys.label);
      }
    } else if (mode === 'smart') {
      entry.action = 'warn';
      entry.maxWarns = warns;
    } else if (mode === 'hyper') {
      entry.action = 'kick';
    }

    db[groupId] = entry;
    saveDB(sys.file, db);
    applied.push(sys.label);
  }

  return { applied, skipped, warns };
}

module.exports = { SYSTEMS, applyMode, isModeEnabled, setModeEnabled };

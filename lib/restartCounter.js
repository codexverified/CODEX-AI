'use strict';

// Real, persisted "how many times has this process been started/restarted"
// counter — survives across actual process restarts (panel Restart, a
// crash+relaunch, a redeploy), unlike bot._connGeneration in connection.js
// which is in-memory only and resets to 0 every single time the process
// itself starts, making it useless for exactly this purpose.

const fs = require('fs-extra');
const path = require('path');

const COUNTER_PATH = path.join(__dirname, '..', 'database', 'restarts.json');

// Increments and persists the counter, returning the new total. Call this
// once per process startup (see app.js) — every call bumps it, so it must
// only ever be called once per real boot.
function bumpRestartCount() {
    let count = 0;
    try {
        count = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'))?.count || 0;
    } catch {}
    count += 1;
    try {
        fs.mkdirSync(path.dirname(COUNTER_PATH), { recursive: true });
        fs.writeFileSync(COUNTER_PATH, JSON.stringify({ count }));
    } catch (err) {
        console.error('[restartCounter] failed to persist:', err.message);
    }
    return count;
}

function getRestartCount() {
    try {
        return JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'))?.count || 0;
    } catch {
        return 0;
    }
}

module.exports = { bumpRestartCount, getRestartCount };

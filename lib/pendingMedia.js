/**
 * pendingMedia — tracks a "what should I do with this?" choice while CODEX AI
 * waits for the user's next message (describe / sticker / gif / yes for song-ID).
 * In-memory only, keyed by `${chat}:${sender}`, auto-expires after 5 minutes.
 *
 * Entries were previously only cleaned up lazily, on get() — if a user never
 * sent a follow-up message, their expired entry just sat in the Map forever,
 * so on a busy bot with many one-off chatbot interactions the Map could grow
 * without bound. A periodic sweep now proactively drops expired entries
 * regardless of whether they're ever read again.
 */
const store = new Map();
const TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function set(key, value) {
    store.set(key, { ...value, expires: Date.now() + TTL_MS });
}

function get(key) {
    const v = store.get(key);
    if (!v) return null;
    if (Date.now() > v.expires) { store.delete(key); return null; }
    return v;
}

function clear(key) {
    store.delete(key);
}

let _sweepTimer = null;
function _startSweep() {
    if (_sweepTimer) return;
    _sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, value] of store) {
            if (now > value.expires) store.delete(key);
        }
    }, SWEEP_INTERVAL_MS);
    _sweepTimer.unref?.();
}
_startSweep();

module.exports = { set, get, clear };

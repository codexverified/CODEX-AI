'use strict';

// In-memory "who's online" tracker, fed by the 'presence.update' socket
// event wired up in lib/connection.js. Deliberately NOT persisted to disk
// — "who's online right now" has no lasting value across a restart.
//
// Important limitation, inherent to WhatsApp itself and not something any
// code here can work around: presence is only ever reported for a chat
// the bot has actively subscribed to, and only for participants who
// haven't hidden their online/last-seen status in their own privacy
// settings. A participant with no entry here simply means no presence
// event has been observed for them yet — that's expected for a lot of
// real users, not a bug.

const groups = new Map();        // groupJid -> Map(participantJid -> { lastOnlineAt, lastStatus, lastUpdate })
const subscribedAt = new Map();  // groupJid -> last time presenceSubscribe() was called for it

// WhatsApp presence subscriptions aren't permanent — refresh periodically
// rather than once, so long-running groups keep getting updates.
const RESUBSCRIBE_EVERY_MS = 10 * 60 * 1000;

const ONLINE_STATUSES = new Set(['available', 'composing', 'recording']);

function recordPresence(groupJid, participantJid, presenceType) {
    if (!groupJid || !participantJid || !presenceType) return;
    let g = groups.get(groupJid);
    if (!g) { g = new Map(); groups.set(groupJid, g); }

    const now = Date.now();
    const entry = g.get(participantJid) || { lastOnlineAt: 0, lastStatus: null, lastUpdate: 0 };
    entry.lastStatus = presenceType;
    entry.lastUpdate = now;
    if (ONLINE_STATUSES.has(presenceType)) entry.lastOnlineAt = now;
    g.set(participantJid, entry);
}

// Everyone seen online at least once within the last maxAgeMs.
function getRecentlyOnline(groupJid, maxAgeMs) {
    const g = groups.get(groupJid);
    if (!g) return [];
    const cutoff = Date.now() - maxAgeMs;
    const out = [];
    for (const [jid, entry] of g.entries()) {
        if (entry.lastOnlineAt >= cutoff) out.push({ jid, lastOnlineAt: entry.lastOnlineAt });
    }
    return out.sort((a, b) => b.lastOnlineAt - a.lastOnlineAt);
}

// Everyone from participantJids who has NOT been seen online within the
// last minAgeMs — includes people never observed online at all (their
// lastOnlineAt is reported as 0 / "no presence data yet").
function getOffline(groupJid, minAgeMs, participantJids) {
    const g = groups.get(groupJid);
    const cutoff = Date.now() - minAgeMs;
    const out = [];
    for (const jid of participantJids) {
        const entry = g?.get(jid);
        const lastOnlineAt = entry?.lastOnlineAt || 0;
        if (lastOnlineAt < cutoff) out.push({ jid, lastOnlineAt });
    }
    return out.sort((a, b) => a.lastOnlineAt - b.lastOnlineAt);
}

async function ensureSubscribed(sock, groupJid) {
    if (!sock?.presenceSubscribe || !groupJid) return;
    const last = subscribedAt.get(groupJid) || 0;
    if (Date.now() - last < RESUBSCRIBE_EVERY_MS) return;
    subscribedAt.set(groupJid, Date.now());
    try { await sock.presenceSubscribe(groupJid); } catch {}
}

module.exports = { recordPresence, getRecentlyOnline, getOffline, ensureSubscribed };

'use strict';

// Tracks, per group, the last time each participant actually sent a
// message — fed live from messageHandler.js on every incoming group
// message. This is what makes .listonline/.listoffline actually accurate:
// WhatsApp's presence broadcasts are hidden by a lot of users' own privacy
// settings and only ever cover chats explicitly subscribed to, but a
// message someone actually sent is unambiguous and always visible to a
// bot that's a member of the group — no privacy setting hides that.
//
// In-memory only, deliberately not persisted to disk — resets on restart,
// same as presence would. That's fine; this only ever answers "recently"
// style questions anyway.

const groups = new Map(); // groupJid -> Map(participantJid -> lastMessageAtMs)

function recordActivity(groupJid, participantJid) {
    if (!groupJid || !participantJid) return;
    let g = groups.get(groupJid);
    if (!g) { g = new Map(); groups.set(groupJid, g); }
    g.set(participantJid, Date.now());
}

// Everyone who has sent a message within the last maxAgeMs.
function getRecentlyActive(groupJid, maxAgeMs) {
    const g = groups.get(groupJid);
    if (!g) return [];
    const cutoff = Date.now() - maxAgeMs;
    const out = [];
    for (const [jid, lastMessageAt] of g.entries()) {
        if (lastMessageAt >= cutoff) out.push({ jid, lastMessageAt });
    }
    return out;
}

// Everyone from participantJids whose last message (if any) is older than
// minAgeMs — includes people never observed sending a message at all
// (lastMessageAt: 0).
function getInactive(groupJid, minAgeMs, participantJids) {
    const g = groups.get(groupJid);
    const cutoff = Date.now() - minAgeMs;
    const out = [];
    for (const jid of participantJids) {
        const lastMessageAt = g?.get(jid) || 0;
        if (lastMessageAt < cutoff) out.push({ jid, lastMessageAt });
    }
    return out;
}

module.exports = { recordActivity, getRecentlyActive, getInactive };
      

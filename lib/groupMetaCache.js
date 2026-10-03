/**
 * C☯︎DEX-AI — Shared group metadata cache
 *
 * sock.groupMetadata() is a live request to WhatsApp that returns (and has to
 * parse) the FULL member list. Several parts of the bot used to call it on
 * every single incoming group message — the AFK check, the admin checks, the
 * plugin wrapper, Baileys' own send path — so every group the bot joined added
 * a stream of those requests, all waited on one at a time in the message
 * queue. That is what made the bot crawl (and misbehave) as soon as it was
 * added to groups.
 *
 * Everything now goes through get():
 *   • one real fetch per group per 5 minutes, then served from memory
 *   • simultaneous callers share ONE in-flight request
 *   • a hung request is cut off after 10s (the queue never waits longer)
 *   • if a refresh fails, the last known copy is used instead of an error
 *   • a group is marked stale the moment its members/settings change
 *     (group-participants.update / groups.update / groups.upsert), so admin
 *     changes still show up immediately
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 300;
const FETCH_TIMEOUT_MS = 10 * 1000;

const cache = new Map();      // groupJid -> { meta, at }   (at = 0 means "stale, refetch")
const inflight = new Map();   // groupJid -> Promise<meta>
const attached = new WeakSet();
let lastSock = null;

function invalidate(jid) {
    const e = cache.get(jid);
    if (e) e.at = 0;          // keep the data as an error fallback, but force a refetch
}

function clear() { cache.clear(); inflight.clear(); }

function _attach(sock) {
    if (lastSock && lastSock !== sock) clear();   // new socket (reconnect): start clean
    lastSock = sock;
    if (!sock?.ev?.on || attached.has(sock)) return;
    attached.add(sock);
    sock.ev.on('group-participants.update', (u) => { if (u?.id) invalidate(u.id); });
    sock.ev.on('groups.update', (list) => { for (const g of list || []) if (g?.id) invalidate(g.id); });
    sock.ev.on('groups.upsert', (list) => { for (const g of list || []) if (g?.id) invalidate(g.id); });
}

function _store(jid, meta) {
    cache.delete(jid);
    cache.set(jid, { meta, at: Date.now() });
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Group metadata for `jid`. `botOrSock` can be the bot (bot.sock) or the socket itself. */
async function get(botOrSock, jid) {
    const sock = botOrSock?.sock || botOrSock;
    if (!sock || typeof sock.groupMetadata !== 'function' || !jid) throw new Error('groupMetadata unavailable');
    _attach(sock);

    const hit = cache.get(jid);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;

    let p = inflight.get(jid);
    if (!p) {
        p = Promise.race([
            Promise.resolve().then(() => sock.groupMetadata(jid)),
            new Promise((_, reject) => {
                const t = setTimeout(() => reject(new Error('groupMetadata timed out')), FETCH_TIMEOUT_MS);
                t.unref?.();
            }),
        ]).then((meta) => { _store(jid, meta); return meta; });
        inflight.set(jid, p);
        const done = () => { if (inflight.get(jid) === p) inflight.delete(jid); };
        p.then(done, done);
    }

    try { return await p; }
    catch (err) {
        if (hit) return hit.meta;   // refresh failed → last known copy beats an error
        throw err;
    }
}

module.exports = { get, invalidate, clear, TTL_MS };

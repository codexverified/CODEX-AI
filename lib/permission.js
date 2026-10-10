/**
 * C☯︎DEX-AI — Permission System
 * LID-safe owner / sudo / admin checks (ported from C☯︎DEX-AI V3.0)
 *
 * Owner is identified by:
 *   1. msg.key.fromMe === true  (always means the owner sent this — done in messageHandler)
 *   2. Digit-only tail-match of sender JID vs config.owner.number
 *
 * This is LID-safe: strips everything except digits and compares the last 10
 * digits, which handles all JID formats: @s.whatsapp.net, @lid, :device@ suffixes.
 */

const fs = require('fs-extra');

class Permission {
    constructor(bot) {
        this.bot = bot;
        // groupMetadata() is a real API round-trip to WhatsApp's servers.
        // isAdmin()/isBotAdmin() previously called it fresh on EVERY
        // permission check — which fires on every command in every group,
        // and even on plain messages via anti-systems' isGroupAdmin() check.
        // On a busy group that's a network call per message, which is slow
        // and can occasionally hang, stalling whatever awaited it. A short
        // TTL cache means repeated checks in the same group within the
        // window reuse the same metadata instead of re-fetching.
        this._groupMetaCache = new Map(); // groupJid -> { meta, at }
        this._ixCache = new WeakMap();    // meta object -> participant lookup index
        // 0 = no private copy here: lib/groupMetaCache.js is the single (5 min,
        // invalidated-on-change) cache, so admin checks stay fast AND current.
        this._GROUP_META_TTL_MS = 0;
    }

    async _getGroupMetadata(groupJid) {
        const cached = this._groupMetaCache.get(groupJid);
        if (cached && Date.now() - cached.at < this._GROUP_META_TTL_MS) {
            return cached.meta;
        }
        // BUG (was): this awaited bot.sock.groupMetadata() with no timeout
        // at all, despite the comment above already flagging that the call
        // "can occasionally hang, stalling whatever awaited it". groupMetadata()
        // is a real request/response round-trip to WhatsApp's servers
        // (sock.query() under the hood, and this socket is deliberately
        // created with defaultQueryTimeoutMs left undefined — see
        // connection.js). On a socket that has gone quietly stale (looks
        // open, isn't really talking to WhatsApp any more — typically after
        // a long idle stretch or a reconnect that didn't fully settle) that
        // promise never resolves AND never rejects.
        //
        // isAdmin()/isBotAdmin() below are awaited UNCONDITIONALLY on every
        // single group command dispatch in messageHandler.js, before any
        // command-specific permission check even runs — so one stuck query
        // here silently froze the ENTIRE command pipeline forever: no reply,
        // no error, nothing, until the process was restarted and a fresh
        // socket (with fresh promises) replaced the dead one. That's the
        // "bot won't respond to any command until I redeploy" bug.
        //
        // lib/antiSystems.js already guards its own groupMetadata-backed
        // calls this exact same way, for this exact same reason (see the
        // Promise.race around _isBotAdmin() in checkAll()/checkGroupJoin())
        // — which is also why welcome/goodbye messages kept working while
        // commands didn't. This brings isAdmin()/isBotAdmin() in line with
        // that existing pattern instead of leaving the busiest permission
        // check in the whole bot as the one unprotected call site.
        // Fast path: fresh shared-cache hit for THIS socket — no promise race and
        // no 5s timer needed (this runs for every group message/command).
        const fast = require('./groupMetaCache').peek(this.bot, groupJid);
        if (fast) return fast;

        // The 5s guard timer is always cleared; previously every call left a
        // live 5s timer + closure behind even after the metadata resolved.
        let guard;
        let meta;
        try {
            meta = await Promise.race([
                require('./groupMetaCache').get(this.bot, groupJid),
                new Promise((_, reject) => {
                    guard = setTimeout(() => reject(new Error('groupMetadata timed out')), 5000);
                }),
            ]);
        } finally {
            clearTimeout(guard);
        }
        // Only a genuinely resolved result gets cached — a timeout/failure
        // must NOT be cached, or it would lock in a false "not admin" for
        // a full TTL window over what's likely just a transient blip.
        this._groupMetaCache.set(groupJid, { meta, at: Date.now() });
        return meta;
    }

    // ── Strip everything except digits from any JID / number string ───────────
    _phone(jid) {
        if (!jid) return '';
        return String(jid)
            .replace(/:[0-9]+@/, '@')   // strip device suffix
            .split('@')[0]
            .replace(/[^0-9]/g, '');
    }

    // ── Normalize to clean @s.whatsapp.net JID ────────────────────────────────
    _clean(jid) {
        if (!jid) return '';
        const num = this._phone(jid);
        return num ? num + '@s.whatsapp.net' : '';
    }

    // ── Digit tail-match — handles country-code prefix differences ────────────
    // Compares last 10 digits of both numbers (min 8 to avoid false positives)
    _numMatch(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const ta = a.slice(-10), tb = b.slice(-10);
        return ta.length >= 8 && tb.length >= 8 && ta === tb;
    }

    // ── Owner check ───────────────────────────────────────────────────────────
    // Works in DM and GROUP, with @lid or @s.whatsapp.net sender JIDs.
    isOwner(jid) {
        if (!jid) return false;

        // Owner number from config — supports both { number: '...' } and plain string
        const ownerRaw = (typeof this.bot.config.owner === 'object')
            ? (this.bot.config.owner.number || '')
            : (this.bot.config.owner || '');

        const ownerNum  = this._phone(ownerRaw);
        if (!ownerNum) return false;

        const senderNum = this._phone(jid);

        return senderNum === ownerNum || this._numMatch(senderNum, ownerNum);
    }

    // ── Match a single stored entry against any of the sender JID forms ───────
    // WhatsApp's @lid rollout means the sender can arrive as a phone JID
    // (@s.whatsapp.net) OR as a @lid whose digits differ entirely from the
    // phone number. We therefore match a stored entry if it equals/tail-matches
    // ANY of the provided sender identifiers (resolved phone + raw participant).
    _matchAny(storedNum, jids) {
        if (!storedNum) return false;
        return jids.some(j => {
            const n = this._phone(j);
            return n && (n === storedNum || this._numMatch(n, storedNum));
        });
    }

    // ── Mod check (config.mods array) ─────────────────────────────────────────
    // MOD = highest delegated tier: mods can use EVERY command, including
    // owner-only commands. Accepts multiple sender JID forms for LID safety.
    isMod(...jids) {
        jids = jids.flat().filter(Boolean);
        if (jids.some(j => this.isOwner(j))) return true;
        return (this.bot.config.mods || []).some(m =>
            this._matchAny(this._phone(m), jids)
        );
    }

    // ── Sudo check (database/sudo.json + config.sudo array) ──────────────────
    // SUDO = elevated tier that can use every command EXCEPT owner-only ones.
    // A mod is always also treated as sudo (mods outrank sudo). Accepts
    // multiple sender JID forms for LID safety.
    isSudo(...jids) {
        jids = jids.flat().filter(Boolean);
        if (!jids.length) return false;
        if (this.isMod(jids)) return true; // owner + mod both count as sudo

        // Check sudo.json DB (written by .sudo add / sudo.js command)
        let sudoData = {};
        try { sudoData = JSON.parse(fs.readFileSync('./database/sudo.json', 'utf8')); } catch {}

        // DB format: { users: ['2349...', ...] }  OR legacy { '2349...': true }
        const users = Array.isArray(sudoData.users)
            ? sudoData.users
            : Object.keys(sudoData).filter(k => k !== 'users');

        if (users.some(k => this._matchAny(this._phone(k), jids))) return true;

        // Also check config.sudo array (legacy / static list)
        return (this.bot.config.sudo || []).some(s =>
            this._matchAny(this._phone(s), jids)
        );
    }

    // ── Participant index ─────────────────────────────────────────────────────
    // isAdmin()/isBotAdmin() used to scan EVERY participant (4 regex-heavy
    // _phone() calls each) on every call — O(members) of synchronous work per
    // message on the event loop. This builds, once per metadata object, two
    // lookup maps that reproduce the exact same matching rules (_numMatch:
    // exact digits, or equal last-10 digits when both have >= 8 digits) and
    // the same "first matching participant wins" result.
    _participantIndex(meta) {
        const parts = meta.participants;
        let ix = this._ixCache.get(meta);
        if (ix && ix.parts === parts && ix.len === parts.length) return ix;
        const exact = new Map();
        const tail = new Map();
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const admin = p.admin === 'admin' || p.admin === 'superadmin';
            for (const raw of [p.id, p.lid, p.jid, p.phoneNumber]) {
                const n = this._phone(raw);
                if (!n) continue;
                if (!exact.has(n)) exact.set(n, { i, admin });
                if (n.length >= 8) {
                    const t = n.slice(-10);
                    if (!tail.has(t)) tail.set(t, { i, admin });
                }
            }
        }
        ix = { parts, len: parts.length, exact, tail };
        this._ixCache.set(meta, ix);
        return ix;
    }

    // true/false = matched participant is/isn't admin; false when nobody matches.
    _lookupAdmin(meta, candidates) {
        if (!Array.isArray(meta?.participants)) return false;
        const { exact, tail } = this._participantIndex(meta);
        let best = null;
        for (const c of candidates) {
            const e = exact.get(c);
            if (e && (!best || e.i < best.i)) best = e;
            if (c.length >= 8) {
                const t = tail.get(c.slice(-10));
                if (t && (!best || t.i < best.i)) best = t;
            }
        }
        return best ? best.admin : false;
    }

    // ── Group admin check ─────────────────────────────────────────────────────
    // LID-safe: checks the participant entry's .id AND any .lid/.jid/.phoneNumber
    // fields against BOTH the resolved (phone-preferred) userJid and the raw
    // participant JID, since WhatsApp's @lid rollout means group participant
    // lists and sender JIDs don't always agree on which identifier they use.
    async isAdmin(groupJid, userJid, rawJid) {
        try {
            const meta = await this._getGroupMetadata(groupJid);
            const candidates = [this._phone(userJid), this._phone(rawJid)].filter(Boolean);
            if (!candidates.length) return false;
            return this._lookupAdmin(meta, candidates);
        } catch { return false; }
    }

    // ── Bot self check ─────────────────────────────────────────────────────────
    // Does this jid refer to the bot's OWN number/lid? Used everywhere a
    // moderation action (warn/kick/delete) must never be allowed to target
    // the bot itself — e.g. .warn being used against the bot by mistake, or
    // an anti-system flagging the bot's own tagged mention.
    isBotSelf(jid) {
        if (!jid) return false;
        const num = this._phone(jid);
        if (!num) return false;
        const botCandidates = [
            this._phone(this.bot.sock?.user?.id),
            this._phone(this.bot.sock?.user?.lid),
        ].filter(Boolean);
        return botCandidates.some(c => c === num || this._numMatch(c, num));
    }

    // ── Bot admin check ───────────────────────────────────────────────────────
    async isBotAdmin(groupJid) {
        try {
            const meta = await this._getGroupMetadata(groupJid);
            const botCandidates = [
                this._phone(this.bot.sock.user?.id),
                this._phone(this.bot.sock.user?.lid),
            ].filter(Boolean);
            return this._lookupAdmin(meta, botCandidates);
        } catch { return false; }
    }
}

module.exports = Permission;


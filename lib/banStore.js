/**
 * C☯︎DEX-AI — Ban engine
 *
 * .ban / .unban stop a user from using the bot at all. While someone is banned
 * the bot is completely SILENT to them — no reply, no reaction, no error, no
 * hint that the bot saw the message (see the BAN GATE in lib/messageHandler.js).
 * Bans are GLOBAL — one switch covers every group and DM the bot is in.
 *
 * Timing is built on the same timer engine the permit system uses
 * (lib/mute-core.js), so every permit-style timer works here too:
 *   .ban @user              → banned until .unban
 *   .ban @user 2h           → banned now, ends after 2h
 *   .ban @user after 2h     → ban starts in 2h
 *   .ban @user after 2h for 1h → starts in 2h, lasts 1h
 *   .sch -ban @user 6pm to 9pm daily → banned every day inside that window
 * State is always computed from timestamps / the clock, so it is exact; the
 * timer jobs only announce the start/end and tidy up expired entries.
 *
 * Storage: database/ban.json
 *   users:     { <primaryKey>: { jid, keys[], startsAt, expiresAt, by, at } }
 *   schedules: { <primaryKey>: { jid, keys[] } }   (users with a daily window)
 * `keys` holds every known identity of the person (phone JID and @lid), so the
 * ban still matches whichever form WhatsApp reports the sender as.
 */

const fs   = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const DB = path.join(PROJECT_ROOT, 'database/ban.json');

const RECURRING_TYPE = 'sch-ban';   // daily windows, stored in recurringSchedules.json
const TIMER_CHAT     = 'ban';       // pseudo chat key for one-time timer jobs / windows
const TZ             = 'Africa/Lagos'; // same zone as .sch / .permit

// ── identity helpers ─────────────────────────────────────────────────────────
// Same normalisation as lib/muteStore.js (digits-only + @s.whatsapp.net).
function keyOf(jid) {
    if (!jid) return '';
    const digits = String(jid).replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
    return digits ? digits + '@s.whatsapp.net' : '';
}

function keysOf(list) {
    return [...new Set((list || []).map(keyOf).filter(Boolean))];
}

/** Every known JID form (phone + @lid) of one user, when WhatsApp can tell us. */
async function resolveForms(bot, jid) {
    const clean = String(jid || '').replace(/:[0-9]+@/, '@');
    const forms = new Set(clean ? [clean] : []);
    const lidMap = bot?.sock?.signalRepository?.lidMapping;
    try {
        if (clean.endsWith('@lid') && lidMap?.getPNForLID) {
            const pn = await lidMap.getPNForLID(clean);
            if (pn) forms.add(String(pn).replace(/:[0-9]+@/, '@'));
        } else if (clean.endsWith('@s.whatsapp.net') && lidMap?.getLIDForPN) {
            const lid = await lidMap.getLIDForPN(clean);
            if (lid) forms.add(String(lid).replace(/:[0-9]+@/, '@'));
        }
    } catch {}
    return [...forms];
}

/**
 * Works out who a .ban / .unban / .sch -ban command is aimed at: a tagged user,
 * the author of the replied-to message, or a phone number typed in the command.
 * Returns { jid, forms, rest } (rest = the other words, e.g. the time part)
 * or null when no target was given.
 */
async function targetFromMessage(bot, m, args) {
    const { getTarget } = require('./getTarget');
    let jid = getTarget(m);
    const rest = (args || []).filter(a => !String(a).startsWith('@'));
    if (!jid) {
        const i = rest.findIndex(a => /^\+?\d{7,}$/.test(a));
        if (i >= 0) {
            jid = `${rest[i].replace(/\D/g, '')}@s.whatsapp.net`;
            rest.splice(i, 1);
        }
    }
    if (!jid) return null;
    return { jid, forms: await resolveForms(bot, jid), rest };
}

/** Why this user can never be banned (owner / mods / the bot itself), or null. */
function protectedReason(bot, forms) {
    try {
        if ((forms || []).some(f => bot.permission.isMod(f))) return "You can't ban the owner or a mod.";
        const me = [bot.sock?.user?.id, bot.sock?.user?.lid].map(keyOf).filter(Boolean);
        if (keysOf(forms).some(k => me.includes(k))) return "I can't ban myself.";
    } catch {}
    return null;
}

// ── storage ──────────────────────────────────────────────────────────────────
let _snap = null, _snapAt = 0;
let _win  = null, _winAt  = 0;

function load() {
    let d = {};
    try { d = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch {}
    if (!d || typeof d !== 'object') d = {};
    if (!d.users || typeof d.users !== 'object') d.users = {};
    if (!d.schedules || typeof d.schedules !== 'object') d.schedules = {};
    return d;
}

function save(d) {
    fs.ensureDirSync(path.dirname(DB));
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
    _snap = d; _snapAt = Date.now();
}

// Hot path (checked for every incoming message): short cache.
function snapshot() {
    if (_snap && Date.now() - _snapAt < 2000) return _snap;
    _snap = load(); _snapAt = Date.now();
    return _snap;
}

function windows() {
    if (_win && Date.now() - _winAt < 5000) return _win;
    try { _win = require('./mute-core').listRecurringByType(RECURRING_TYPE); }
    catch { _win = []; }
    _winAt = Date.now();
    return _win;
}

/** Drop caches (call after touching the recurring DB from outside). */
function touch() { _snap = null; _win = null; }

// ── time helpers ─────────────────────────────────────────────────────────────
function lagosMinutes(now = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(now));
    const h  = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
    const mi = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return h * 60 + mi;
}

function inWindow(rec, now = Date.now()) {
    const from = rec.timeFrom.hour * 60 + rec.timeFrom.minute;
    const to   = rec.timeTo.hour * 60 + rec.timeTo.minute;
    if (from === to) return false;
    const cur = lagosMinutes(now);
    return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to); // handles 10pm → 2am
}

const hhmm = t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;

function activeEntry(e, now) {
    return !!e && (!e.startsAt || now >= e.startsAt) && (!e.expiresAt || now < e.expiresAt);
}

const intersects = (a, b) => a.some(k => b.includes(k));

// ── the check used by messageHandler ─────────────────────────────────────────
/** True when ANY of the given JIDs belongs to someone who is banned right now. */
function isBanned(candidates) {
    const keys = keysOf(candidates);
    if (!keys.length) return false;
    const d   = snapshot();
    const now = Date.now();

    for (const e of Object.values(d.users)) {
        if (intersects(e.keys || [], keys) && activeEntry(e, now)) return true;
    }
    const wins = windows();
    for (const r of wins) {
        const s = d.schedules[r.target];
        if (s && intersects(s.keys || [], keys) && inWindow(r, now)) return true;
    }
    return false;
}

// ── timers (built on lib/mute-core.js) ───────────────────────────────────────
function cancelTimers(key) {
    const mc = require('./mute-core');
    mc.cancel({ type: 'banStart', chat: TIMER_CHAT, target: key });
    mc.cancel({ type: 'banEnd',   chat: TIMER_CHAT, target: key });
}

function armTimers(key, { startsAt, expiresAt }, notifyChat, by, jid) {
    const mc = require('./mute-core');
    cancelTimers(key);
    const extra = { notifyChat, jid };
    if (startsAt)  mc.schedule({ type: 'banStart', chat: TIMER_CHAT, target: key, expiresAt: startsAt,  mutedBy: by, extra });
    if (expiresAt) mc.schedule({ type: 'banEnd',   chat: TIMER_CHAT, target: key, expiresAt: expiresAt, mutedBy: by, extra });
}

/** Called by mute-core when a banStart / banEnd job comes due. */
async function onTimerJob(bot, job) {
    const jid  = job.jid;
    const chat = job.notifyChat;
    const who  = jid ? `@${String(jid).split('@')[0]}` : 'User';
    let text = null;

    if (job.type === 'banStart') {
        text = `🔨 ${who} is now banned from using the bot.`;
    } else if (job.type === 'banEnd') {
        const d = load();
        const e = d.users[job.target];
        if (e && e.expiresAt && e.expiresAt <= Date.now()) {
            delete d.users[job.target];
            save(d);
        }
        text = `✅ ${who} is unbanned — the bot works for them again.`;
    }
    if (text && chat) await bot.sendMessage(chat, { text, mentions: jid ? [jid] : [] }).catch(() => {});
}

// ── mutations ────────────────────────────────────────────────────────────────
/**
 * Ban a user. `forms` = every known JID of the user, `window` = { startsAt|null, expiresAt|null }
 * (absolute ms timestamps). Re-banning someone replaces their earlier ban.
 */
function ban({ jid, forms }, window, { by = null, notifyChat = null } = {}) {
    const keys = keysOf([jid, ...(forms || [])]);
    const d = load();

    // Replace any earlier ban of the same person (they may be stored under another form).
    for (const [k, e] of Object.entries(d.users)) {
        if (intersects(e.keys || [], keys)) {
            delete d.users[k];
            try { cancelTimers(k); } catch {}
        }
    }

    const primary = keyOf(jid);
    d.users[primary] = {
        jid, keys,
        startsAt: window.startsAt || null,
        expiresAt: window.expiresAt || null,
        by, at: Date.now(),
    };
    save(d);
    try { armTimers(primary, window, notifyChat, by, jid); } catch (e) { console.error('[ban] timer failed:', e.message); }
}

/** Removes the ban + its timers + its daily windows. Returns what existed. */
function unban(forms) {
    const keys = keysOf(forms);
    const d = load();
    let hadBan = false, windowsRemoved = 0;

    for (const [k, e] of Object.entries(d.users)) {
        if (!intersects(e.keys || [], keys)) continue;
        hadBan = true;
        delete d.users[k];
        try { cancelTimers(k); } catch {}
    }
    for (const [k, s] of Object.entries(d.schedules)) {
        if (!intersects(s.keys || [], keys)) continue;
        delete d.schedules[k];
        try { windowsRemoved += require('./mute-core').cancelRecurringByType(RECURRING_TYPE, k); } catch {}
    }
    save(d);
    touch();
    return { hadBan, windowsRemoved };
}

/** Removes every ban, pending timer and daily window. */
function clearAll() {
    const d = load();
    const users = Object.keys(d.users).length;
    d.users = {};
    d.schedules = {};
    save(d);
    try { require('./mute-core').cancelAll({ chat: TIMER_CHAT }); } catch {}
    let wins = 0;
    try { wins = require('./mute-core').cancelRecurringByType(RECURRING_TYPE); } catch {}
    touch();
    return { users, windows: wins };
}

/** Adds a daily "banned from X to Y" window (used by .sch -ban). */
function addWindow({ jid, forms, by, timeFrom, timeTo }) {
    const keys = keysOf([jid, ...(forms || [])]);
    const d = load();

    // Reuse the schedule key if this person already has one, so .unban finds every window.
    let schedKey = keyOf(jid);
    for (const [k, s] of Object.entries(d.schedules)) {
        if (intersects(s.keys || [], keys)) {
            schedKey = k;
            keys.push(...(s.keys || []));
            break;
        }
    }
    d.schedules[schedKey] = { jid, keys: [...new Set(keys)] };
    save(d);

    const id = require('./mute-core').addRecurring({
        chat: TIMER_CHAT, target: schedKey, mutedBy: by, type: RECURRING_TYPE, timeFrom, timeTo,
    });
    touch();
    return id;
}

// ── list rendering ───────────────────────────────────────────────────────────
function renderList(bot) {
    const { humanize } = require('./mute-core');
    const P   = bot?.prefix || '.';
    const d   = load();
    const now = Date.now();
    const mentions = [];
    const tag = jid => { if (jid && !mentions.includes(jid)) mentions.push(jid); return `@${String(jid).split('@')[0]}`; };

    const fmtWhen = e => {
        if (e.startsAt && e.startsAt > now) {
            return `starts in ${humanize(e.startsAt - now)}` + (e.expiresAt ? `, lasts ${humanize(e.expiresAt - e.startsAt)}` : ', until unbanned');
        }
        return e.expiresAt ? `${humanize(e.expiresAt - now)} left` : 'until unbanned';
    };

    const users = Object.values(d.users).filter(e => !e.expiresAt || e.expiresAt > now);
    const wins  = windows();
    const lines = [];

    if (users.length) {
        lines.push('*Banned*');
        users.forEach((e, i) => lines.push(`${i + 1}. ${tag(e.jid)} — ${fmtWhen(e)}`));
    }
    if (wins.length) {
        if (lines.length) lines.push('');
        lines.push('*Daily bans* _(Nigeria time)_');
        for (const r of wins) {
            const s = d.schedules[r.target];
            const live = inWindow(r, now) ? ' 🟢 banned now' : '';
            lines.push(`• ${s ? tag(s.jid) : r.target.split('@')[0]} — ${hhmm(r.timeFrom)} → ${hhmm(r.timeTo)}${live}`);
        }
    }

    if (!lines.length) return { text: `🔨 *BAN LIST*\n\nNo one is banned.\nTry: ${P}ban @user`, mentions };
    return { text: `🔨 *BAN LIST*\n\n${lines.join('\n')}\n\n_${P}unban @user to lift a ban_`, mentions };
}

module.exports = {
    RECURRING_TYPE, TIMER_CHAT,
    keyOf, resolveForms, targetFromMessage, protectedReason,
    isBanned, ban, unban, clearAll, addWindow,
    onTimerJob, renderList, hhmm, touch,
};
                       

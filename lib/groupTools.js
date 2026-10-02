/**
 * C☯︎DEX-AI — Group tools shared by .kick all, .demote all, .foldgc and .tkick
 *
 * WhatsApp's @lid rollout means a group participant can show up as a phone JID
 * or as a @lid whose digits differ from the phone number, so every identity
 * check here looks at all the forms (id / lid / jid / phoneNumber) and resolves
 * the @lid ↔ phone mapping when WhatsApp knows it.
 */

const _digits = j => String(j || '').replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
const _clean  = j => String(j || '').replace(/:[0-9]+@/, '@');
const sleep   = ms => new Promise(r => setTimeout(r, ms));

/** Every known JID form of one participant entry from groupMetadata. */
async function formsOf(bot, p) {
    const forms = new Set([p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean).map(_clean));
    const lidMap = bot?.sock?.signalRepository?.lidMapping;
    try {
        for (const f of [...forms]) {
            if (f.endsWith('@lid') && lidMap?.getPNForLID) {
                const pn = await lidMap.getPNForLID(f);
                if (pn) forms.add(_clean(pn));
            }
        }
    } catch {}
    return [...forms];
}

/** The bot's own identifiers (phone + @lid). */
function botForms(bot) {
    return [bot.sock?.user?.id, bot.sock?.user?.lid].filter(Boolean).map(_clean);
}

/** True when any of these JIDs is the bot itself. */
function isBot(bot, forms) {
    const mine = botForms(bot).map(_digits).filter(Boolean);
    return forms.some(f => mine.includes(_digits(f)));
}

/** True when any of these JIDs is the bot owner. */
function isOwnerForms(bot, forms) {
    try { return forms.some(f => bot.permission.isOwner(f)); } catch { return false; }
}

/** True when any of these JIDs is the person who ran the command. */
function isSender(m, forms) {
    const mine = [m.sender, m._participantRaw, m.key?.participant].filter(Boolean).map(_digits).filter(Boolean);
    return forms.some(f => mine.includes(_digits(f)));
}

/** Owner or mod (or the bot's own number) — may use the mass actions. */
function isPrivileged(bot, m) {
    try {
        return !!(m.key?.fromMe || bot.permission.isMod(m.sender, m._participantRaw));
    } catch { return false; }
}

/** Annotated participant list: [{ p, id, forms, bot, owner, sender, admin, superadmin }] */
async function listParticipants(bot, m, meta) {
    const out = [];
    for (const p of meta.participants || []) {
        const forms = await formsOf(bot, p);
        out.push({
            p,
            id: p.id || p.jid || p.phoneNumber,
            forms,
            bot: isBot(bot, forms),
            owner: isOwnerForms(bot, forms),
            sender: m ? isSender(m, forms) : false,
            admin: p.admin === 'admin',
            superadmin: p.admin === 'superadmin',
        });
    }
    return out;
}

/**
 * Runs groupParticipantsUpdate in small batches (big groups can't be changed in
 * one go). Returns { done, failed } counts based on WhatsApp's per-user status.
 */
async function updateMany(bot, chat, jids, action, { batch = 25, pauseMs = 700 } = {}) {
    let done = 0, failed = 0;
    for (let i = 0; i < jids.length; i += batch) {
        const chunk = jids.slice(i, i + batch);
        try {
            const res = await bot.sock.groupParticipantsUpdate(chat, chunk, action);
            if (Array.isArray(res) && res.length) {
                for (const r of res) (String(r.status) === '200' ? done++ : failed++);
            } else {
                done += chunk.length;
            }
        } catch {
            failed += chunk.length;
        }
        if (i + batch < jids.length) await sleep(pauseMs);
    }
    return { done, failed };
}

module.exports = {
    sleep, formsOf, botForms, isBot, isOwnerForms, isSender, isPrivileged,
    listParticipants, updateMany,
};

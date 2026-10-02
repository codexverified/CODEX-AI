/**
 * C☯︎DEX-AI — .tkick timer job (re-adds a kicked user when their time is up)
 *
 * .tkick kicks a user and schedules a 'tkickAdd' job on the same persistent
 * timer engine as .mute / .permit / .ban (lib/mute-core.js), so the re-add
 * still happens if the bot restarts while the user is out.
 */
const gt = require('./groupTools');

function _clean(j) { return String(j || '').replace(/:[0-9]+@/, '@'); }

/** Tries to add `jid`; true only when WhatsApp confirms it (status 200). */
async function _tryAdd(bot, chat, jid) {
    try {
        const res = await bot.sock.groupParticipantsUpdate(chat, [jid], 'add');
        if (Array.isArray(res) && res.length) return String(res[0].status) === '200';
        return true; // no per-user result returned → no error was raised
    } catch { return false; }
}

/** Called by mute-core when a tkickAdd job comes due. */
async function onTimerJob(bot, job) {
    const chat = job.chat;
    const jid  = job.target;
    const alt  = job.alt || null;
    const who  = `@${_clean(alt || jid).split('@')[0]}`;
    const tag  = [jid, alt].filter(Boolean);

    if (!(await bot.permission.isBotAdmin(chat).catch(() => false))) {
        return bot.sendMessage(chat, {
            text: `⚠️ Couldn't add ${who} back — I'm no longer an admin here.`,
            mentions: tag,
        }).catch(() => {});
    }

    let added = await _tryAdd(bot, chat, jid);
    if (!added && alt) added = await _tryAdd(bot, chat, alt);

    if (added) {
        return bot.sendMessage(chat, { text: `✅ ${who} has been added back.`, mentions: tag }).catch(() => {});
    }

    // Their privacy settings (or WhatsApp) refused a direct add → send the invite link instead.
    let sentInvite = false;
    try {
        const code = await bot.sock.groupInviteCode(chat);
        if (code) {
            await bot.sendMessage(alt || jid, { text: `You were removed from the group for a while. You can join back here:\nhttps://chat.whatsapp.com/${code}` });
            sentInvite = true;
        }
    } catch {}

    return bot.sendMessage(chat, {
        text: sentInvite
            ? `⚠️ Couldn't add ${who} directly (their privacy settings) — I sent them the invite link instead.`
            : `⚠️ Couldn't add ${who} back.`,
        mentions: tag,
    }).catch(() => {});
}

module.exports = { onTimerJob };
  

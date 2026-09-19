const { parseDuration, formatDuration, MAX_DURATION_MS } = require('../../lib/duration');
const presenceStore = require('../../lib/presenceStore');

// Resolves a @lid pseudo-id down to the real phone-number jid where
// possible, using Baileys' own lid<->PN mapping store, so a tag never
// shows a meaningless @lid number. Falls back to the jid as-is if it's
// already a phone jid, or if no mapping is known yet.
async function resolvePhoneJid(bot, jid) {
    const clean = String(jid || '').replace(/:[0-9]+@/, '@');
    if (clean.endsWith('@lid')) {
        try {
            const lidMap = bot?.sock?.signalRepository?.lidMapping;
            if (lidMap?.getPNForLID) {
                const pn = await lidMap.getPNForLID(clean);
                if (pn) return String(pn).replace(/:[0-9]+@/, '@');
            }
        } catch (_) {}
    }
    return clean;
}

function digitsOf(jid) {
    return String(jid || '').split('@')[0].replace(/\D/g, '');
}

module.exports = {
    name: 'listonline',
    aliases: ['online'],
    category: 'group',
    reactions: { start: '🟢' },
    description: `List members seen online within a given time, e.g. .listonline 3m (max ${formatDuration(MAX_DURATION_MS)}).`,
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const ms = parseDuration(args?.[0]);

        if (ms === null) return m.reply(`Usage: ${prefix}listonline <time>, e.g. ${prefix}listonline 3m`);
        if (ms > MAX_DURATION_MS) return m.reply(`Max is ${formatDuration(MAX_DURATION_MS)}.`);

        await presenceStore.ensureSubscribed(bot.sock, m.chat);

        const recent = presenceStore.getRecentlyOnline(m.chat, ms);
        if (!recent.length) return m.reply('No one online.');

        const resolved = await Promise.all(recent.map(async (r) => ({
            ...r,
            phoneJid: await resolvePhoneJid(bot, r.jid),
        })));

        const lines = resolved.map(r => `@${digitsOf(r.phoneJid)} — ${formatDuration(Date.now() - r.lastOnlineAt)}`);
        const mentions = resolved.map(r => r.phoneJid);
        await m.reply(lines.join('\n'), { mentions });
    },
};

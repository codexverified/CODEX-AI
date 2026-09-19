const { parseDuration, formatDuration, MAX_DURATION_MS } = require('../../lib/duration');
const { resolvePhoneJid, digitsOf } = require('../../lib/joinRequests');
const presenceStore = require('../../lib/presenceStore');

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

        // Resolve every jid to a real phone number first — presence data
        // can come back as a @lid pseudo-id, which is meaningless when
        // tagged, so it's never shown/mentioned as-is.
        const resolved = await Promise.all(recent.map(async (r) => ({
            ...r,
            phoneJid: await resolvePhoneJid(bot, r.jid),
        })));

        const lines = resolved.map(r => `@${digitsOf(r.phoneJid)} — ${formatDuration(Date.now() - r.lastOnlineAt)}`);
        const mentions = resolved.map(r => r.phoneJid);
        await m.reply(lines.join('\n'), { mentions });
    },
};

const { parseDuration, formatDuration, MAX_DURATION_MS } = require('../../lib/duration');
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

        if (ms === null) {
            return m.reply(`Usage: ${prefix}listonline <time>, e.g. ${prefix}listonline 3m (units: s/m/h/d, max ${formatDuration(MAX_DURATION_MS)}).`);
        }
        if (ms > MAX_DURATION_MS) {
            return m.reply(`That's too long — the max allowed window is ${formatDuration(MAX_DURATION_MS)}.`);
        }

        // Make sure we're actually subscribed to this group's presence
        // before answering — doesn't retroactively create data, but gives
        // future checks a head start if this is the first time it's run.
        await presenceStore.ensureSubscribed(bot.sock, m.chat);

        const recent = presenceStore.getRecentlyOnline(m.chat, ms);
        if (!recent.length) {
            return m.reply(
                `No one has been seen online in the last ${formatDuration(ms)}.\n\n` +
                `(This only tracks members WhatsApp actually reports presence for — a lot of people hide their online/last-seen status in their own privacy settings, and there's no way around that.)`
            );
        }

        const lines = recent.map((r, i) => `${i + 1}. @${r.jid.split('@')[0]} — ${formatDuration(Date.now() - r.lastOnlineAt)} ago`);
        const mentions = recent.map(r => r.jid);
        await m.reply(`🟢 Online in the last ${formatDuration(ms)} (${recent.length}):\n\n${lines.join('\n')}`, { mentions });
    },
};

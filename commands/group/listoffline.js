const { parseDuration, formatDuration, MAX_DURATION_MS } = require('../../lib/duration');
const presenceStore = require('../../lib/presenceStore');

module.exports = {
    name: 'listoffline',
    aliases: ['offline'],
    category: 'group',
    reactions: { start: '⚪' },
    description: `List members NOT seen online for at least a given time, e.g. .listoffline 3m (max ${formatDuration(MAX_DURATION_MS)}).`,
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const ms = parseDuration(args?.[0]);

        if (ms === null) {
            return m.reply(`Usage: ${prefix}listoffline <time>, e.g. ${prefix}listoffline 3m (units: s/m/h/d, max ${formatDuration(MAX_DURATION_MS)}).`);
        }
        if (ms > MAX_DURATION_MS) {
            return m.reply(`That's too long — the max allowed window is ${formatDuration(MAX_DURATION_MS)}.`);
        }

        await presenceStore.ensureSubscribed(bot.sock, m.chat);

        let participants = [];
        try {
            const meta = await bot.sock.groupMetadata(m.chat);
            participants = (meta?.participants || []).map(p => p.id).filter(Boolean);
        } catch (err) {
            return m.reply(`Failed to load group members: ${err.message}`);
        }

        const offline = presenceStore.getOffline(m.chat, ms, participants);
        if (!offline.length) {
            return m.reply(`Everyone tracked has been online within the last ${formatDuration(ms)}.`);
        }

        const lines = offline.map((r, i) => {
            const since = r.lastOnlineAt ? `last online ${formatDuration(Date.now() - r.lastOnlineAt)} ago` : 'no presence data yet';
            return `${i + 1}. @${r.jid.split('@')[0]} — ${since}`;
        });
        const mentions = offline.map(r => r.jid);
        await m.reply(
            `⚪ Offline for at least ${formatDuration(ms)} (${offline.length}):\n\n${lines.join('\n')}\n\n` +
            `(Members WhatsApp never reports presence for — due to their own privacy settings — always show up as "no presence data yet".)`,
            { mentions }
        );
    },
};

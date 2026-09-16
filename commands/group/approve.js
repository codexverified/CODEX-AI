const { enrichRequests, findRequestByNumber } = require('../../lib/joinRequests');

module.exports = {
    name: 'approve',
    aliases: ['acceptall', 'approveall'],
    category: 'group',
    reactions: { start: '📸' },
    description: 'Approve all pending group join requests, or .approve <number> for just one.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        try {
            const requests = await bot.sock.groupRequestParticipantsList(m.chat);
            if (!requests?.length) return m.reply('No pending join requests.');

            const target = args?.[0];

            // .approve 234xxxxxxxxx — approve just that one pending request,
            // leaving every other one untouched.
            if (target) {
                const enriched = await enrichRequests(bot, requests);
                const match = findRequestByNumber(enriched, target);
                if (!match) return m.reply(`No pending join request from ${target}.`);

                await bot.sock.groupRequestParticipantsUpdate(m.chat, [match.rawJid], 'approve');
                return m.reply(
                    `✅ Approved @${match.digits || target}'s join request.`,
                    { mentions: [match.phoneJid] }
                );
            }

            // No number given — original behaviour, approve everyone pending.
            const jids = requests.map(r => r.jid);
            await bot.sock.groupRequestParticipantsUpdate(m.chat, jids, 'approve');
            await m.reply(`Approved ${jids.length} join request(s).`);
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            await m.reply(`Failed: ${msg}`);
        }
    },
};

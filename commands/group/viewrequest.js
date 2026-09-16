const { enrichRequests } = require('../../lib/joinRequests');

module.exports = {
    name: 'viewrequest',
    aliases: ['requests', 'listrequests', 'pendingrequests'],
    category: 'group',
    reactions: { start: '📋' },
    description: 'List pending group join requests as tags (not raw LID numbers).',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m) {
        try {
            const requests = await bot.sock.groupRequestParticipantsList(m.chat);
            if (!requests?.length) return m.reply('No pending join requests.');

            // WhatsApp's "LID" privacy layer means request.jid is often a
            // @lid pseudo-id that has nothing to do with the requester's
            // real number — tagging that raw value shows a meaningless,
            // untappable string. Resolve every request to its real phone
            // number first so the list below is tagged properly.
            const enriched = await enrichRequests(bot, requests);

            const lines = enriched.map((r, i) => `${i + 1}. @${r.digits || r.rawJid.split('@')[0]}`);
            const mentions = enriched.map(r => r.phoneJid);

            await m.reply(
                `📋 Pending join requests (${enriched.length})\n\n${lines.join('\n')}\n\nUse .approve <number> / .reject <number> for one request, or .approve / .reject alone for all of them.`,
                { mentions }
            );
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            await m.reply(`Failed: ${msg}`);
        }
    },
};

const { enrichRequests, findRequestByNumber } = require('../../lib/joinRequests');

// Anything shorter than 7 digits can't be a real phone number (this
// matches lib/phone-utils.js's own normalize(), which already refuses to
// treat sub-7-digit input as a phone number) — so a bare short number is
// read as "how many pending requests to reject", not a number to look up.
function parseCount(raw) {
    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    if (text.length >= 7) return null; // long enough to be a real phone number instead
    const n = parseInt(text, 10);
    return n > 0 ? n : null;
}

module.exports = {
    name: 'reject',
    aliases: ['rejectall', 'denyall'],
    category: 'group',
    reactions: { start: '⚙️' },
    description: 'Reject all pending group join requests, .reject <number> for just one, or .reject <count> (e.g. .reject 20) for the first N pending.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        try {
            const requests = await bot.sock.groupRequestParticipantsList(m.chat);
            if (!requests?.length) return m.reply('No pending join requests.');

            const target = args?.[0];

            if (target) {
                const count = parseCount(target);

                // .reject 50 / .reject 20 — reject up to that many
                // pending requests, oldest-first, telling the admin if
                // there weren't actually that many pending.
                if (count !== null) {
                    const batch = requests.slice(0, count);
                    const jids = batch.map(r => r.jid);
                    await bot.sock.groupRequestParticipantsUpdate(m.chat, jids, 'reject');
                    if (count > requests.length) {
                        return m.reply(`You asked for ${count}, but only ${requests.length} request(s) were pending — rejected all ${requests.length}.`);
                    }
                    return m.reply(`❌ Rejected ${jids.length} of ${count} requested join request(s).`);
                }

                // .reject 234xxxxxxxxx — reject just that one pending
                // request, leaving every other one untouched.
                const enriched = await enrichRequests(bot, requests);
                const match = findRequestByNumber(enriched, target);
                if (!match) return m.reply(`No pending join request from ${target}.`);

                await bot.sock.groupRequestParticipantsUpdate(m.chat, [match.rawJid], 'reject');
                return m.reply(
                    `❌ Rejected @${match.digits || target}'s join request.`,
                    { mentions: [match.phoneJid] }
                );
            }

            // No argument at all — original behaviour, reject everyone pending.
            const jids = requests.map(r => r.jid);
            await bot.sock.groupRequestParticipantsUpdate(m.chat, jids, 'reject');
            await m.reply(`Rejected ${jids.length} join request(s).`);
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            await m.reply(`Failed: ${msg}`);
        }
    },
};

/**
 * .del — delete a message by replying to it. Owner / mod only.
 *
 *   Bot is a group ADMIN   → deletes the replied-to message AND your .del message.
 *   Bot is NOT an admin    → can only remove its OWN messages: it deletes the
 *                            replied-to message if the bot sent it, and leaves
 *                            your .del message alone (it can't delete yours).
 *                            If the replied-to message isn't the bot's, it says so.
 */
const gt = require('../../lib/groupTools');

module.exports = {
    name: 'del',
    aliases: [],
    category: 'owner',
    ownerOnly: true,
    description: 'Reply to a message to delete it (bot admin: also removes your .del; not admin: only the bot\'s own messages)',

    async execute(bot, m) {
        const q = m.quoted;
        if (!q?.key?.id) return m.reply(`Reply to the message you want to delete.\nExample: reply to it with ${bot.prefix}del`);

        // Can the bot delete OTHER people's messages here? Only as a group admin.
        let botIsAdmin = false;
        if (m.isGroup) {
            try { botIsAdmin = !!(await bot.permission.isBotAdmin(m.chat)); } catch {}
        }

        // Was the replied-to message sent by the bot itself?
        const author = q.key.participant || '';
        const ownMessage = !!q.key.fromMe || (!!author && gt.isBot(bot, [author]));

        if (!botIsAdmin && !ownMessage) {
            return m.reply("❌ I'm not an admin here, so I can only delete my own messages.");
        }

        // The message to delete — flagged fromMe when it's the bot's own so WhatsApp accepts the revoke.
        const targetKey = ownMessage
            ? { remoteJid: m.chat, id: q.key.id, fromMe: true, ...(m.isGroup && author ? { participant: author } : {}) }
            : { remoteJid: m.chat, id: q.key.id, fromMe: false, participant: author };

        try {
            await bot.sock.sendMessage(m.chat, { delete: targetKey });
        } catch (err) {
            return m.reply(`❌ Couldn't delete it: ${err.message}`);
        }

        // Bot is admin → also clear the .del command itself. Not admin → leave it (the bot can't remove it).
        if (botIsAdmin) {
            try { await bot.sock.sendMessage(m.chat, { delete: m.key }); } catch {}
        }
    },
};

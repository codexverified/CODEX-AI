const { getTarget } = require('../../lib/getTarget');

module.exports = {
    name: 'kick',
    aliases: ['remove', 'k'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Kick a user. Tag them or reply to their message.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const target = getTarget(m);
        if (!target) return await m.reply(`Tag a user or reply to their message.\nExample: ${bot.prefix}kick @user`);

        try {
            await bot.sock.groupParticipantsUpdate(m.chat, [target], 'remove');
            await bot.sendMessage(m.chat, {
                text: `_*✓ @${target.split('@')[0]} Kicked*_.`,
                mentions: [target]
            });
        } catch (err) {
            await m.reply(`❌ Failed to kick: ${err.message}`);
        }
    }
};

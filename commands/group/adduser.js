module.exports = {
    name: 'adduser',
    aliases: ['addmember', 'gadd'],
    category: 'group',
    reactions: { start: '➕' },
    description: 'Add a user to the group by phone number.',
    usage: '.adduser <phone number>',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const raw = (args[0] || '').replace(/[^0-9]/g, '');
        if (!raw || raw.length < 7) return await m.reply(`Usage: *${bot.prefix}adduser <phone number>*\nExample: ${bot.prefix}adduser 15551234567`);

        const target = `${raw}@s.whatsapp.net`;

        try {
            await bot.sock.groupParticipantsUpdate(m.chat, [target], 'add');
            await bot.sendMessage(m.chat, {
                text: `✅ Successfully added @${raw} to the group!`,
                mentions: [target]
            });
        } catch (err) {
            await m.reply(`Failed to add user: ${err.message}`);
        }
    },
};

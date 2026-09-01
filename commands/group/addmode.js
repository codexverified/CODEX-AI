module.exports = {
    name: 'addmode',
    aliases: ['setaddmode'],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Set who can add members to the group.',
    usage: '.addmode <all|admin>',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const input = (args[0] || '').toLowerCase();
        let mode = '';

        if (input === 'all') mode = 'all_member_add';
        else if (input === 'admin') mode = 'admin_add';
        else return await m.reply(`Usage: *${bot.prefix}addmode all* (anyone can add) or *${bot.prefix}addmode admin* (admins only)`);

        try {
            await bot.sock.groupMemberAddMode(m.chat, mode);
            await m.reply(`✅ Add mode updated. Now ${mode === 'all_member_add' ? 'all members' : 'only admins'} can add new members.`);
        } catch (err) {
            await m.reply(`Failed: ${err.message}`);
        }
    },
};

module.exports = {
    name: 'groupinfoinvite',
    aliases: ['inviteinfo', 'checkinvite'],
    category: 'group',
    reactions: { start: '🔍' },
    description: 'Preview a group\'s info from its invite code/link without joining.',
    usage: '.groupinfoinvite <invite code or link>',

    async execute(bot, m, args) {
        const raw = args.join(' ').trim();
        if (!raw) return await m.reply(`Usage: *${bot.prefix}groupinfoinvite <code or link>*\nExample: ${bot.prefix}groupinfoinvite ABCDEF123456`);

        const code = raw.includes('chat.whatsapp.com/') ? raw.split('chat.whatsapp.com/')[1].split(/[?\s]/)[0] : raw;

        try {
            const info = await bot.sock.groupGetInviteInfo(code);
            const owner = info.owner ? `@${info.owner.split('@')[0]}` : 'Unknown';
            await bot.sendMessage(m.chat, {
                text: `*🔍 GROUP INVITE INFO*\n\n*Name:* ${info.subject}\n*ID:* ${info.id}\n*Description:* ${info.desc || 'No description'}\n*Members:* ${info.size}\n*Owner:* ${owner}\n*Created:* ${new Date(info.creation * 1000).toLocaleDateString()}`,
                mentions: info.owner ? [info.owner] : []
            });
        } catch (err) {
            await m.reply(`Failed to get invite info: ${err.message}`);
        }
    },
};

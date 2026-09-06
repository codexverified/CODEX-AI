const READMORE = String.fromCharCode(8206).repeat(4001);

module.exports = {
    name: 'readmore',
    aliases: ['rmore'],
    category: 'tools',
    reactions: { start: '📖' },
    description: 'Create a WhatsApp "Read more" message that hides part of the text.',
    usage: '.readmore visible text | hidden text',

    async execute(bot, m, args) {
        const query = args.join(' ');
        const [visible, hidden] = query.includes('|')
            ? query.split('|').map(part => part.trim())
            : [query.split(/\s+/)[0], query.split(/\s+/).slice(1).join(' ')];

        if (!visible || !hidden) return await m.reply(`Usage: *${bot.prefix}readmore visible text | hidden text*`);
        await m.reply(`${visible}${READMORE}${hidden}`);
    },
};

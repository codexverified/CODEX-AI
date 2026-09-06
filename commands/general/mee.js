module.exports = {
    name: 'mee',
    aliases: ['mywa'],
    category: 'general',
    reactions: { start: '🔗' },
    description: 'Get your own wa.me link.',

    async execute(bot, m) {
        await m.reply(`https://wa.me/${m.sender.split('@')[0]}`);
    },
};

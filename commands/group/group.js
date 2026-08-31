module.exports = {
    name: 'group',
    aliases: ['groupmenu'],
    category: 'group',
    reactions: { start: '📋' },
    description: 'Show a quick reference of group management commands.',
    groupOnly: true,

    async execute(bot, m) {
        const p = bot.prefix;
        const text =
            `*📋 GROUP MANAGEMENT PANEL*\n\n` +
            `*Member Actions*\n` +
            `${p}tag <msg> — tag everyone\n` +
            `${p}adduser <number> — add a member\n` +
            `${p}kick @user — remove a member\n\n` +
            `*Admin Actions*\n` +
            `${p}promote @user — make admin\n` +
            `${p}demote @user — remove admin\n\n` +
            `*Group Settings*\n` +
            `${p}groupinfo — view details\n` +
            `${p}link — get invite link\n` +
            `${p}gcname <name> — set group name\n` +
            `${p}gdesc <text> — set group description\n` +
            `${p}setgpp — set group picture (reply to image)\n` +
            `${p}delgpp — remove group picture\n` +
            `${p}addmode <all|admin> — who can add members\n` +
            `${p}getjids — list member JIDs`;

        await m.reply(text);
    },
};

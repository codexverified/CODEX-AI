module.exports = {
    name: 'allgroups',
    aliases: ['listgroups'],
    category: 'owner',
    reactions: { start: '📚' },
    description: 'List every group the bot is currently in.',
    ownerOnly: true,

    async execute(bot, m) {
        try {
            const groups = await bot.sock.groupFetchAllParticipating();
            const groupList = Object.values(groups);

            if (groupList.length === 0) return await m.reply('📭 Bot is not in any groups.');

            let text = `*📚 ALL GROUPS (${groupList.length})*\n\n`;
            groupList.forEach((group, index) => {
                text += `${index + 1}. *${group.subject}*\n   ID: ${group.id}\n   Members: ${group.participants.length}\n\n`;
            });

            await m.reply(text.length > 4000 ? `${text.slice(0, 3900)}\n\n...truncated` : text);
        } catch (err) {
            await m.reply(`Failed to fetch groups: ${err.message}`);
        }
    },
};

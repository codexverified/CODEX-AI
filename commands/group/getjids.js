module.exports = {
    name: 'getjids',
    aliases: ['jids'],
    category: 'group',
    reactions: { start: '🪪' },
    description: 'List all member JIDs in the current group.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m) {
        try {
            const metadata = await bot.sock.groupMetadata(m.chat);
            const jids = metadata.participants
                .map(p => p.id || p.jid || p.phoneNumber)
                .filter(Boolean)
                .sort();

            const text = `*Group JIDs (${jids.length})*\n\n${jids.join('\n')}`;
            await m.reply(text.length > 4000 ? `${text.slice(0, 3900)}\n\n...truncated` : text);
        } catch (err) {
            await m.reply(`Failed: ${err.message}`);
        }
    },
};

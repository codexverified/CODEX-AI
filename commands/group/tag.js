module.exports = {
    name: 'tag',
    aliases: ['tagall'],
    category: 'group',
    reactions: { start: '📢' },
    description: 'Tag all members in the group with a message.',
    usage: '.tag <message>',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        try {
            const meta = await bot.sock.groupMetadata(m.chat);
            // p.id is missing/undefined for some participant entries on
            // certain Baileys forks (LID-only participants, etc.) — passing
            // an undefined mention JID crashes the WAMessage protobuf
            // encoder with a low-level ERR_INVALID_ARG_TYPE deep inside
            // baileys, so every entry is resolved with a fallback and any
            // still-empty result is dropped before it reaches sendMessage.
            const mentions = meta.participants
                .map(p => p.id || p.jid || p.phoneNumber)
                .filter(Boolean);
            const text = args.join(' ') || '📢 Announcement from admin';

            await bot.sendMessage(m.chat, { text, mentions });
        } catch (err) {
            await m.reply(`Failed: ${err.message}`);
        }
    },
};

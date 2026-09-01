module.exports = {
    name: 'getprivacy',
    category: 'owner',
    reactions: { start: '🔒' },
    description: "Show the bot account's WhatsApp privacy settings.",
    ownerOnly: true,

    async execute(bot, m) {
        try {
            const privacy = await bot.sock.fetchPrivacySettings(true);
            await m.reply(
                `*Privacy Settings*\n\n` +
                `Online: ${privacy.online}\n` +
                `Profile: ${privacy.profile}\n` +
                `Last seen: ${privacy.last}\n` +
                `Status: ${privacy.status}\n` +
                `Read receipts: ${privacy.readreceipts}\n` +
                `Group add: ${privacy.groupadd}\n` +
                `Call add: ${privacy.calladd || 'n/a'}`
            );
        } catch (err) {
            await m.reply(`Failed to fetch privacy settings: ${err.message}`);
        }
    },
};

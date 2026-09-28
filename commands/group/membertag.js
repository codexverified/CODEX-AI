// updateMemberLabel sets the BOT's OWN display tag in this group.
// It can't set another participant's tag — WhatsApp doesn't allow that.
module.exports = {
    name: 'membertag',
    aliases: ['setmytag', 'bottag', 'memberlabel', 'setmemberlabel'],
    category: 'owner',
    reactions: { start: '🏷️' },
    description: "Set the bot's own member tag/label in this group (max 30 chars).",
    groupOnly: true,
    ownerOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const label = (args || []).join(' ').trim();

        if (!label) {
            return m.reply(
                `Usage: ${prefix}membertag <label>\n\n` +
                `_Sets the bots member tag to a provided label._`
            );
        }

        if (label.length > 30) {
            return m.reply(`Label too long — max 30 characters (yours: ${label.length}).`);
        }

        try {
            await bot.sock.updateMemberLabel(m.chat, label);
            return m.reply(`*membertag set to:* ${label}`);
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            return m.reply(`Failed: ${msg}`);
        }
    },
};

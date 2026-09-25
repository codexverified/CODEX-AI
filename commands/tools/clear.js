/**
 * .clearchat (aliases: .clear, .clr, .wipe)
 *
 * Wipes this chat exactly the way WhatsApp's own "Clear chat" button does:
 * it clears history from the BOT's own account (every device linked to this
 * bot session) up to the message that triggered the command. It can NOT
 * remove anything from other participants' phones — no bot, app or API can
 * do that it's a WhatsApp-side limit, not something code can get around.
 * Works the same way in DMs and groups.
 *
 * Owner/mod only. That also keeps it out of .permit — lib/permit.js refuses
 * to open any ownerOnly command to everyone.
 */
module.exports = {
    name: 'clearchat',
    aliases: ['clear', 'clr', 'wipe'],
    category: 'tools',
    description: "Clear this chat the same way WhatsApp's own Clear chat button does (bot's own view only) — .wipe",
    ownerOnly: true,
    reactions: { start: '🧹' },

    async execute(bot, m) {
        try {
            await bot.sock.chatModify(
                {
                    delete: true,
                    lastMessages: [{
                        key: m.key,
                        messageTimestamp: m._raw?.messageTimestamp,
                    }],
                },
                m.chat,
            );
        } catch (err) {
            console.error('[clearchat] chatModify failed:', err.message);
            return m.reply('⚠️ Could not clear this chat — WhatsApp rejected the request.');
        }

        // Small delay so the clear visibly lands before the confirmation shows up.
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Plain send, not m.reply — the chat was just cleared, so this starts
        // a fresh thread instead of quoting a message that's now gone from
        // the bot's own view.
        await bot.sendMessage(m.chat, { text: '_chat cleared_' });
    },
};

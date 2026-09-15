const { applyMode, isModeEnabled, setModeEnabled } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'hyper',
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — HYPER: every anti-system kicks immediately. .hyper on/off toggles it for this group.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'off') {
            setModeEnabled(groupId, 'hyper', false);
            return await m.reply('❌ HYPER mode *DISABLED* for this group.');
        }

        if (sub === 'on') {
            setModeEnabled(groupId, 'hyper', true);
        } else if (!isModeEnabled(groupId, 'hyper')) {
            return await m.reply(`🔒 HYPER mode is OFF for this group. Run ${bot.prefix}hyper on to enable it.`);
        }

        const { applied } = applyMode(groupId, 'hyper');

        const text =
`🛡️ *HYPER MODE ENABLED*

Every anti-system now *KICKS* immediately:
${applied.map(s => `• ${s}`).join('\n')}

Admins are always exempt.`;
        return await m.reply(text);
    }
};

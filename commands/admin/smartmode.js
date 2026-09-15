const { applyMode, isModeEnabled, setModeEnabled } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'smart',
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — SMART: every anti-system warns up to N times before kicking. .smart on/off toggles it, .smart warn [1-3] sets N.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub = (args[0] || '').toLowerCase();
        let n = 3;

        if (sub === 'off') {
            setModeEnabled(groupId, 'smart', false);
            return await m.reply('❌ SMART mode *DISABLED* for this group.');
        }

        if (sub === 'warn') {
            n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) {
                return await m.reply(`Usage: ${bot.prefix}smart warn [1-3]`);
            }
            setModeEnabled(groupId, 'smart', true);
        } else if (sub === 'on') {
            setModeEnabled(groupId, 'smart', true);
        } else if (!isModeEnabled(groupId, 'smart')) {
            return await m.reply(`🔒 SMART mode is OFF for this group. Run ${bot.prefix}smart on to enable it.`);
        }

        const { applied } = applyMode(groupId, 'smart', n);

        const text =
`🛡️ *SMART MODE ENABLED*

Every anti-system now warns up to ${n}/${n} times before kicking:
${applied.map(s => `• ${s}`).join('\n')}

Anti-GC-Status stays on KICK. Admins are always exempt.`;
        return await m.reply(text);
    }
};

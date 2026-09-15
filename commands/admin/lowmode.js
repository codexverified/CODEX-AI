const { applyMode, isModeEnabled, setModeEnabled } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'low',
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — LOW: every anti-system deletes only. .low on/off toggles it for this group.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'off') {
            setModeEnabled(groupId, 'low', false);
            return await m.reply('❌ LOW mode *DISABLED* for this group.');
        }

        if (sub === 'on') {
            setModeEnabled(groupId, 'low', true);
        } else if (!isModeEnabled(groupId, 'low')) {
            return await m.reply(`🔒 LOW mode is OFF for this group. Run ${bot.prefix}low on to enable it.`);
        }

        const { applied, skipped } = applyMode(groupId, 'low');

        let text =
`🛡️ *LOW MODE ENABLED*

Every anti-system now just *DELETES*:
${applied.map(s => `• ${s}`).join('\n')}

Anti-GC-Status stays on KICK. Admins are always exempt.`;

        if (skipped.length) {
            text += `\n\n_${skipped.join(', ')}: no delete action available, left unchanged._`;
        }

        return await m.reply(text);
    }
};

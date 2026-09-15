const { applyMode } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'low',
    aliases: ['lowmode'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — LOW: every anti-system deletes offending messages immediately (no warnings, no kicks)',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const { applied, skipped } = applyMode(m.chat, 'low');

        let text =
`*Advanced Group Settings — LOW*

Every anti-system below now just *DELETES* — no warnings, no kicks:
${applied.map(s => `• ${s}`).join('\n')}

Anti-GC-Status stays on KICK regardless of mode.`;

        if (skipped.length) {
            text += `\n\n_${skipped.join(', ')} has no delete action (join-based, no message to delete) — left unchanged, still enabled._`;
        }

        text += `\n\nCheck any system individually, e.g. ${bot.prefix}antilink status.`;
        return await m.reply(text);
    }
};





low.js

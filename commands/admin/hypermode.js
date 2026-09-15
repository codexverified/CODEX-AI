const { applyMode } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'hyper',
    aliases: ['hypermode'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — HYPER: every anti-system kicks immediately, zero tolerance',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const { applied } = applyMode(m.chat, 'hyper');

        const text =
`*Advanced Group Settings — HYPER*

Every anti-system below now *KICKS* immediately, zero tolerance:
${applied.map(s => `• ${s}`).join('\n')}

Check any system individually, e.g. ${bot.prefix}antilink status.`;
        return await m.reply(text);
    }
};




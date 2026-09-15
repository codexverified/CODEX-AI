const { applyMode } = require('../../lib/advancedGroupSettings');

module.exports = {
    name: 'smart',
    aliases: ['smartmode'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Advanced group protection — SMART: every anti-system warns up to a set number of times before kicking',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const sub = (args[0] || '').toLowerCase();
        let n = 3;

        if (sub) {
            if (sub !== 'warn') {
                return await m.reply(`Usage: ${bot.prefix}smart warn [1-3]\nExample: ${bot.prefix}smart warn 3`);
            }
            n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) {
                return await m.reply(`Usage: ${bot.prefix}smart warn [1-3]\nMax warnings allowed is 3.`);
            }
        }

        const { applied } = applyMode(m.chat, 'smart', n);

        const text =
`*Advanced Group Settings — SMART*

Every anti-system below now warns up to ${n}/${n} times before kicking:
${applied.map(s => `• ${s}`).join('\n')}

Anti-GC-Status stays on KICK regardless of mode.

Check any system individually, e.g. ${bot.prefix}antilink status.`;
        return await m.reply(text);
    }
};




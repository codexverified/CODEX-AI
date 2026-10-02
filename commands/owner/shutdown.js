/**
 * .shutdown — shuts the bot down. It stays off until you start it again
 * from the hosting panel. Owner only. Logic lives in lib/powerControl.js.
 */
const power = require('../../lib/powerControl');

module.exports = {
    name: 'shutdown',
    aliases: ['poweroff'],
    category: 'owner',
    reactions: { start: '⏻' },
    ownerOnly: true,
    description: 'Shut the bot down (it can only be started again from the panel)',

    async execute(bot, m) {
        if (!(m.key?.fromMe || bot.permission.isOwner(m.sender))) return m.reply('Owner only command');
        await m.reply('_𝌫 shutting down..._');
        power.shutdown(bot);
    },
};

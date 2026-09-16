module.exports = {
    name: 'approval',
    aliases: ['adminapproval', 'joinapproval', 'memberapproval'],
    category: 'group',
    reactions: { start: '🛂' },
    description: 'Turn admin approval for new members on/off in this group.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const state = String(args?.[0] || '').toLowerCase();
        if (state !== 'on' && state !== 'off') {
            return m.reply(`Use ${prefix}approval on, or ${prefix}approval off.`);
        }

        try {
            await bot.sock.groupJoinApprovalMode(m.chat, state);
            return m.reply(
                state === 'on'
                    ? `🛂 Admin approval: ON — new join requests now need an admin to ${prefix}approve them (see ${prefix}viewrequest).`
                    : '🛂 Admin approval: OFF — people can join this group directly, no approval needed.'
            );
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            await m.reply(`Failed: ${msg}`);
        }
    },
};

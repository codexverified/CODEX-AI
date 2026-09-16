module.exports = {
    name: 'approval',
    aliases: ['adminapproval', 'joinapproval', 'memberapproval'],
    category: 'group',
    reactions: { start: '🛂' },
    description: 'Turn admin approval for new members on/off in this group, or check its status.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const state = String(args?.[0] || '').toLowerCase();

        if (!state || state === 'status') {
            try {
                const metadata = await bot.sock.groupMetadata(m.chat);
                const isOn = !!metadata?.joinApprovalMode;
                return m.reply(`🛂 Admin approval is currently ${isOn ? 'ON' : 'OFF'} in this group.`);
            } catch (err) {
                return m.reply(`Failed to check status: ${err.message}`);
            }
        }

        if (state !== 'on' && state !== 'off') {
            return m.reply(`Use ${prefix}approval on, ${prefix}approval off, or ${prefix}approval status.`);
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
        

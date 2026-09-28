module.exports = {
    name: 'addmode',
    aliases: ['memberaddmode', 'setaddmode'],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Let all members add people to this group (on) or only admins (off).',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const state = String(args?.[0] || '').toLowerCase();

        if (state !== 'on' && state !== 'off') {
            return m.reply(
                `Usage: ${prefix}addmode on/off\n\n` +
                `• on — all members can add people\n` +
                `• off — only admins can add people`
            );
        }

        try {
            await bot.sock.groupMemberAddMode(m.chat, state === 'on' ? 'all_member_add' : 'admin_add');
            return m.reply(
                state === 'on'
                    ? '👥 Add mode: ON — all members can now add people to this group.'
                    : '👥 Add mode: OFF — only admins can add people to this group.'
            );
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            return m.reply(`Failed: ${msg}`);
        }
    },
};

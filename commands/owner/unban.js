/**
 * .unban — lift a ban set with .ban (see commands/owner/ban.js).
 *
 *   .unban @user          → unban (also cancels any timer or daily ban for them)
 *   .unban 2349012345678  → by number (or reply to their message)
 *   .unban all            → lift every ban
 */
const banStore = require('../../lib/banStore');

module.exports = {
    name: 'unban',
    aliases: ['unbanuser'],
    category: 'owner',
    reactions: { start: '✅' },
    ownerOnly: true,
    description: 'Unban a user so the bot answers them again — .unban @user | .unban all',

    async execute(bot, m, args) {
        const P  = bot.prefix || '.';
        const a0 = (args[0] || '').toLowerCase();

        if (a0 === 'all') {
            const r = banStore.clearAll();
            if (!r.users && !r.windows) return m.reply('ℹ️ No one was banned.');
            return m.reply(`✅ *All bans lifted* — ${r.users} ban${r.users === 1 ? '' : 's'}${r.windows ? ` and ${r.windows} daily schedule${r.windows === 1 ? '' : 's'}` : ''} removed.`);
        }

        const t = await banStore.targetFromMessage(bot, m, args);
        if (!t) return m.reply(`Tag the user, reply to them, or type their number:\n${P}unban @user\n${P}unban 2349012345678\n${P}unban all`);

        const who = `@${t.jid.split('@')[0]}`;
        const r = banStore.unban(t.forms);
        if (!r.hadBan && !r.windowsRemoved) return m.reply(`ℹ️ ${who} isn't banned.`, { mentions: [t.jid] });

        return m.reply(
            `✅ ${who} is *unbanned* — the bot answers them again.${r.windowsRemoved ? '\n_(their daily ban schedule was removed too)_' : ''}`,
            { mentions: [t.jid] },
        );
    },
};

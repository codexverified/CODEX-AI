/**
 * .demoteall — demotes every admin except the group creator (super admin),
 * the bot owner and the bot itself. Owner / mod only; the bot must be admin.
 * Standalone on purpose: it doesn't touch the regular .demote command.
 */
const gt = require('../../lib/groupTools');

module.exports = {
    name: 'demoteall',
    aliases: [],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Demote every admin except the group creator, the bot owner and the bot.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m) {
        if (!gt.isPrivileged(bot, m) && !bot.permission.isOwner(m.sender)) {
            return m.reply('❌ Only the owner or a mod can use demoteall.');
        }
        if (!(await bot.permission.isBotAdmin(m.chat).catch(() => false))) {
            return m.reply('❌ I need to be a group admin to demote members.');
        }

        let meta;
        try { meta = await bot.sock.groupMetadata(m.chat); }
        catch (err) { return m.reply(`❌ Couldn't read the group: ${err.message}`); }

        const list = await gt.listParticipants(bot, m, meta);
        const targets = list.filter(x => x.admin && !x.superadmin && !x.owner && !x.bot).map(x => x.id).filter(Boolean);
        if (!targets.length) return m.reply('Nobody to demote — no other admins here.');

        const { done, failed } = await gt.updateMany(bot, m.chat, targets, 'demote');
        return m.reply(`✅ Demoted ${done} admin${done === 1 ? '' : 's'}.${failed ? `\n⚠️ ${failed} couldn't be demoted.` : ''}`);
    },
};

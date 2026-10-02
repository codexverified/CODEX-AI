/**
 * .kickall — kicks every member except the bot and its owner.
 * (Also spared: whoever ran it, and the group creator — WhatsApp never lets
 * anyone else remove the creator.) Owner / mod only; the bot must be admin.
 * Standalone on purpose: it doesn't touch the regular .kick command.
 */
const gt = require('../../lib/groupTools');

module.exports = {
    name: 'kickall',
    aliases: [],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Kick everyone except the bot and its owner.',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m) {
        if (!gt.isPrivileged(bot, m) && !bot.permission.isOwner(m.sender)) {
            return m.reply('❌ Only the owner or a mod can use kickall.');
        }
        if (!(await bot.permission.isBotAdmin(m.chat).catch(() => false))) {
            return m.reply('❌ I need to be a group admin to remove members.');
        }

        let meta;
        try { meta = await bot.sock.groupMetadata(m.chat); }
        catch (err) { return m.reply(`❌ Couldn't read the group: ${err.message}`); }

        const list = await gt.listParticipants(bot, m, meta);
        const targets = list.filter(x => !x.bot && !x.owner && !x.sender && !x.superadmin).map(x => x.id).filter(Boolean);
        if (!targets.length) return m.reply('Nobody to kick — only the bot, its owner and you are here.');

        const { done, failed } = await gt.updateMany(bot, m.chat, targets, 'remove');
        return m.reply(`✅ Removed ${done} member${done === 1 ? '' : 's'}.${failed ? `\n⚠️ ${failed} couldn't be removed.` : ''}`);
    },
};

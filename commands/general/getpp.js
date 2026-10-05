const { resolveLookupTarget, getProfilePictureUrl } = require('../../lib/lookupTarget');

module.exports = {
    name: 'getpp',
    aliases: ['pp', 'profilepic'],
    category: 'general',
    reactions: { start: '📸' },
    description: 'Get a user profile picture and send it in this chat — .getpp 234xxxxxxxxxx | .getpp @user | reply to their message',

    async execute(bot, m, args) {
        const { jid: target, invalid } = resolveLookupTarget(m, args);
        if (invalid) return m.reply(`That number doesn't look right.\nExample: ${bot.prefix}getpp 2349035671379`);

        try {
            const ppUrl = await getProfilePictureUrl(bot, target);
            const sent = await bot.sendMessage(m.chat, {
                image:   { url: ppUrl },
                caption: `_profile picture of_ @${target.split('@')[0]}\n\n\n*DOWNLOADED VIA CODEX AI*`,
                mentions: [target]
            });
            if (!sent) throw new Error('send failed');
        } catch {
            await m.reply(`Could not fetch profile picture for @${target.split('@')[0]}.\nThey may have hidden it.`, { mentions: [target] });
        }
    }
};

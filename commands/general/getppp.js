const { resolveLookupTarget, getProfilePictureUrl } = require('../../lib/lookupTarget');

module.exports = {
    name: 'getppp',
    aliases: ['ppdm', 'profilepicdm'],
    category: 'general',
    reactions: { start: '📸' },
    description: 'Get a user profile picture and send it to owner DM — .getppp 234xxxxxxxxxx | .getppp @user | reply to their message',

    async execute(bot, m, args) {
        const { jid: target, invalid } = resolveLookupTarget(m, args);
        if (invalid) return m.reply(`That number doesn't look right.\nExample: ${bot.prefix}getppp 2349035671379`);

        try {
            const ppUrl   = await getProfilePictureUrl(bot, target);
            const ownerDM = bot.config.owner.number;
            const sent = await bot.sendMessage(ownerDM, {
                image:   { url: ppUrl },
                caption: `_profile picture of_ @${target.split('@')[0]}\n\n\n*DOWNLOADED VIA CODEX AI*`,
                mentions: [target]
            });
            if (!sent) throw new Error('send failed');
            await m.reply('PROFILE PICTURE SENT TO YOUR DM');
        } catch {
            await m.reply(`Could not fetch profile picture for @${target.split('@')[0]}.\nThey may have hidden it.`, { mentions: [target] });
        }
    }
};

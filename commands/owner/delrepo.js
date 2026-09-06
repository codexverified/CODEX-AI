const axios = require('axios');

module.exports = {
    name: 'delrepo',
    category: 'owner',
    reactions: { start: '🗑️' },
    description: 'Delete a GitHub repository under your configured GitHub account. Requires GITHUB_TOKEN and GITHUB_USERNAME env vars.',
    usage: '.delrepo <name>',
    ownerOnly: true,

    async execute(bot, m, args) {
        const token = process.env.GITHUB_TOKEN;
        const username = process.env.GITHUB_USERNAME;
        if (!token) return await m.reply('❌ GITHUB_TOKEN is not configured.');
        if (!username) return await m.reply('❌ GITHUB_USERNAME is not configured.');

        const name = args[0];
        if (!name) return await m.reply(`Usage: *${bot.prefix}delrepo <name>*`);

        try {
            await axios.delete(`https://api.github.com/repos/${username}/${name}`, {
                headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
            });
            await m.reply(`✅ Repo *${name}* deleted.`);
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            await m.reply(`❌ Failed to delete repo: ${msg}`);
        }
    },
};

const axios = require('axios');

module.exports = {
    name: 'createrepo',
    category: 'owner',
    reactions: { start: '📁' },
    description: 'Create a new GitHub repository under your configured GitHub account. Requires GITHUB_TOKEN and GITHUB_USERNAME env vars.',
    usage: '.createrepo <name> <public|private>',
    ownerOnly: true,

    async execute(bot, m, args) {
        const token = process.env.GITHUB_TOKEN;
        const username = process.env.GITHUB_USERNAME;
        if (!token) return await m.reply('❌ GITHUB_TOKEN is not configured.');
        if (!username) return await m.reply('❌ GITHUB_USERNAME is not configured.');

        const name = args[0];
        const visibility = (args[1] || '').toLowerCase();
        if (!name || !['public', 'private'].includes(visibility)) {
            return await m.reply(`Usage: *${bot.prefix}createrepo <name> <public|private>*`);
        }

        try {
            await m.reply(`🔄 Creating repo *${name}*...`);
            const res = await axios.post(
                'https://api.github.com/user/repos',
                { name, private: visibility === 'private' },
                { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } }
            );
            await m.reply(`✅ Repo created: ${res.data.html_url}`);
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            await m.reply(`❌ Failed to create repo: ${msg}`);
        }
    },
};

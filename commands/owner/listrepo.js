const axios = require('axios');

module.exports = {
    name: 'listrepo',
    category: 'owner',
    reactions: { start: '📋' },
    description: 'List repositories under your configured GitHub account. Requires GITHUB_TOKEN env var.',
    ownerOnly: true,

    async execute(bot, m) {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return await m.reply('❌ GITHUB_TOKEN is not configured.');

        try {
            const res = await axios.get('https://api.github.com/user/repos', {
                headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
                params: { per_page: 30, sort: 'updated' }
            });

            if (!res.data.length) return await m.reply('📭 No repositories found.');

            const text = res.data.map((r, i) => `${i + 1}. *${r.name}* (${r.private ? 'private' : 'public'})\n   ${r.html_url}`).join('\n\n');
            await m.reply(`*📋 YOUR REPOSITORIES (${res.data.length})*\n\n${text}`);
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            await m.reply(`❌ Failed to fetch repos: ${msg}`);
        }
    },
};

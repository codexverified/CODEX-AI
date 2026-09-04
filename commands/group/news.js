'use strict';
const axios = require('axios');
 
const FEEDS = {
    world:    'https://feeds.bbci.co.uk/news/world/rss.xml',
    tech:     'https://feeds.bbci.co.uk/news/technology/rss.xml',
    africa:   'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    sports:   'https://feeds.bbci.co.uk/sport/rss.xml'
};
 
module.exports = {
    commands:    ['news', 'headlines'],
    category: 'group',
    description: 'Get latest news headlines',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        const chatId   = groupId || sender;
        const category = (args[0] || 'world').toLowerCase();
        const feedUrl  = FEEDS[category] || FEEDS.world;
        try {
            const rssApi = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=5`;
            const { data } = await axios.get(rssApi, { timeout: 12000 });
            const items = data?.items;
            if (!items?.length) throw new Error('No news found.');
            const lines = items.map((item, i) => `${i + 1}. *${item.title}*\n   ðŸ”— ${item.link}`).join('\n\n');
            const cats  = Object.keys(FEEDS).join(' | ');
            await sock.sendMessage(chatId, {
                text: `ðŸ“° *Latest News â€” ${category.toUpperCase()}*\n\n${lines}\n\n_Categories: ${cats}_\n_Powered by BBC â€¢ CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `âŒ News fetch failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

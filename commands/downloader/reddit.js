'use strict';
const axios = require('axios');
 
module.exports = {
    commands:    ['reddit', 'rdl'],
    category: 'downloader',
    description: 'Download Reddit images and videos',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { contextInfo }) => {
        const destination = message.chat;
        const url = args[0];
        if (!url || !url.includes('reddit.com')) {
            return sock.sendMessage(destination, {
                text: 'âŒ Please provide a valid Reddit URL.\nExample: .reddit https://reddit.com/r/sub/comments/abc/title/',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(destination, { text: 'Fetching Reddit media...', contextInfo }, { quoted: message });
        try {
            const jsonUrl = url.replace(/\/?$/, '') + '.json';
            const { data } = await axios.get(jsonUrl, {
                timeout: 20000,
                headers: { 'User-Agent': 'CodexAI/1.0' }
            });
            const post = data?.[0]?.data?.children?.[0]?.data;
            if (!post) throw new Error('Could not fetch post data.');
            const title = post.title || 'Reddit Post';
            if (post.is_video && post.media?.reddit_video?.fallback_url) {
                const videoUrl = post.media.reddit_video.fallback_url.split('?')[0];
                await sock.sendMessage(destination, {
                    video: { url: videoUrl },
                    caption: `ðŸ“¤ *${title}*\nðŸ‘ ${post.ups} upvotes\n_Powered by CODEX AI_`,
                    contextInfo
                }, { quoted: message });
            } else if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
                await sock.sendMessage(destination, {
                    image: { url: post.url },
                    caption: `ðŸ“¤ *${title}*\nðŸ‘ ${post.ups} upvotes\n_Powered by CODEX AI_`,
                    contextInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(destination, {
                    text: `ðŸ“¤ *${title}*\n\n${post.selftext ? post.selftext.slice(0, 500) : '(no text)'}\n\nðŸ‘ ${post.ups} upvotes`,
                    contextInfo
                }, { quoted: message });
            }
        } catch (e) {
            await sock.sendMessage(destination, { text: `âŒ Reddit fetch failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

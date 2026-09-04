'use strict';
 
const axios  = require('axios');
const playdl = require('play-dl');
const { fmt } = require('../../lib/theme');
 
// Dead APIs removed (2026-06): siputzx (all search endpoints), unsplash anon key (no quota)
// Replacements: DuckDuckGo instant answers for google, play-dl for YouTube search
 
module.exports = {
    commands: [
        'google', 'npm', 'apkmirror', 'happymod',
        'ggleimage', 'unsplash', 'wallpapers', 'wattpad',
        'yts', 'spotifysearch'
    ],
    category: 'search',
    description: 'Extended search commands',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd  = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const query = args.join(' ').trim();
        const send  = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });
 
        if (!query && !['wallpapers'].includes(cmd)) {
            return send(`âŒ *Usage:* \`.${cmd} <search query>\``);
        }
 
        await sock.sendPresenceUpdate('composing', jid);
 
        if (cmd === 'google') {
            try {
                // DuckDuckGo Instant Answers API â€” confirmed working 2026-06
                const res = await axios.get(
                    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
                    { timeout: 10000 }
                );
                const d = res.data;
                const abstract = d?.AbstractText || d?.Answer || '';
                const topics = (d?.RelatedTopics || [])
                    .filter(t => t.Text && t.FirstURL)
                    .slice(0, 5);
 
                if (!abstract && !topics.length) throw new Error('no results');
 
                let text = `ðŸ” *Google / DuckDuckGo: "${query}"*\n\n`;
                if (abstract) text += `ðŸ“ ${abstract.slice(0, 300)}\n\n`;
                if (topics.length) {
                    text += topics.map((t, i) =>
                        `*${i + 1}.* ${t.Text?.slice(0, 100)}\n   ðŸ”— ${t.FirstURL}`
                    ).join('\n\n');
                }
                return send(text);
            } catch {
                return send(
                    `ðŸ” *Google: "${query}"*\n\n` +
                    `ðŸ”— https://google.com/search?q=${encodeURIComponent(query)}\n` +
                    `ðŸ”— https://duckduckgo.com/?q=${encodeURIComponent(query)}`
                );
            }
        }
 
        if (cmd === 'npm') {
            try {
                const res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(query)}`, { timeout: 10000 });
                const d   = res.data;
                const latest = d?.['dist-tags']?.latest;
                return send(
                    `ðŸ“¦ *NPM: ${d.name}*\n\n` +
                    `ðŸ“ ${d.description?.slice(0, 200) || 'No description'}\n\n` +
                    `ðŸ·ï¸ *Latest:* ${latest}\n` +
                    `ðŸ“… *Modified:* ${d.time?.[latest]?.split('T')[0] || 'N/A'}\n` +
                    `ðŸ“¥ *Install:* \`npm install ${d.name}\`\n` +
                    `ðŸ”— https://npmjs.com/package/${d.name}`
                );
            } catch { return send(`âŒ Package \`${query}\` not found on npm.`); }
        }
 
        if (cmd === 'apkmirror') {
            return send(`ðŸ“± *APK Mirror: "${query}"*\n\nðŸ”— https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${encodeURIComponent(query)}\n\n_Click to search on APKMirror_`);
        }
 
        if (cmd === 'happymod') {
            return send(`ðŸŽ® *HappyMod: "${query}"*\n\nðŸ”— https://www.happymod.com/search.html?q=${encodeURIComponent(query)}\n\n_Click to search HappyMod_`);
        }
 
        if (cmd === 'ggleimage') {
            // siputzx image search is dead â€” provide Google Images link
            return send(
                `ðŸ–¼ï¸ *Google Images: "${query}"*\n\n` +
                `ðŸ”— https://www.google.com/images?q=${encodeURIComponent(query)}\n` +
                `ðŸ”— https://www.pexels.com/search/${encodeURIComponent(query)}/\n\n` +
                `_Click a link to browse images online_`
            );
        }
 
        if (cmd === 'unsplash') {
            // Unsplash public API requires a valid app key; provide link fallback
            return send(
                `ðŸ“· *Unsplash: "${query}"*\n\n` +
                `ðŸ”— https://unsplash.com/s/photos/${encodeURIComponent(query)}\n\n` +
                `_Browse high-quality free photos on Unsplash_`
            );
        }
 
        if (cmd === 'wallpapers') {
            const q = query || 'nature 4k';
            return send(
                `ðŸ–¼ï¸ *Wallpapers: "${q}"*\n\n` +
                `ðŸ”— https://www.pexels.com/search/${encodeURIComponent(q)}/\n` +
                `ðŸ”— https://unsplash.com/s/photos/${encodeURIComponent(q)}\n` +
                `ðŸ”— https://wallhaven.cc/search?q=${encodeURIComponent(q)}\n\n` +
                `_Click a link to browse wallpapers_`
            );
        }
 
        if (cmd === 'wattpad') {
            try {
                const res = await axios.get(
                    `https://www.wattpad.com/api/v3/stories?query=${encodeURIComponent(query)}&limit=5&fields=id,title,description,mainCategory,readCount`,
                    { timeout: 10000 }
                );
                const stories = res.data?.stories || [];
                if (!stories.length) return send(`ðŸ“š No Wattpad stories found for: *${query}*`);
                const list = stories.map((s, i) =>
                    `*${i + 1}.* ${s.title}\n   ðŸ“– ${s.mainCategory || 'Fiction'} | ðŸ‘ ${(s.readCount || 0).toLocaleString()} reads\n   ${s.description?.slice(0, 80) || ''}`
                ).join('\n\n');
                return send(`ðŸ“š *Wattpad: "${query}"*\n\n${list}\n\nðŸ”— https://www.wattpad.com/stories/${encodeURIComponent(query)}`);
            } catch {
                return send(`ðŸ“š *Wattpad: "${query}"*\n\nðŸ”— https://www.wattpad.com/stories/${encodeURIComponent(query)}`);
            }
        }
 
        if (cmd === 'yts') {
            try {
                // play-dl YouTube search â€” no external API key needed
                const results = await playdl.search(query, { source: { youtube: 'video' }, limit: 5 });
                if (!results?.length) return send(`â–¶ï¸ No YouTube results for: *${query}*`);
                const list = results.map((v, i) =>
                    `*${i + 1}.* ${v.title}\n   â± ${v.durationRaw || 'N/A'} | ðŸ‘¤ ${v.channel?.name || 'N/A'}\n   ðŸ”— ${v.url}`
                ).join('\n\n');
                return send(`â–¶ï¸ *YouTube: "${query}"*\n\n${list}`);
            } catch {
                return send(`â–¶ï¸ *YouTube: "${query}"*\n\nðŸ”— https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
            }
        }
 
        if (cmd === 'spotifysearch') {
            // Spotify search API requires OAuth â€” provide link instead
            return send(
                `ðŸŽµ *Spotify: "${query}"*\n\n` +
                `ðŸ”— https://open.spotify.com/search/${encodeURIComponent(query)}\n\n` +
                `_Click to search on Spotify_\n` +
                `_To download a song as audio, use: \`.spotify ${query}\`_`
            );
        }
    }
};

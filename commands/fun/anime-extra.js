'use strict';
 
const axios = require('axios');
 
// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
async function jikanGet(path, params = {}) {
    const resp = await axios.get(`https://api.jikan.moe/v4${path}`, {
        params,
        timeout: 15000
    });
    return resp.data;
}
 
function truncate(str, max = 350) {
    if (!str) return 'N/A';
    str = str.replace(/\[Written by.*?\]/gi, '').trim();
    return str.length > max ? str.slice(0, max) + 'â€¦' : str;
}
 
function scoreBar(score) {
    if (!score) return 'â¬œâ¬œâ¬œâ¬œâ¬œ';
    const filled = Math.round(score / 2);
    return 'ðŸŸ¨'.repeat(filled) + 'â¬œ'.repeat(5 - filled);
}
 
// â”€â”€â”€ Anime Quote â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
async function fetchAnimeQuote() {
    // Primary: animechan.io
    try {
        const resp = await axios.get('https://animechan.io/api/v1/quotes/random', { timeout: 8000 });
        const q = resp.data?.data;
        if (q?.content) return { quote: q.content, character: q.character?.name || 'Unknown', anime: q.anime?.name || 'Unknown' };
    } catch {}
 
    // Fallback: zenquotes (generic but good)
    try {
        const resp = await axios.get('https://zenquotes.io/api/random', { timeout: 8000 });
        const q = resp.data?.[0];
        if (q?.q) return { quote: q.q, character: q.a, anime: 'Wisdom' };
    } catch {}
 
    return { quote: 'Even if I\'m worthless and carry demon blood... I want to be human!', character: 'Inuyasha', anime: 'Inuyasha' };
}
 
// â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
const handlers = {
 
    // .topanime [page]
    topanime: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const page = parseInt(args[0]) || 1;
 
        const data = await jikanGet('/top/anime', { page, limit: 10, filter: 'bypopularity' });
        const list = data?.data;
        if (!list?.length) throw new Error('No data');
 
        const lines = list.map((a, i) => {
            const rank  = a.rank || ((page - 1) * 10 + i + 1);
            const title = a.title_english || a.title;
            const score = a.score ? `â­ ${a.score}` : '';
            const eps   = a.episodes ? `${a.episodes} eps` : 'Ongoing';
            return `*${rank}.* ${title}\n     ${score} â€¢ ${eps}`;
        }).join('\n\n');
 
        await sock.sendMessage(jid, {
            text: `ðŸ† *Top Anime (Page ${page})*\n\n${lines}\n\n_Page ${page} â€¢ Use .topanime 2 for more_`,
            contextInfo
        }, { quoted: message });
    },
 
    // .topmanga [page]
    topmanga: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const page = parseInt(args[0]) || 1;
 
        const data = await jikanGet('/top/manga', { page, limit: 10, filter: 'bypopularity' });
        const list = data?.data;
        if (!list?.length) throw new Error('No data');
 
        const lines = list.map((a, i) => {
            const rank  = a.rank || ((page - 1) * 10 + i + 1);
            const title = a.title_english || a.title;
            const score = a.score ? `â­ ${a.score}` : '';
            const vols  = a.volumes ? `${a.volumes} vols` : 'Ongoing';
            return `*${rank}.* ${title}\n     ${score} â€¢ ${vols}`;
        }).join('\n\n');
 
        await sock.sendMessage(jid, {
            text: `ðŸ“š *Top Manga (Page ${page})*\n\n${lines}\n\n_Page ${page} â€¢ Use .topmanga 2 for more_`,
            contextInfo
        }, { quoted: message });
    },
 
    // .seasonal [year] [season]
    seasonal: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const now     = new Date();
        const year    = parseInt(args[0]) || now.getFullYear();
        const seasons = ['winter', 'spring', 'summer', 'fall'];
        const monthSeason = ['winter','winter','spring','spring','spring','summer','summer','summer','fall','fall','fall','winter'];
        const season  = args[1]?.toLowerCase() || monthSeason[now.getMonth()];
 
        if (!seasons.includes(season)) {
            return sock.sendMessage(jid, {
                text: `âŒ Invalid season. Use: *winter, spring, summer, fall*\nExample: \`.seasonal 2024 spring\``,
                contextInfo
            }, { quoted: message });
        }
 
        const data = await jikanGet(`/seasons/${year}/${season}`, { limit: 10 });
        const list = data?.data?.slice(0, 10);
        if (!list?.length) throw new Error('No data');
 
        const lines = list.map((a, i) => {
            const title = a.title_english || a.title;
            const score = a.score ? `â­ ${a.score}` : 'Airing';
            const genre = (a.genres || []).slice(0, 2).map(g => g.name).join(', ') || '';
            return `*${i + 1}.* ${title}\n     ${score}${genre ? ' â€¢ ' + genre : ''}`;
        }).join('\n\n');
 
        const seasonEmoji = { winter: 'â„ï¸', spring: 'ðŸŒ¸', summer: 'â˜€ï¸', fall: 'ðŸ‚' };
 
        await sock.sendMessage(jid, {
            text: `${seasonEmoji[season] || 'ðŸŽŒ'} *${season.charAt(0).toUpperCase() + season.slice(1)} ${year} Anime*\n\n${lines}\n\n_Showing top 10 by popularity_`,
            contextInfo
        }, { quoted: message });
    },
 
    // .airing
    airing: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const data = await jikanGet('/top/anime', { filter: 'airing', limit: 10 });
        const list = data?.data;
        if (!list?.length) throw new Error('No data');
 
        const lines = list.map((a, i) => {
            const title = a.title_english || a.title;
            const score = a.score ? `â­ ${a.score}` : 'ðŸ†• New';
            const studio = (a.studios || [])[0]?.name || '';
            return `*${i + 1}.* ${title}\n     ${score}${studio ? ' â€¢ ' + studio : ''}`;
        }).join('\n\n');
 
        await sock.sendMessage(jid, {
            text: `ðŸ“º *Currently Airing Anime*\n\n${lines}`,
            contextInfo
        }, { quoted: message });
    },
 
    // .upcoming
    upcoming: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const data = await jikanGet('/top/anime', { filter: 'upcoming', limit: 10 });
        const list = data?.data;
        if (!list?.length) throw new Error('No data');
 
        const lines = list.map((a, i) => {
            const title = a.title_english || a.title;
            const date  = a.aired?.from ? new Date(a.aired.from).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'TBA';
            const genre = (a.genres || []).slice(0, 2).map(g => g.name).join(', ') || '';
            return `*${i + 1}.* ${title}\n     ðŸ“… ${date}${genre ? ' â€¢ ' + genre : ''}`;
        }).join('\n\n');
 
        await sock.sendMessage(jid, {
            text: `ðŸ”® *Upcoming Anime*\n\n${lines}`,
            contextInfo
        }, { quoted: message });
    },
 
    // .character <name>
    character: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(jid, { text: `âŒ Provide a character name.\nExample: \`.character Goku\``, contextInfo }, { quoted: message });
        }
 
        const data = await jikanGet('/characters', { q: query, limit: 1 });
        const char = data?.data?.[0];
        if (!char) throw new Error(`No character found for "${query}"`);
 
        const name    = char.name || 'Unknown';
        const nameKanji = char.name_kanji ? `_(${char.name_kanji})_` : '';
        const nicknames = char.nicknames?.join(', ') || '';
        const favorites = char.favorites?.toLocaleString() || '0';
        const about   = truncate(char.about?.replace(/\r?\n+/g, ' ') || 'No info.', 400);
        const imgUrl  = char.images?.jpg?.image_url;
 
        const animeList = (char.anime || []).slice(0, 3).map(a => a.anime?.title).filter(Boolean).join(', ') || 'N/A';
 
        const text = [
            `ðŸŽ­ *${name}*`,
            nameKanji,
            nicknames ? `_"${nicknames}"_` : '',
            '',
            `â¤ï¸ *Favorites:* ${favorites}`,
            `ðŸŽ¬ *Appears in:* ${animeList}`,
            '',
            `ðŸ“ *About:*`,
            about,
        ].filter(l => l !== null && l !== undefined).join('\n');
 
        if (imgUrl) {
            try {
                const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
                return sock.sendMessage(jid, { image: Buffer.from(imgResp.data), caption: text, contextInfo }, { quoted: message });
            } catch {}
        }
        await sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
    },
 
    // .animequote
    animequote: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const { quote, character, anime } = await fetchAnimeQuote();
 
        const text = `ðŸ’¬ *Anime Quote*\n\n_"${quote}"_\n\nâ€” *${character}* from *${anime}*`;
        await sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
    },
 
    // .animegenre <genre>
    animegenre: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const GENRE_IDS = {
            action: 1, adventure: 2, comedy: 4, drama: 8, fantasy: 10,
            horror: 14, mystery: 7, romance: 22, scifi: 24, 'sci-fi': 24,
            sports: 30, supernatural: 37, thriller: 41, music: 19, slice: 36,
            'slice of life': 36, mecha: 18, psychological: 40, ecchi: 9,
            school: 23, harem: 35, magic: 16, military: 38, vampire: 32,
        };
 
        const input = args.join(' ').toLowerCase().trim();
        if (!input) {
            const available = Object.keys(GENRE_IDS).join(', ');
            return sock.sendMessage(jid, {
                text: `ðŸŽ­ *Available genres:*\n${available}\n\nExample: \`.animegenre romance\``,
                contextInfo
            }, { quoted: message });
        }
 
        const genreId = GENRE_IDS[input];
        if (!genreId) {
            return sock.sendMessage(jid, {
                text: `âŒ Unknown genre "*${input}*". Use .animegenre to see all available genres.`,
                contextInfo
            }, { quoted: message });
        }
 
        const data = await jikanGet('/anime', { genres: genreId, order_by: 'score', sort: 'desc', limit: 10, sfw: true });
        const list = data?.data;
        if (!list?.length) throw new Error('No results');
 
        const label = input.charAt(0).toUpperCase() + input.slice(1);
        const lines = list.map((a, i) => {
            const title = a.title_english || a.title;
            const score = a.score ? `â­ ${a.score}` : 'N/A';
            const eps   = a.episodes ? `${a.episodes} eps` : 'Ongoing';
            return `*${i + 1}.* ${title}\n     ${score} â€¢ ${eps}`;
        }).join('\n\n');
 
        await sock.sendMessage(jid, {
            text: `ðŸŽ­ *Top ${label} Anime*\n\n${lines}`,
            contextInfo
        }, { quoted: message });
    },
 
    // .animeinfo <title> â€” detailed info with score bar
    animeinfo: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(jid, { text: `âŒ Provide an anime title.\nExample: \`.animeinfo Attack on Titan\``, contextInfo }, { quoted: message });
        }
 
        const data = await jikanGet('/anime', { q: query, limit: 1, sfw: true });
        const item = data?.data?.[0];
        if (!item) throw new Error(`No results for "${query}"`);
 
        const title    = item.title_english || item.title;
        const japanese = item.title_japanese || '';
        const score    = item.score || 0;
        const rank     = item.rank ? `#${item.rank}` : 'N/A';
        const popularity = item.popularity ? `#${item.popularity}` : 'N/A';
        const status   = item.status || 'Unknown';
        const type     = item.type || 'Unknown';
        const eps      = item.episodes ? `${item.episodes}` : '?';
        const duration = item.duration || 'N/A';
        const genres   = (item.genres || []).map(g => g.name).join(', ') || 'N/A';
        const studios  = (item.studios || []).map(s => s.name).join(', ') || 'N/A';
        const aired    = item.aired?.string || 'Unknown';
        const source   = item.source || 'N/A';
        const synopsis = truncate(item.synopsis, 500);
        const trailer  = item.trailer?.url || null;
        const bar      = scoreBar(score);
 
        const text = [
            `ðŸŽŒ *${title}*`,
            japanese ? `_(${japanese})_` : '',
            '',
            `${bar} ${score ? `â­ ${score}/10` : 'Unscored'}`,
            '',
            `ðŸ“º *Type:* ${type}`,
            `ðŸ“Š *Status:* ${status}`,
            `ðŸŽ¬ *Episodes:* ${eps} (${duration})`,
            `ðŸ† *Rank:* ${rank} â€¢ ðŸ”¥ *Popularity:* ${popularity}`,
            `ðŸŽ­ *Genres:* ${genres}`,
            `ðŸ¢ *Studios:* ${studios}`,
            `ðŸ“… *Aired:* ${aired}`,
            `ðŸ“– *Source:* ${source}`,
            '',
            `ðŸ“ *Synopsis:*`,
            synopsis,
            trailer ? `\nðŸŽ¬ *Trailer:* ${trailer}` : '',
        ].filter(l => l !== null).join('\n');
 
        const imgUrl = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
        if (imgUrl) {
            try {
                const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
                return sock.sendMessage(jid, { image: Buffer.from(imgResp.data), caption: text, contextInfo }, { quoted: message });
            } catch {}
        }
        await sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
    },
 
    // .mangainfo <title>
    mangainfo: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(jid, { text: `âŒ Provide a manga title.\nExample: \`.mangainfo Berserk\``, contextInfo }, { quoted: message });
        }
 
        const data = await jikanGet('/manga', { q: query, limit: 1, sfw: true });
        const item = data?.data?.[0];
        if (!item) throw new Error(`No results for "${query}"`);
 
        const title    = item.title_english || item.title;
        const japanese = item.title_japanese || '';
        const score    = item.score || 0;
        const rank     = item.rank ? `#${item.rank}` : 'N/A';
        const status   = item.status || 'Unknown';
        const chapters = item.chapters ? `${item.chapters} chapters` : 'Ongoing';
        const volumes  = item.volumes ? `${item.volumes} volumes` : '?';
        const genres   = (item.genres || []).map(g => g.name).join(', ') || 'N/A';
        const authors  = (item.authors || []).map(a => a.name).join(', ') || 'N/A';
        const published = item.published?.string || 'Unknown';
        const synopsis = truncate(item.synopsis, 450);
 
        const text = [
            `ðŸ“š *${title}*`,
            japanese ? `_(${japanese})_` : '',
            '',
            `${scoreBar(score)} ${score ? `â­ ${score}/10` : 'Unscored'}`,
            '',
            `ðŸ“Š *Status:* ${status}`,
            `ðŸ“– *Chapters:* ${chapters} â€¢ *Volumes:* ${volumes}`,
            `ðŸ† *Rank:* ${rank}`,
            `ðŸŽ­ *Genres:* ${genres}`,
            `âœï¸ *Authors:* ${authors}`,
            `ðŸ“… *Published:* ${published}`,
            '',
            `ðŸ“ *Synopsis:*`,
            synopsis,
        ].filter(Boolean).join('\n');
 
        const imgUrl = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
        if (imgUrl) {
            try {
                const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
                return sock.sendMessage(jid, { image: Buffer.from(imgResp.data), caption: text, contextInfo }, { quoted: message });
            } catch {}
        }
        await sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
    },
 
    // .studio <name>
    studio: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(jid, { text: `âŒ Provide a studio name.\nExample: \`.studio Mappa\``, contextInfo }, { quoted: message });
        }
 
        // Search producers (studios are listed as producers in Jikan)
        const prodData = await jikanGet('/producers', { q: query, limit: 1 });
        const producer = prodData?.data?.[0];
        if (!producer) throw new Error(`No studio found for "${query}"`);
 
        const name  = producer.titles?.[0]?.title || producer.name || 'Unknown';
        const estab = producer.established || 'Unknown';
        const count = producer.count || 0;
        const about = truncate(producer.about?.replace(/\r?\n+/g, ' ') || 'No info.', 300);
 
        // Get top anime from this studio
        const animeData = await jikanGet('/anime', { producers: producer.mal_id, order_by: 'score', sort: 'desc', limit: 5, sfw: true });
        const topAnime  = (animeData?.data || []).map((a, i) => `  *${i + 1}.* ${a.title_english || a.title} (â­ ${a.score || 'N/A'})`).join('\n');
 
        const text = [
            `ðŸ¢ *${name}*`,
            '',
            `ðŸ“… *Established:* ${estab}`,
            `ðŸŽ¬ *Total Anime:* ${count}`,
            '',
            `ðŸ“ *About:*`,
            about,
            topAnime ? `\nðŸ† *Top Works:*\n${topAnime}` : '',
        ].filter(Boolean).join('\n');
 
        const imgUrl = producer.images?.jpg?.image_url;
        if (imgUrl) {
            try {
                const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
                return sock.sendMessage(jid, { image: Buffer.from(imgResp.data), caption: text, contextInfo }, { quoted: message });
            } catch {}
        }
        await sock.sendMessage(jid, { text, contextInfo }, { quoted: message });
    },
};
 
// â”€â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
module.exports = {
    commands:   Object.keys(handlers),
    category:   'fun',
    description: 'Extended anime commands â€” topanime, topmanga, seasonal, airing, upcoming, character, animequote, animegenre, animeinfo, mangainfo, studio',
    usage:      '.topanime | .topmanga | .seasonal 2024 spring | .airing | .upcoming | .character Goku | .animequote | .animegenre romance | .animeinfo Naruto | .mangainfo Berserk | .studio Mappa',
    permission: 'public',
    group:      true,
    private:    true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        const handler = handlers[rawCmd];
        if (!handler) return;
 
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await handler(sock, message, args, ctx);
        } catch (e) {
            await sock.sendMessage(jid, {
                text: `âŒ ${e.message || 'Something went wrong. Try again.'}`,
                contextInfo
            }, { quoted: message });
        }
    }
};

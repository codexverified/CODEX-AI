'use strict';
 
const axios = require('axios');
 
// waifu.im SFW categories
const WAIFU_TAGS = {
    waifu:     'waifu',
    neko:      'maid',       // closest to neko on waifu.im
    maid:      'maid',
    marin:     'uniform',
    uniform:   'uniform',
    selfies:   'selfies',
    raiden:    'raiden-shogun',
    oppai:     'oppai',
    rias:      'rias-gremory',
    kamisato:  'kamisato-ayaka',
    wink:      'wink',
    blush:     'blush',
    smile:     'smile',
    wave:      'wave',
    happy:     'happy',
    husbando:  'husbando',
    shinobu:   'shinobu',
    megumin:   'megumin',
    ero:       'ero',        // borderline, still SFW on waifu.im
};
 
const DESCRIPTIONS = {
    waifu:    'ðŸŒ¸ Waifu time!',
    neko:     'ðŸ± Neko!',
    maid:     'ðŸ§¹ Maid-sama!',
    uniform:  'ðŸŽ“ School uniform!',
    selfies:  'ðŸ“¸ Anime selfie!',
    raiden:   'âš¡ Raiden Shogun!',
    oppai:    'ðŸŒ¸ Oppai!',
    rias:     'ðŸ˜ˆ Rias Gremory!',
    kamisato: 'â„ï¸ Kamisato Ayaka!',
    wink:     'ðŸ˜‰ Wink~',
    blush:    'ðŸ˜³ Blushing~',
    smile:    'ðŸ˜Š Smiling~',
    wave:     'ðŸ‘‹ Waving~',
    happy:    'ðŸŽ‰ Happy~',
    husbando: 'ðŸ’ª Husbando!',
    shinobu:  'ðŸ¦‹ Shinobu!',
    megumin:  'ðŸ’¥ Megumin!',
    ero:      'ðŸ”ž Ero~',
};
 
async function fetchWaifuIm(tag) {
    const resp = await axios.get('https://api.waifu.im/search', {
        params: { included_tags: tag, is_nsfw: false },
        timeout: 12000
    });
    const images = resp.data?.images;
    if (!images?.length) throw new Error('No image returned');
    return images[Math.floor(Math.random() * images.length)];
}
 
// Fallback: waifu.pics
async function fetchWaifuPics(type = 'waifu') {
    const resp = await axios.get(`https://api.waifu.pics/sfw/${type}`, { timeout: 10000 });
    return { url: resp.data?.url, source: null };
}
 
module.exports = {
    commands:   [...new Set(['waifu', 'neko', 'maid', 'husbando', 'shinobu', 'megumin',
                             'uniform', 'selfies', 'raiden', 'rias', 'kamisato',
                             'wink', 'blush', 'smile', 'wave', 'happy'])],
    description: 'Anime girl/guy images â€” waifu, neko, maid, husbando, shinobu, megumin, raiden, rias, and more',
    category:   'fun',
    usage:      '.waifu | .neko | .maid | .husbando | .shinobu | .megumin',
    permission: 'public',
    group:      true,
    private:    true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        const tag = WAIFU_TAGS[rawCmd] || 'waifu';
        const label = DESCRIPTIONS[rawCmd] || 'ðŸŒ¸ Waifu!';
 
        try {
            await sock.sendPresenceUpdate('composing', jid);
 
            let imageUrl, sourceUrl;
            try {
                const img = await fetchWaifuIm(tag);
                imageUrl  = img.url;
                sourceUrl = img.source || null;
            } catch {
                // Fallback to waifu.pics (maps some tags to generic)
                const wpType = ['waifu','neko','shinobu','megumin','blush','smile','wave','happy','wink'].includes(rawCmd)
                    ? rawCmd : 'waifu';
                const fb = await fetchWaifuPics(wpType);
                imageUrl  = fb.url;
                sourceUrl = null;
            }
 
            if (!imageUrl) throw new Error('No image URL');
 
            const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
 
            const caption = sourceUrl
                ? `${label}\n\nðŸ”— _Source: ${sourceUrl}_`
                : label;
 
            await sock.sendMessage(jid, {
                image:   Buffer.from(imgResp.data),
                caption,
                contextInfo
            }, { quoted: message });
 
        } catch (e) {
            await sock.sendMessage(jid, {
                text: `âŒ Failed to fetch image: ${e.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};

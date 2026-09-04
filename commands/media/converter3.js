'use strict';
 
const axios  = require('axios');
const playdl = require('play-dl');
const { fmt } = require('../../lib/theme');
const { dlBuffer } = require('../../lib/dlmedia');
 
const DC_BASE = 'https://apis.davidcyriltech.my.id';
 
// Search YouTube via play-dl (no external API needed), download via davidcyriltech
async function ytSearch(q, limit = 1) {
    try {
        const results = await playdl.search(q, { source: { youtube: 'video' }, limit });
        return results || [];
    } catch { return []; }
}
 
module.exports = {
    commands: ['toimg', 'toptt', 'tovideo', 'sendaudio', 'sendvideo', 'snack', 'video'],
    category: 'media',
    description: 'Additional converters and downloaders',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd  = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const text = args.join(' ').trim();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });
 
        await sock.sendPresenceUpdate('composing', jid);
 
        if (cmd === 'toimg') {
            const msg    = message.message;
            const webpMsg = msg?.stickerMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
            const imgMsg  = msg?.imageMessage   || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!webpMsg && !imgMsg) return send('âŒ Reply to a *sticker* or *image* with `.toimg` to convert it.');
            const target = webpMsg || imgMsg;
            const type   = webpMsg ? 'sticker' : 'image';
            const buf    = await dlBuffer(target, type).catch(() => null);
            if (!buf) return send('âŒ Could not download the file.');
            await sock.sendMessage(jid, { image: buf, caption: fmt('ðŸ–¼ï¸ Converted to Image'), contextInfo }, { quoted: message });
            return;
        }
 
        if (cmd === 'toptt') {
            const msg    = message.message;
            const audMsg = msg?.audioMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
            if (!audMsg) return send('âŒ Reply to an *audio* or *voice message* with `.toptt`\n\nSends any audio as a voice note (PTT).');
            const buf = await dlBuffer(audMsg, 'audio').catch(() => null);
            if (!buf) return send('âŒ Could not download audio.');
            await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true, contextInfo }, { quoted: message });
            return;
        }
 
        if (cmd === 'tovideo') {
            const msg    = message.message;
            const gifMsg = msg?.videoMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
            if (!gifMsg) return send('âŒ Reply to a *video or GIF* with `.tovideo` to convert/send as video.');
            const buf = await dlBuffer(gifMsg, 'video').catch(() => null);
            if (!buf) return send('âŒ Could not download video.');
            await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: fmt('ðŸŽ¥ Video'), contextInfo }, { quoted: message });
            return;
        }
 
        if (cmd === 'sendaudio') {
            if (!text) return send('âŒ *Usage:* `.sendaudio <audio url>`\n\nSends any audio from URL as a voice note.');
            try {
                const res = await axios.get(text, { responseType: 'arraybuffer', timeout: 30000 });
                await sock.sendMessage(jid, { audio: Buffer.from(res.data), mimetype: 'audio/ogg; codecs=opus', ptt: true, contextInfo }, { quoted: message });
            } catch { return send('âŒ Failed to download audio from URL.'); }
            return;
        }
 
        if (cmd === 'sendvideo') {
            if (!text) return send('âŒ *Usage:* `.sendvideo <video url>`\n\nSends any video from URL.');
            try {
                const res = await axios.get(text, { responseType: 'arraybuffer', timeout: 60000 });
                await sock.sendMessage(jid, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: fmt('ðŸŽ¥ Video'), contextInfo }, { quoted: message });
            } catch { return send('âŒ Failed to download video from URL.'); }
            return;
        }
 
        if (cmd === 'snack') {
            if (!text) return send('âŒ *Usage:* `.snack <snackvideo url>`');
            return send('âš ï¸ Snack Video downloader is unavailable. Try SnapTik.app or SaveFrom.net instead.');
        }
 
        if (cmd === 'play') {
            if (!text) return send('âŒ *Usage:* `.play <song name>`\n\nDownloads audio from YouTube by song name.');
            try {
                const results = await ytSearch(text, 1);
                const first = results[0];
                if (!first?.url) return send(`âŒ No YouTube results for: *${text}*`);
 
                const dlRes = await axios.get(
                    `${DC_BASE}/download/ytmp3?url=${encodeURIComponent(first.url)}`,
                    { timeout: 35000 }
                );
                const audioUrl = dlRes.data?.result?.download_url || dlRes.data?.result?.downloadUrl
                              || dlRes.data?.result?.url || dlRes.data?.url || dlRes.data?.link;
                if (!audioUrl) return send(`âŒ Could not get audio for: *${first.title || text}*\n\nTry \`.ytmp3 <youtube url>\` with a direct URL.`);
 
                await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', contextInfo }, { quoted: message });
                await send(`ðŸŽµ *${first.title || text}*\nâ± ${first.durationRaw || 'N/A'}`);
            } catch (e) {
                return send(`âŒ Audio download failed: ${e.message?.slice(0, 80)}\n\nTry \`.ytmp3 <youtube url>\` with a direct URL.`);
            }
            return;
        }
 
        if (cmd === 'video') {
            if (!text) return send('âŒ *Usage:* `.video <youtube url or search term>`\n\nDownloads video from YouTube.');
            try {
                let ytUrl = text;
                let title = text;
                if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
                    const results = await ytSearch(text, 1);
                    if (results[0]?.url) { ytUrl = results[0].url; title = results[0].title || text; }
                }
                const dlRes = await axios.get(
                    `${DC_BASE}/download/ytmp4?url=${encodeURIComponent(ytUrl)}`,
                    { timeout: 35000 }
                );
                const videoUrl = dlRes.data?.result?.download_url || dlRes.data?.result?.downloadUrl
                               || dlRes.data?.result?.url || dlRes.data?.url || dlRes.data?.link;
                if (!videoUrl) return send(`âŒ Could not get video. Use \`.ytmp4 <youtube url>\` for a direct URL.`);
 
                await sock.sendMessage(jid, {
                    video: { url: videoUrl }, mimetype: 'video/mp4',
                    caption: fmt(`ðŸŽ¥ ${title}`), contextInfo
                }, { quoted: message });
            } catch (e) {
                return send(`âŒ Video download failed: ${e.message?.slice(0, 80)}\n\nUse \`.ytmp4 <youtube url>\` for a direct URL.`);
            }
            return;
        }
    }
};

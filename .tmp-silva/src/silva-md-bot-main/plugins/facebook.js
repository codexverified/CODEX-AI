'use strict';

const axios = require('axios');
const { getStr } = require('../lib/theme');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Strategy 1: cobalt.tools (primary — actively maintained public API) ───────
async function tryCobalt(url) {
    const res = await axios.post('https://api.cobalt.tools/', { url, downloadMode: 'auto' }, {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': UA,
        },
        timeout: 20000,
    });
    const d = res.data;
    // status: 'redirect' | 'stream' → single video URL
    // status: 'picker' → array of items
    if (d?.status === 'redirect' || d?.status === 'stream') {
        if (!d.url) throw new Error('cobalt: no url in response');
        return { videoUrl: d.url, title: 'Facebook Video' };
    }
    if (d?.status === 'picker' && Array.isArray(d.picker)) {
        const video = d.picker.find(i => i.type === 'video') || d.picker[0];
        if (!video?.url) throw new Error('cobalt: picker has no url');
        return { videoUrl: video.url, title: 'Facebook Video' };
    }
    if (d?.error?.code) throw new Error(`cobalt: ${d.error.code}`);
    throw new Error('cobalt: unexpected response');
}

// ─── Strategy 2: snapsave.app (supports Facebook + Instagram) ─────────────────
async function trySnapsave(url) {
    const r1 = await axios.get('https://snapsave.app/', {
        headers: { 'User-Agent': UA },
        timeout: 12000,
    });
    const cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const r2 = await axios.post('https://snapsave.app/action.php',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies,
                'Referer': 'https://snapsave.app/',
                'Origin': 'https://snapsave.app',
                'User-Agent': UA,
            },
            timeout: 18000,
        }
    );
    const raw = typeof r2.data === 'string' ? r2.data : JSON.stringify(r2.data);
    if (raw.includes('Unable to connect') || raw.includes('error_api')) throw new Error('snapsave: blocked');

    // snapsave may encode the result with eval()
    let decoded = raw;
    try {
        const holder = { val: '' };
        const patched = raw.replace(/\beval\s*\(/, 'holder.val=(');
        new Function('holder', patched)(holder);
        if (holder.val) decoded = holder.val;
    } catch (_) {}

    // Extract video URL from HTML
    const hd  = decoded.match(/href=["'](https?:\/\/[^"']*video[^"']*)["'][^>]*>\s*(?:HD|High)/i);
    const sd  = decoded.match(/href=["'](https?:\/\/[^"']*video[^"']*)["'][^>]*>\s*(?:SD|Normal)/i);
    const any = decoded.match(/href=["'](https?:\/\/[^"']*(?:fbcdn|facebook)[^"']*\.mp4[^"']*)["']/i);
    const videoUrl = hd?.[1] || sd?.[1] || any?.[1];
    if (!videoUrl) throw new Error('snapsave: no video url found');
    return { videoUrl: videoUrl.replace(/&amp;/g, '&'), title: 'Facebook Video' };
}

// ─── Strategy 3: fdown.net ────────────────────────────────────────────────────
async function tryFdown(url) {
    const r = await axios.post('https://fdown.net/search.php',
        new URLSearchParams({ URLz: url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://fdown.net/',
                'Origin': 'https://fdown.net',
                'User-Agent': UA,
            },
            timeout: 18000,
        }
    );
    const html = typeof r.data === 'string' ? r.data : '';
    const hd  = html.match(/id=["']?hdlink["']?[^>]*href=["']([^"']+)["']/i);
    const sd  = html.match(/id=["']?sdlink["']?[^>]*href=["']([^"']+)["']/i);
    // Also try generic mp4 link
    const any = html.match(/href=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
    const videoUrl = hd?.[1] || sd?.[1] || any?.[1];
    if (!videoUrl) throw new Error('fdown: no video url');
    return { videoUrl: videoUrl.replace(/&amp;/g, '&'), title: 'Facebook Video' };
}

// ─── Strategy 4: getvideourl.com ─────────────────────────────────────────────
async function tryGetVideoUrl(url) {
    const res = await axios.post('https://getvideourl.com/api/facebook',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': UA,
                'Referer': 'https://getvideourl.com/',
            },
            timeout: 15000,
        }
    );
    const d = res.data;
    const videoUrl = d?.hd || d?.sd || d?.url;
    if (!videoUrl) throw new Error('getvideourl: no url');
    return { videoUrl, title: d?.title || 'Facebook Video' };
}

// ─── Strategy 5: fdownloader.net ─────────────────────────────────────────────
async function tryFdownloader(url) {
    const res = await axios.post('https://fdownloader.net/api/ajaxSearch',
        `q=${encodeURIComponent(url)}&lang=en&web=facebook`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': UA,
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://fdownloader.net/',
            },
            timeout: 15000,
        }
    );
    const d    = res.data;
    const html = typeof d === 'string' ? d : d?.data || JSON.stringify(d);
    const hd   = html.match(/href=["'](https?:\/\/[^"']*video[^"']*)\s*["'][^>]*>\s*(?:HD|High)/i);
    const sd   = html.match(/href=["'](https?:\/\/[^"']*video[^"']*)\s*["'][^>]*>\s*(?:SD|Normal)/i);
    const any  = html.match(/href=["'](https?:\/\/(?:video\.f?acdn|[^"']*fbcdn)[^"']+\.mp4[^"']*)/i);
    const videoUrl = hd?.[1] || sd?.[1] || any?.[1];
    if (!videoUrl) throw new Error('fdownloader: no video url');
    return { videoUrl, title: 'Facebook Video' };
}

module.exports = {
    commands:    ['facebook', 'fb', 'fbdl'],
    description: 'Download a Facebook video',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, prefix, contextInfo }) => {
        const url = args[0];
        if (!url) {
            return sock.sendMessage(sender, {
                text: `✳️ Please send a Facebook video link.\n\nExample: ${prefix}fb https://www.facebook.com/...`,
                contextInfo,
            }, { quoted: message });
        }

        const urlRegex = /^(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch|m\.facebook\.com|fb\.com)\b/i;
        if (!urlRegex.test(url)) {
            return sock.sendMessage(sender, {
                text: '⚠️ Please provide a valid Facebook URL.',
                contextInfo,
            }, { quoted: message });
        }

        await sock.sendMessage(sender, { text: '📥 Fetching Facebook video...', contextInfo }, { quoted: message });

        const STRATEGIES = [
            { name: 'cobalt.tools',    fn: () => tryCobalt(url)       },
            { name: 'snapsave',        fn: () => trySnapsave(url)      },
            { name: 'fdown.net',       fn: () => tryFdown(url)         },
            { name: 'getvideourl',     fn: () => tryGetVideoUrl(url)   },
            { name: 'fdownloader.net', fn: () => tryFdownloader(url)   },
        ];

        let videoUrl = null;
        let title    = 'Facebook Video';
        const errors = [];

        for (const { name, fn } of STRATEGIES) {
            try {
                const r = await fn();
                if (r?.videoUrl) {
                    videoUrl = r.videoUrl;
                    title    = r.title || title;
                    console.log(`[FB] ✓ ${name}`);
                    break;
                }
            } catch (e) {
                const msg = String(e?.message || e).slice(0, 80);
                errors.push(`${name}: ${msg}`);
                console.warn(`[FB] ✗ ${name}: ${msg}`);
            }
        }

        if (!videoUrl) {
            return sock.sendMessage(sender, {
                text:
                    `❌ *Facebook Download Failed*\n\n` +
                    `All sources failed — this happens with private or restricted videos.\n\n` +
                    `_Last error: ${errors.slice(-1)[0] || 'unknown'}_\n\n` +
                    `🔗 Try manually:\nhttps://snapsave.app\nhttps://fdown.net`,
                contextInfo,
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(sender, {
                video:   { url: videoUrl },
                caption: `🦋 *Facebook*  •  📌 ${title}`,
                contextInfo: {
                    ...contextInfo,
                    externalAdReply: {
                        title:                 'Facebook Downloader',
                        body:                  'Powered by ' + (getStr('botName') || 'Silva MD'),
                        thumbnailUrl:          'https://files.catbox.moe/5uli5p.jpeg',
                        sourceUrl:             url,
                        mediaType:             1,
                        renderLargerThumbnail: true,
                    },
                },
            }, { quoted: message });
        } catch {
            await sock.sendMessage(sender, {
                document: { url: videoUrl },
                mimetype: 'video/mp4',
                fileName: `facebook_${Date.now()}.mp4`,
                caption:  `🦋 *Facebook*  •  📌 ${title}`,
                contextInfo,
            }, { quoted: message });
        }
    },
};

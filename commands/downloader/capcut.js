'use strict';
const axios = require('axios');
 
// nexoracle.com returns bot-protection HTML, not API data â€” removed.
// Using ssstik.io API (no-key endpoint for CapCut) as primary; link fallback secondary.
 
module.exports = {
    commands:    ['capcut', 'capcutdl'],
    category: 'downloader',
    description: 'Download CapCut videos without watermark',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo }) => {
        const url = args[0];
        if (!url || !/capcut\.com/i.test(url)) {
            return sock.sendMessage(sender, {
                text: 'âŒ Please provide a valid CapCut URL.\nExample: `.capcut https://www.capcut.com/share/...`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(sender, { text: 'â³ Fetching CapCut video...', contextInfo }, { quoted: message });
 
        try {
            // Try ssstik.io API (public no-key endpoint)
            const formData = new URLSearchParams({ id: url, locale: 'en', tt: String(Date.now()) });
            const res = await axios.post('https://ssstik.io/abc?url=dl', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent':   'Mozilla/5.0',
                    'Referer':      'https://ssstik.io/',
                },
                timeout: 20000
            });
            const html = res.data || '';
            const match = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
                       || html.match(/href="(https?:\/\/[^"]+)"\s*[^>]*>\s*(?:Without|No)/i);
            const videoUrl = match?.[1];
            if (!videoUrl) throw new Error('no video found');
            await sock.sendMessage(sender, {
                video:   { url: videoUrl },
                caption: `âœ‚ï¸ *CapCut Download*\n_Powered by CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(sender, {
                text:
                    `âœ‚ï¸ *CapCut Download*\n\n` +
                    `Direct download unavailable. Use one of these free tools:\n\n` +
                    `ðŸ”— https://ssstik.io\n` +
                    `ðŸ”— https://capcutdownloader.io\n\n` +
                    `_Paste your CapCut link there to download_`,
                contextInfo
            }, { quoted: message });
        }
    }
};

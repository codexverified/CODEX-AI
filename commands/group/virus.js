'use strict';
 
const axios  = require('axios');
 
const VT_KEY = '23e62ab81fe1c82d865f39fc674dead42b1ae2b3079fffebf96be5b19aebcf47';
 
module.exports = {
    commands:    ['scanurl', 'urlscan', 'checksafe'],
    category: 'group',
    description: 'Scan a URL with VirusTotal',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        if (!args[0]) {
            return sock.sendMessage(sender, {
                text: 'âŒ Please provide a URL to scan.\nExample: .scanurl https://example.com',
                contextInfo
            }, { quoted: message });
        }
 
        let url = args[0];
        if (!url.match(/^https?:\/\//)) url = 'https://' + url;
 
        try { new URL(url); } catch {
            return sock.sendMessage(sender, {
                text: 'âš ï¸ Invalid URL format.',
                contextInfo
            }, { quoted: message });
        }
 
        await sock.sendMessage(sender, {
            text: 'ðŸ” Scanning URL with VirusTotal... (may take ~15 seconds)',
            contextInfo
        }, { quoted: message });
 
        try {
            const headers = { 'x-apikey': VT_KEY };
            const params  = new URLSearchParams({ url });
 
            const submitRes = await axios.post(
                'https://www.virustotal.com/api/v3/urls',
                params.toString(),
                { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
            );
            const analysisId = submitRes.data.data.id;
 
            await new Promise(r => setTimeout(r, 8000));
 
            const resultRes = await axios.get(
                `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
                { headers, timeout: 20000 }
            );
            const stats    = resultRes.data.data.attributes.stats;
            const scanDate = new Date(resultRes.data.data.attributes.date * 1000).toLocaleString();
 
            const status = stats.malicious > 0
                ? `âŒ MALICIOUS (${stats.malicious} engines detected)`
                : stats.suspicious > 0
                    ? `âš ï¸ SUSPICIOUS (${stats.suspicious} engines flagged)`
                    : 'âœ… SAFE';
 
            await sock.sendMessage(sender, {
                text:
`ðŸ›¡ï¸ *URL Safety Report*
 
ðŸ”— *URL:* ${url}
ðŸ“… *Scanned:* ${scanDate}
ðŸ›¡ï¸ *Status:* ${status}
 
*Scan Results:*
âœ”ï¸ Harmless: ${stats.harmless}
âš ï¸ Suspicious: ${stats.suspicious}
âŒ Malicious: ${stats.malicious}
â“ Undetected: ${stats.undetected}`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[VirusScan]', err.message);
            await sock.sendMessage(sender, {
                text: `âš ï¸ Scan failed: ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};

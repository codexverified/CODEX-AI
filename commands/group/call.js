'use strict';
 
const os = require('os');
const { getStr } = require('../../lib/theme');
 
module.exports = {
    commands:    ['call', 'support'],
    category: 'group',
    description: 'Support panel',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const botName = getStr('botName') || 'CODEX AI';
        const pic     = getStr('pic1') || 'https://files.catbox.moe/5uli5p.jpeg';
 
        const nairobiTime = new Date().toLocaleTimeString('en-KE', {
            hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Africa/Nairobi'
        });
        const nairobiDate = new Date().toLocaleDateString('en-KE', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi'
        });
 
        const uptime  = process.uptime();
        const hours   = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
 
        const sub = args[0]?.toLowerCase() || 'menu';
 
        if (sub === 'status') {
            return sock.sendMessage(sender, {
                text:
`ðŸ–¥ï¸ *System Status*
 
â° ${nairobiTime} â€” ${nairobiDate}
â³ Uptime: ${hours}h ${minutes}m ${seconds}s
ðŸ’» Platform: ${os.platform()} ${os.arch()}
ðŸ§  Memory: ${(os.freemem() / 1048576).toFixed(0)} MB free of ${(os.totalmem() / 1048576).toFixed(0)} MB`,
                contextInfo
            }, { quoted: message });
        }
 
        if (sub === 'social') {
            return sock.sendMessage(sender, {
                text:
`ðŸ“± *Codex Tech Social Media*
 
â€¢ Facebook: https://web.facebook.com/codex.tech.inc
â€¢ Instagram: https://instagram.com/codex.tech.inc
â€¢ TikTok: https://www.tiktok.com/@codex.tech.inc
â€¢ X (Twitter): https://x.com/codexai_official`,
                contextInfo
            }, { quoted: message });
        }
 
        await sock.sendMessage(sender, {
            image:   { url: pic },
            caption:
`ã€Ž *${botName}* ã€
Â© 2025 *CodexAI Inc*
 
â° *${nairobiTime}*
ðŸ“… *${nairobiDate}*
 
*Support Options:*
â€¢ .call status â€” System status
â€¢ .call social â€” Social media links
â€¢ WhatsApp: https://wa.me/254700143167`,
            contextInfo: {
                ...contextInfo,
                externalAdReply: {
                    title:        `${botName} Support`,
                    body:         'Available 24/7',
                    thumbnailUrl: pic,
                    sourceUrl:    'https://wa.me/254700143167',
                    mediaType:    1
                }
            }
        }, { quoted: message });
    }
};

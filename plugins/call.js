'use strict';
 
const os = require('os');
const { getStr } = require('../lib/theme');
 
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
`🖥️ *System Status*
 
⏰ ${nairobiTime} — ${nairobiDate}
⏳ Uptime: ${hours}h ${minutes}m ${seconds}s
💻 Platform: ${os.platform()} ${os.arch()}
🧠 Memory: ${(os.freemem() / 1048576).toFixed(0)} MB free of ${(os.totalmem() / 1048576).toFixed(0)} MB`,
                contextInfo
            }, { quoted: message });
        }
 
        if (sub === 'social') {
            return sock.sendMessage(sender, {
                text:
`📱 *Codex Tech Social Media*
 
• Facebook: https://web.facebook.com/codex.tech.inc
• Instagram: https://instagram.com/codex.tech.inc
• TikTok: https://www.tiktok.com/@codex.tech.inc
• X (Twitter): https://x.com/codexai_official`,
                contextInfo
            }, { quoted: message });
        }
 
        await sock.sendMessage(sender, {
            image:   { url: pic },
            caption:
`『 *${botName}* 』
© 2025 *CodexAI Inc*
 
⏰ *${nairobiTime}*
📅 *${nairobiDate}*
 
*Support Options:*
• .call status — System status
• .call social — Social media links
• WhatsApp: https://wa.me/254700143167`,
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

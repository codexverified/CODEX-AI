'use strict';
 
const os = require('os');
const { getStr } = require('../../lib/theme');
 
module.exports = {
    commands:    ['uptime', 'runtime'],
    category: 'bot',
    description: 'Show bot uptime and system stats',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        try {
            const botName = getStr('botName') || 'CODEX AI';
            const pic     = getStr('pic1') || 'https://files.catbox.moe/5uli5p.jpeg';
 
            const uptime  = process.uptime();
            const h = Math.floor(uptime / 3600);
            const m = Math.floor((uptime % 3600) / 60);
            const s = Math.floor(uptime % 60);
 
            const cpu      = os.cpus()[0]?.model || 'Unknown CPU';
            const platform = os.platform().toUpperCase();
            const totalMem = (os.totalmem() / 1073741824).toFixed(2);
            const freeMem  = (os.freemem()  / 1073741824).toFixed(2);
            const latency  = message.messageTimestamp
                ? Date.now() - message.messageTimestamp * 1000 : 0;
 
            const caption =
`â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
      âœ¦ *${botName} Runtime* âœ¦
â”—â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
 
ðŸ•’ *Uptime:* ${h}h ${m}m ${s}s
âš¡ *Latency:* ${latency} ms
ðŸ–¥ *CPU:* ${cpu}
ðŸ— *Platform:* ${platform}
ðŸ›  *RAM:* ${freeMem} GB / ${totalMem} GB
 
âœ¨ _Powered by ${botName}_`;
 
            await sock.sendMessage(sender, {
                image:   { url: pic },
                caption,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[Uptime]', err.message);
            await sock.sendMessage(sender, {
                text: 'âš ï¸ Failed to fetch runtime details.',
                contextInfo
            }, { quoted: message });
        }
    }
};

'use strict';
 
 
 
module.exports = {
    commands:    ['blocklist', 'listblock'],
    category: 'owner',
    description: 'Show the bot\'s blocked numbers list â€” owner only',
    permission:  'owner',
    group:       false,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        try {
            const blocklist = await sock.fetchBlocklist();
 
            if (!blocklist?.length) {
                return sock.sendMessage(sender, {
                    text: 'ðŸ”“ *No numbers are currently blocked*',
                    contextInfo
                }, { quoted: message });
            }
 
            let txt      = `ðŸš« *Blocked Numbers List*\n\nâ€¢ Total: ${blocklist.length}\n\nâ”Œâ”€â”€â”€âŠ·\n`;
            const mentions = [];
            for (const num of blocklist) {
                const n = num.split('@')[0];
                txt += `â–¢ @${n}\n`;
                mentions.push(`${n}@s.whatsapp.net`);
            }
            txt += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€';
 
            await sock.sendMessage(sender, { text: txt, contextInfo }, { quoted: message });
        } catch (err) {
            console.error('[Blocklist]', err.message);
            await sock.sendMessage(sender, {
                text: `âŒ Failed to fetch blocklist: ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};

'use strict';
 
module.exports = {
    commands:    ['testhandler'],
    category: 'owner',
    description: 'Internal diagnostics â€” owner only',
    permission:  'owner',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const sub = args[0]?.toLowerCase() || 'status';
 
        const info =
`ðŸ”§ *Handler Diagnostics*
 
ðŸ“¦ *Sub-command:* ${sub}
ðŸ•’ *Timestamp:* ${new Date().toISOString()}
ðŸ“Š *Memory:* ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB
â³ *Uptime:* ${Math.floor(process.uptime())}s`;
 
        await sock.sendMessage(sender, { text: info, contextInfo }, { quoted: message });
    }
};

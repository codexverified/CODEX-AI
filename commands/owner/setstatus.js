'use strict';
 
module.exports = {
    commands:    ['poststatus', 'textstatus', 'mystatustext'],
    category: 'owner',
    description: 'Post a text WhatsApp status from the bot',
    permission:  'owner',
    group:       false,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const text = args.join(' ');
        if (!text) {
            return sock.sendMessage(sender, {
                text: 'ðŸ“¢ Usage: .poststatus <text>\nExample: .poststatus CODEX AI is online! ðŸ”¥',
                contextInfo
            }, { quoted: message });
        }
        try {
            await sock.sendMessage('status@broadcast', {
                text,
                backgroundColor: '#075e54',
                font: 0
            }, { statusJidList: [sender] });
            await sock.sendMessage(sender, {
                text: `âœ… *Status posted!*\n\nðŸ“¢ "${text}"`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ Status post failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

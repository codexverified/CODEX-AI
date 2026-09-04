'use strict';
 
const config = require('../../config');
module.exports = {
    commands:    ['antidelete', 'antidel'],
    category: 'admin',
    description: 'Toggle anti-delete â€” recovers deleted and edited messages and forwards them to you',
    permission:  'owner',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { safeSend, contextInfo } = ctx;
        const action = (args[0] || '').toLowerCase();
 
        if (action === 'on') {
            config.ANTIDELETE_GROUP   = true;
            config.ANTIDELETE_PRIVATE = true;
            await safeSend({
                text: 'ðŸ›¡ï¸ *Anti-Delete is ON*\n\nDeleted and edited messages will be recovered and forwarded to you in both groups and private chats.',
                contextInfo
            }, { quoted: message });
        } else if (action === 'off') {
            config.ANTIDELETE_GROUP   = false;
            config.ANTIDELETE_PRIVATE = false;
            await safeSend({ text: 'ðŸ›¡ï¸ *Anti-Delete is OFF*', contextInfo }, { quoted: message });
        } else {
            const groupStatus   = config.ANTIDELETE_GROUP   ? 'âœ… ON' : 'âŒ OFF';
            const privateStatus = config.ANTIDELETE_PRIVATE ? 'âœ… ON' : 'âŒ OFF';
            await safeSend({
                text: `ðŸ›¡ï¸ *Anti-Delete Status*\n\nðŸ“Œ Groups: ${groupStatus}\nðŸ“Œ Private: ${privateStatus}\n\n*Usage:*\nâ€¢ \`.antidelete on\` â€” enable\nâ€¢ \`.antidelete off\` â€” disable`,
                contextInfo
            }, { quoted: message });
        }
    }
};

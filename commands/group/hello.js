'use strict';
 
module.exports = {
    commands:    ['hello'],
    category: 'group',
    description: 'Simple hello test command',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = message.key.remoteJid;
        await sock.sendMessage(jid, {
            text: `âœ… *Hello!*\n\nArgs received: ${args.join(', ') || 'none'}`,
            contextInfo
        }, { quoted: message });
    }
};

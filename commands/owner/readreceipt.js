'use strict';
const config = require('../../config');
 
module.exports = {
    commands: ['readreceipt', 'bluetick', 'readtick', 'receipt'],
    category: 'owner',
    description: 'Toggle read receipts (blue ticks) on or off',
    usage: '.bluetick on/off',
    permission: 'owner',
    group: false,
    private: true,
 
    run: async (sock, message, args, ctx) => {
        const { reply } = ctx;
        const action = (args[0] || '').toLowerCase();
 
        if (action === 'on') {
            config.READ_RECEIPT = true;
            if (sock.sendReadReceipts !== undefined) {
                sock.sendReadReceipts = true;
            }
            return reply(
                `ðŸ‘ï¸ *Read Receipts: ON*\n\n` +
                `Blue ticks will now be sent when you read messages.`
            );
        }
 
        if (action === 'off') {
            config.READ_RECEIPT = false;
            if (sock.sendReadReceipts !== undefined) {
                sock.sendReadReceipts = false;
            }
            return reply(
                `ðŸ«¥ *Read Receipts: OFF*\n\n` +
                `Blue ticks are now hidden â€” others won't know when you've read their messages.\n\n` +
                `_Note: You also won't see their read receipts._`
            );
        }
 
        const status = config.READ_RECEIPT !== false ? 'âœ… ON (Blue ticks visible)' : 'âŒ OFF (Hidden)';
        reply(
            `ðŸ‘ï¸ *Read Receipts (Blue Ticks)*\n\n` +
            `Status: ${status}\n\n` +
            `*Usage:*\n` +
            `â€¢ \`.bluetick on\` â€” enable (show blue ticks)\n` +
            `â€¢ \`.bluetick off\` â€” disable (hide blue ticks)\n\n` +
            `_Aliases: .readreceipt  .readtick  .receipt_`
        );
    },
};

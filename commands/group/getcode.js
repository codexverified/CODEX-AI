'use strict';
 
const axios = require('axios');
const { fmt } = require('../../lib/theme');
 
const SESSION_SERVER = 'https://session.codexai.co.ke';
 
async function fetchPairCode(phoneNumber) {
    const clean = String(phoneNumber).replace(/\D/g, '');
    if (clean.length < 7) throw new Error('Invalid phone number');
    const res = await axios.get(`${SESSION_SERVER}/code`, {
        params:  { number: clean },
        timeout: 15000,
        headers: { 'User-Agent': 'CODEX AI/2.0' }
    });
    const code = res.data?.code || res.data?.pairCode || res.data?.pair_code;
    if (!code) throw new Error('No code returned from server');
    return { code, number: clean };
}
 
module.exports = {
    commands:    ['getcode', 'paircode', 'getpair', 'sessioncode', 'connectbot'],
    category: 'group',
    description: 'Fetch a WhatsApp pair code from the Codex session server to connect your bot',
    usage:       '.getcode 2547XXXXXXXX',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { sender, jid, contextInfo, reply } = ctx;
 
        // Number can come from args or be inferred from sender
        let rawNumber = args.join('').replace(/\D/g, '');
 
        // If no number given, show usage
        if (!rawNumber) {
            return reply(fmt(
                `ðŸ”— *Get WhatsApp Pair Code*\n\n` +
                `Enter your phone number (with country code) to get a pair code from the Codex session server.\n\n` +
                `*Usage:*\n` +
                `â€¢ \`.getcode 2547XXXXXXXX\`\n` +
                `â€¢ \`.getcode +1 555 000 1234\`\n\n` +
                `*How to use the code:*\n` +
                `1ï¸âƒ£ Open WhatsApp â†’ Linked Devices\n` +
                `2ï¸âƒ£ Tap *Link with phone number*\n` +
                `3ï¸âƒ£ Enter the 8-character code shown\n\n` +
                `_Codes expire in 60 seconds â€” enter it quickly!_\n\n` +
                `ðŸŒ Or visit: ${SESSION_SERVER}`
            ));
        }
 
        await reply(fmt(`â³ Fetching pair code for +${rawNumber}â€¦`));
 
        try {
            const { code, number } = await fetchPairCode(rawNumber);
 
            // Format code as XXXX-XXXX for readability
            const formatted = code.length === 8
                ? `${code.slice(0, 4)}-${code.slice(4)}`
                : code;
 
            const text = fmt(
                `ðŸ”— *WhatsApp Pair Code*\n\n` +
                `ðŸ“ž *Number:* +${number}\n` +
                `ðŸ”‘ *Pair Code:*\n\n` +
                `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n` +
                `â”‚  \`${formatted}\`  â”‚\n` +
                `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n` +
                `*How to link:*\n` +
                `1ï¸âƒ£ Open WhatsApp â†’ *Linked Devices*\n` +
                `2ï¸âƒ£ Tap *Link with phone number*\n` +
                `3ï¸âƒ£ Enter the code above\n\n` +
                `âš ï¸ _Code expires in ~60 seconds. Enter it immediately!_\n\n` +
                `ðŸŒ *Session server:* ${SESSION_SERVER}\n` +
                `_Powered by CODEX AI_`
            );
 
            // Send to DM for privacy (not in group)
            if (jid?.endsWith('@g.us')) {
                await sock.sendMessage(sender, { text: text, contextInfo }, { quoted: message });
                await reply(fmt(`âœ… Pair code sent to your DM â€” check it there.`));
            } else {
                await sock.sendMessage(jid, { text: text, contextInfo }, { quoted: message });
            }
 
        } catch (err) {
            const msg = err.response?.status === 429
                ? 'âš ï¸ Rate limited â€” wait a moment then try again.'
                : `âŒ Failed to fetch pair code: ${err.message}\n\nTry visiting ${SESSION_SERVER} directly.`;
            reply(fmt(msg));
        }
    }
};

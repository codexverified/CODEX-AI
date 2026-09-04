'use strict';
 
// Runtime toggles â€” override config values without editing config.env
// Read by codex.js status handler when present
if (global.autoStatusFlags === undefined) {
    global.autoStatusFlags = {
        seen:  null,   // null = use config default, true/false = runtime override
        react: null,
    };
}
 
const FLAGS = global.autoStatusFlags;
 
module.exports = {
    commands:    ['autoview', 'autolike', 'autoreact', 'autostatus', 'statusconfig'],
    category: 'bot',
    description: 'Control automatic status viewing and liking at runtime',
    usage:       '.autoview on/off  |  .autolike on/off  |  .autostatus',
    permission:  'owner',
    group:       false,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        const sub = (args[0] || '').toLowerCase();
 
        // â”€â”€ .autostatus / .statusconfig â€” show current state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (rawCmd === 'autostatus' || rawCmd === 'statusconfig') {
            const config = require('../../config');
            const seenEff  = FLAGS.seen  !== null ? FLAGS.seen  : config.AUTO_STATUS_SEEN;
            const reactEff = FLAGS.react !== null ? FLAGS.react : config.AUTO_STATUS_REACT;
            const seenSrc  = FLAGS.seen  !== null ? '_(runtime override)_' : '_(from config.env)_';
            const reactSrc = FLAGS.react !== null ? '_(runtime override)_' : '_(from config.env)_';
 
            return sock.sendMessage(jid, {
                text: [
                    `ðŸ“Š *Auto-Status Settings*`,
                    ``,
                    `ðŸ‘ï¸ *Auto View:*   ${seenEff  ? 'âœ… ON' : 'âŒ OFF'}  ${seenSrc}`,
                    `â¤ï¸ *Auto Like:*   ${reactEff ? 'âœ… ON' : 'âŒ OFF'}  ${reactSrc}`,
                    ``,
                    `*Commands:*`,
                    `â€¢ \`.autoview on\`  â€” force view all statuses`,
                    `â€¢ \`.autoview off\` â€” stop viewing statuses`,
                    `â€¢ \`.autolike on\`  â€” force react/like all statuses`,
                    `â€¢ \`.autolike off\` â€” stop reacting to statuses`,
                    `â€¢ \`.autostatus\`   â€” show this panel`,
                ].join('\n'),
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .autoview on/off â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (rawCmd === 'autoview') {
            if (sub !== 'on' && sub !== 'off') {
                const config = require('../../config');
                const eff = FLAGS.seen !== null ? FLAGS.seen : config.AUTO_STATUS_SEEN;
                return sock.sendMessage(jid, {
                    text: `ðŸ‘ï¸ *Auto View* is currently *${eff ? 'ON' : 'OFF'}*\n\nUsage: \`.autoview on\` or \`.autoview off\``,
                    contextInfo
                }, { quoted: message });
            }
            FLAGS.seen = sub === 'on';
            return sock.sendMessage(jid, {
                text: FLAGS.seen
                    ? `ðŸ‘ï¸ *Auto View: ON*\n\nâœ… Bot will now *view every status* as soon as it arrives â€” no exceptions.`
                    : `ðŸ‘ï¸ *Auto View: OFF*\n\nâŒ Bot will stop automatically viewing statuses.`,
                contextInfo
            }, { quoted: message });
        }
 
        // â”€â”€ .autolike / .autoreact on/off â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (rawCmd === 'autolike' || rawCmd === 'autoreact') {
            if (sub !== 'on' && sub !== 'off') {
                const config = require('../../config');
                const eff = FLAGS.react !== null ? FLAGS.react : config.AUTO_STATUS_REACT;
                return sock.sendMessage(jid, {
                    text: `â¤ï¸ *Auto Like* is currently *${eff ? 'ON' : 'OFF'}*\n\nUsage: \`.autolike on\` or \`.autolike off\``,
                    contextInfo
                }, { quoted: message });
            }
            FLAGS.react = sub === 'on';
            return sock.sendMessage(jid, {
                text: FLAGS.react
                    ? `â¤ï¸ *Auto Like: ON*\n\nâœ… Bot will now *react to every status* with an emoji â€” no exceptions.`
                    : `â¤ï¸ *Auto Like: OFF*\n\nâŒ Bot will stop automatically reacting to statuses.`,
                contextInfo
            }, { quoted: message });
        }
    }
};

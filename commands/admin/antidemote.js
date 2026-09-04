'use strict';
 
// Groups where anti-demote is enabled â€” read by codex.js event handler
const enabledGroups = new Set();
global.antiDemoteGroups = enabledGroups;
 
module.exports = {
    commands:    ['antidemote'],
    category: 'admin',
    description: 'Kick anyone who demotes a group admin (requires bot to be admin)',
    permission:  'admin',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, safeSend, contextInfo, isBotAdmin, theme } = ctx;
        const action = (args[0] || '').toLowerCase();
 
        if (!isBotAdmin) {
            await safeSend({
                text: theme.botAdmin || 'âš ï¸ *Anti-Demote* requires the bot to be a group admin first.',
                contextInfo
            }, { quoted: message });
            return;
        }
 
        if (action === 'on') {
            enabledGroups.add(jid);
            await safeSend({
                text: 'ðŸ›¡ï¸ *Anti-Demote is ON*\n\nAnyone who demotes a group admin will be removed from the group.',
                contextInfo
            }, { quoted: message });
        } else if (action === 'off') {
            enabledGroups.delete(jid);
            await safeSend({
                text: 'ðŸ›¡ï¸ *Anti-Demote is OFF*',
                contextInfo
            }, { quoted: message });
        } else {
            const status = enabledGroups.has(jid) ? 'âœ… ON' : 'âŒ OFF';
            await safeSend({
                text: `ðŸ›¡ï¸ *Anti-Demote*\nStatus: ${status}\n\n*Usage:*\nâ€¢ \`.antidemote on\` â€” enable\nâ€¢ \`.antidemote off\` â€” disable`,
                contextInfo
            }, { quoted: message });
        }
    }
};

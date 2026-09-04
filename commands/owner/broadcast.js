'use strict';
 
module.exports = {
    commands:    ['broadcast', 'bc'],
    category: 'owner',
    description: 'Broadcast a message to all groups the bot is in (owner only)',
    usage:       '.broadcast Your message here',
    permission:  'owner',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
 
        const text = args.join(' ').trim();
        if (!text) {
            return sock.sendMessage(jid, {
                text: 'âŒ Provide a message to broadcast.\n\nExample: `.broadcast Hello everyone!`',
                contextInfo
            }, { quoted: message });
        }
 
        let groups;
        try {
            groups = await sock.groupFetchAllParticipating();
        } catch (e) {
            return sock.sendMessage(jid, { text: `âŒ Failed to fetch groups: ${e.message}`, contextInfo }, { quoted: message });
        }
 
        const groupJids = Object.keys(groups);
        if (!groupJids.length) {
            return sock.sendMessage(jid, { text: 'âŒ Bot is not in any groups.', contextInfo }, { quoted: message });
        }
 
        await sock.sendMessage(jid, {
            text: `ðŸ“¢ Broadcasting to *${groupJids.length}* group(s)â€¦`,
            contextInfo
        }, { quoted: message });
 
        let sent = 0, failed = 0;
        for (const g of groupJids) {
            try {
                await sock.sendMessage(g, { text: `ðŸ“¢ *Broadcast*\n\n${text}` });
                sent++;
                await new Promise(r => setTimeout(r, 800));
            } catch {
                failed++;
            }
        }
 
        await sock.sendMessage(jid, {
            text: `âœ… Broadcast complete.\nâ€¢ Sent: *${sent}*\nâ€¢ Failed: *${failed}*`,
            contextInfo
        });
    }
};

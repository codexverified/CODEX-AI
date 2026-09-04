'use strict';
 
const { fmt } = require('../../lib/theme');
 
module.exports = {
    commands: ['terminategc'],
    category: 'admin',
    description: 'Kick all members from the group and leave â€” permanently terminates the group.',
    permission:  'owner',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, isBotAdmin, groupMetadata, contextInfo, theme, isOwner } = ctx;
 
        const send = (text, extra = {}) =>
            sock.sendMessage(jid, { text: fmt(text), contextInfo, ...extra }, { quoted: message });
 
        // Owner-only guard
        if (!isOwner) return send('â›” Only the bot owner can use this command.');
 
        // Bot must be admin to kick members
        if (!isBotAdmin) return send(theme.botAdmin || 'â›” I need to be an admin to do this.');
 
        const participants = groupMetadata?.participants || [];
 
        // Determine bot's own JID to avoid kicking itself
        const botJid = sock.user?.id?.replace(/:.*@/, '@') || '';
 
        // Collect everyone except the bot itself
        const toKick = participants
            .map(p => p.id || p.jid || p.phoneNumber)
            .filter(Boolean)
            .filter(id => id !== botJid);
 
        if (toKick.length === 0) {
            await sock.groupLeave(jid);
            return;
        }
 
        await send(
            `âš ï¸ *Terminating groupâ€¦*\n\n` +
            `Removing ${toKick.length} participant(s) and leaving.\n` +
            `_This cannot be undone._`
        );
 
        // Kick in batches of 5 to avoid rate-limiting
        const BATCH = 5;
        for (let i = 0; i < toKick.length; i += BATCH) {
            const batch = toKick.slice(i, i + BATCH);
            try {
                await sock.groupParticipantsUpdate(jid, batch, 'remove');
            } catch {
                // Continue even if a batch partially fails (e.g. admins the bot can't remove)
            }
            // Small delay between batches
            if (i + BATCH < toKick.length) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
 
        // Leave the now-empty (or near-empty) group
        try {
            await sock.groupLeave(jid);
        } catch {
            // Already left or removed â€” ignore
        }
    }
};

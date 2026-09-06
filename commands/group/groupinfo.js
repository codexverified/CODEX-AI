'use strict';
 
const { fmt } = require('../../lib/theme');
 
module.exports = {
    commands:    ['groupinfo', 'ginfo', 'groupstats', 'gcinfo'],
    category: 'group',
    description: 'Show detailed group information and statistics',
    usage:       '.groupinfo',
    permission:  'member',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { jid, groupMetadata, reply, contextInfo } = ctx;
 
        let meta = groupMetadata;
        if (!meta) {
            try { meta = await sock.groupMetadata(jid); } catch { /* ignore */ }
        }
        if (!meta) return reply(fmt('âŒ Could not fetch group info.'));
 
        const participants = meta.participants || [];
        const admins    = participants.filter(p => p.admin);
        const superAdmins = participants.filter(p => p.admin === 'superadmin');
        const regularAdmins = participants.filter(p => p.admin === 'admin');
        const members   = participants.filter(p => !p.admin);
 
        const created = meta.creation
            ? new Date(meta.creation * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Unknown';
 
        const restrictions = meta.announce ? 'ðŸ”’ Admins only' : 'ðŸ”“ All members';
        const editInfo     = meta.restrict  ? 'ðŸ”’ Admins only' : 'ðŸ”“ All members';
        const joinApproval = meta.joinApprovalMode ? 'âœ… Required' : 'âŒ Not required';
 
        const groupId = jid.split('@')[0];
        const inviteCode = await sock.groupInviteCode(jid).catch(() => null);
        const inviteLink = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : 'N/A';
 
        const desc = meta.desc
            ? (meta.desc.length > 200 ? meta.desc.slice(0, 200) + 'â€¦' : meta.desc)
            : '_No description_';
 
        const text = fmt(
            `ðŸ“‹ *Group Info*\n\n` +
            `*Name:* ${meta.subject || 'N/A'}\n` +
            `*ID:* ${groupId}\n` +
            `*Created:* ${created}\n` +
            `*Owner:* @${(meta.owner || '').split('@')[0] || 'Unknown'}\n\n` +
            `*ðŸ‘¥ Members:* ${participants.length}\n` +
            `  â”œ ðŸ‘‘ Super Admin: ${superAdmins.length}\n` +
            `  â”œ ðŸ›¡ï¸ Admin: ${regularAdmins.length}\n` +
            `  â”” ðŸ‘¤ Members: ${members.length}\n\n` +
            `*âš™ï¸ Settings:*\n` +
            `  â”œ ðŸ“¢ Send messages: ${restrictions}\n` +
            `  â”œ âœï¸ Edit info: ${editInfo}\n` +
            `  â”” ðŸ”‘ Join approval: ${joinApproval}\n\n` +
            `*ðŸ“ Description:*\n${desc}\n\n` +
            `*ðŸ”— Invite Link:*\n${inviteLink}`
        );
 
        await sock.sendMessage(jid, {
            text,
            mentions: meta.owner ? [meta.owner] : [],
            contextInfo,
        }, { quoted: message });
    }
};

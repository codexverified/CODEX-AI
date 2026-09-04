'use strict';
 
module.exports = {
    commands:    ['members', 'listmembers', 'memberlist'],
    category: 'group',
    description: 'List all group members',
    permission:  'public',
    group:       true,
    private:     false,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        try {
            const meta    = await sock.groupMetadata(groupId);
            const members = meta.participants || [];
            const total   = members.length;
            const admins  = members.filter(m => m.admin).length;
            const list    = members.map((m, i) => {
                const num  = m.id.split('@')[0];
                const role = m.admin === 'superadmin' ? 'ðŸ‘‘' : m.admin ? 'ðŸ›¡ï¸' : 'ðŸ‘¤';
                return `${role} ${i + 1}. +${num}`;
            }).join('\n');
            await sock.sendMessage(groupId, {
                text:
`ðŸ‘¥ *${meta.subject} â€” Members*
 
${list}
 
ðŸ“Š Total: ${total} | ðŸ›¡ï¸ Admins: ${admins} | ðŸ‘¤ Members: ${total - admins}
_Powered by CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ Failed to fetch members: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

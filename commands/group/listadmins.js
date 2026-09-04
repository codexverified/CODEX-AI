'use strict';
 
module.exports = {
    commands:    ['admins', 'listadmins', 'adminlist'],
    category: 'group',
    description: 'List all group admins',
    permission:  'public',
    group:       true,
    private:     false,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        try {
            const meta   = await sock.groupMetadata(groupId);
            const admins = meta.participants.filter(m => m.admin);
            if (!admins.length) {
                return sock.sendMessage(groupId, { text: 'âŒ No admins found in this group.', contextInfo }, { quoted: message });
            }
            const list = admins.map((m, i) => {
                const num  = m.id.split('@')[0];
                const role = m.admin === 'superadmin' ? 'ðŸ‘‘ Super Admin' : 'ðŸ›¡ï¸ Admin';
                return `${i + 1}. @${num} â€” ${role}`;
            }).join('\n');
            const mentions = admins.map(m => m.id);
            await sock.sendMessage(groupId, {
                text: `ðŸ›¡ï¸ *${meta.subject} â€” Admins*\n\n${list}\n\nðŸ“Š Total admins: ${admins.length}\n_Powered by CODEX AI_`,
                mentions,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ Failed to fetch admins: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

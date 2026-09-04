'use strict';
 
module.exports = {
    commands:    ['profile', 'myprofile', 'whatsapp'],
    category: 'group',
    description: 'View a user WhatsApp profile info',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        const chatId   = groupId || sender;
        const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const target   = mentions[0] || sender;
        const num      = target.split('@')[0];
 
        try {
            const [status, ppUrl] = await Promise.allSettled([
                sock.fetchStatus(target),
                sock.profilePictureUrl(target, 'image')
            ]);
            const statusText = status.status === 'fulfilled' ? (status.value?.status || 'No status') : 'Could not fetch';
            const pp         = ppUrl.status === 'fulfilled' ? ppUrl.value : null;
 
            const text =
`ðŸ‘¤ *WhatsApp Profile*
 
ðŸ“ž *Number:* +${num}
ðŸ’¬ *Status:* ${statusText}
ðŸŒ *JID:* ${target}
 
_Powered by CODEX AI_`;
 
            if (pp) {
                await sock.sendMessage(chatId, { image: { url: pp }, caption: text, contextInfo }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text, contextInfo }, { quoted: message });
            }
        } catch (e) {
            await sock.sendMessage(chatId, { text: `âŒ Profile fetch failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

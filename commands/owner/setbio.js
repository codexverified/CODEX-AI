'use strict';
 
module.exports = {
    commands:    ['setbio', 'setabout', 'about'],
    category: 'owner',
    description: 'Set the bot WhatsApp About/Bio',
    permission:  'owner',
    group:       false,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const bio = args.join(' ');
        if (!bio) {
            return sock.sendMessage(sender, {
                text: 'ðŸ“ Usage: .setbio <text>\nExample: .setbio CODEX AI ðŸ¤– | Always Online',
                contextInfo
            }, { quoted: message });
        }
        try {
            await sock.updateProfileStatus(bio);
            await sock.sendMessage(sender, {
                text: `âœ… *Bot bio updated!*\n\nðŸ“ ${bio}`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(sender, { text: `âŒ Failed to update bio: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};

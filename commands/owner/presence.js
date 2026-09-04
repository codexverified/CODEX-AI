'use strict';
 
const config = require('../../config');
 
const VALID = ['composing', 'recording', 'paused', 'available', 'unavailable'];
 
module.exports = {
    commands:    ['presence', 'typing', 'recording', 'busy', 'online', 'offline'],
    category: 'owner',
    description: 'Set bot presence status in a chat',
    permission:  'owner',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, { sender, contextInfo }) => {
        const jid = message.key.remoteJid;
        const cmd = message.key.id
            ? (message.message?.conversation || message.message?.extendedTextMessage?.text || '')
                  .split(/\s+/)[0]
                  .replace(/^[^\w]/, '')
                  .toLowerCase()
            : '';
 
        let presenceType;
        if (cmd === 'typing')    presenceType = 'composing';
        else if (cmd === 'recording') presenceType = 'recording';
        else if (cmd === 'busy')      presenceType = 'unavailable';
        else if (cmd === 'online')    presenceType = 'available';
        else if (cmd === 'offline')   presenceType = 'unavailable';
        else presenceType = (args[0] || '').toLowerCase();
 
        if (!presenceType || !VALID.includes(presenceType)) {
            return sock.sendMessage(jid, {
                text:
                    `*Presence Command Usage:*\n\n` +
                    `â€¢ \`${config.PREFIX}typing\` â€” show typing...\n` +
                    `â€¢ \`${config.PREFIX}recording\` â€” show recording...\n` +
                    `â€¢ \`${config.PREFIX}online\` â€” show online\n` +
                    `â€¢ \`${config.PREFIX}offline\` â€” appear offline\n` +
                    `â€¢ \`${config.PREFIX}presence composing\` â€” typing\n` +
                    `â€¢ \`${config.PREFIX}presence recording\` â€” recording\n` +
                    `â€¢ \`${config.PREFIX}presence paused\` â€” paused\n` +
                    `â€¢ \`${config.PREFIX}presence available\` â€” online\n` +
                    `â€¢ \`${config.PREFIX}presence unavailable\` â€” offline`,
                contextInfo
            }, { quoted: message });
        }
 
        try {
            await sock.sendPresenceUpdate(presenceType, jid);
 
            const labels = {
                composing:   'âŒ¨ï¸ Typing...',
                recording:   'ðŸŽ¤ Recording...',
                paused:      'â¸ï¸ Paused',
                available:   'ðŸŸ¢ Online',
                unavailable: 'âš« Offline'
            };
 
            await sock.sendMessage(jid, {
                text: `${labels[presenceType] || presenceType} *presence set!*`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(jid, {
                text: `âŒ Failed to set presence: ${e.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};

'use strict';
 
const { fmt } = require('../../lib/theme');
 
module.exports = {
    commands:    ['tagall', 'mentionall', 'pingall'],
    category: 'group',
    description: 'Mention all members in the group',
    usage:       '.tagall [message]',
    permission:  'admin',
    group:       true,
    private:     false,
 
    run: async (sock, message, args, ctx) => {
        const { groupMetadata, jid, isAdmin, isBotAdmin, contextInfo, theme } = ctx;
 
        if (!isAdmin && !message.key.fromMe) {
            return sock.sendMessage(jid, {
                text: fmt(theme.admin || 'â›” Only group admins can use this command.'),
                contextInfo
            }, { quoted: message });
        }
 
        if (!isBotAdmin) {
            return sock.sendMessage(jid, {
                text: fmt(theme.botAdmin || 'â›” I need to be an admin to tag all members.'),
                contextInfo
            }, { quoted: message });
        }
 
        const participants = groupMetadata?.participants || [];
        if (!participants.length) {
            return sock.sendMessage(jid, {
                text: fmt('âŒ Could not fetch group members.'),
                contextInfo
            }, { quoted: message });
        }
 
        const customMsg = args.join(' ').trim();
        const header = customMsg || 'ðŸ“¢ *Attention Everyone!*';
 
        const mentions = participants.map(p => p.id || p.jid || p.phoneNumber).filter(Boolean);
        const memberLines = participants
            .map(p => `â€¢ @${p.id.split('@')[0]}`)
            .join('\n');
 
        const text = fmt(`${header}\n\n${memberLines}\n\nðŸ‘¥ *${participants.length} members tagged*`);
 
        await sock.sendMessage(jid, { text, mentions }, { quoted: message });
    }
};

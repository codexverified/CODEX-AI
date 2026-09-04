'use strict';
 
const axios  = require('axios');
const { fmt } = require('../../lib/theme');
 
const mailSessions = new Map();
 
module.exports = {
    commands: ['tempinbox', 'readmail', 'delmail', 'tempmailhelp'],
    category: 'group',
    description: 'Extended temporary mail commands',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const from = message.key.participant || message.key.remoteJid;
        const cmd  = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const text = args.join(' ').trim();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });
 
        if (cmd === 'tempmailhelp') {
            return send(
                `ðŸ“§ *TempMail Help*\n\n` +
                `*Commands:*\n` +
                `â€¢ \`.tempmail\` â€” Generate a new temporary email\n` +
                `â€¢ \`.tempinbox <email>\` â€” Check inbox of an email\n` +
                `â€¢ \`.readmail <email> <index>\` â€” Read a specific email (1, 2, 3...)\n` +
                `â€¢ \`.delmail\` â€” Clear your saved temp email\n` +
                `â€¢ \`.tempmailhelp\` â€” Show this help\n\n` +
                `*Example flow:*\n` +
                `1. \`.tempmail\` â†’ get email address\n` +
                `2. Use it to sign up somewhere\n` +
                `3. \`.tempinbox <email>\` â†’ check for new messages\n` +
                `4. \`.readmail <email> 1\` â†’ read first message`
            );
        }
 
        if (cmd === 'delmail') {
            mailSessions.delete(from);
            return send('ðŸ—‘ï¸ Your temp mail session cleared.\n\nUse `.tempmail` to generate a new one.');
        }
 
        if (cmd === 'tempinbox') {
            const address = text || mailSessions.get(from);
            if (!address) return send('âŒ Provide an email address.\n\n*Usage:* `.tempinbox <email@domain>`\n\nOr use `.tempmail` to generate one first.');
            if (!address.includes('@')) return send('âŒ Invalid email format. Include the full address including @domain.');
 
            try {
                await sock.sendPresenceUpdate('composing', jid);
                let inbox = null;
 
                try {
                    const { TempMail } = require('tempmail.lol');
                    const mail = new TempMail();
                    inbox = await mail.getInbox(address);
                } catch {
                    const res = await axios.get(`https://api.mail.gw/messages`, {
                        headers: { Authorization: `Bearer ${mailSessions.get(from + '_token') || ''}` },
                        timeout: 10000
                    }).catch(() => null);
                    inbox = res?.data?.['hydra:member'] || [];
                }
 
                if (!inbox?.length) {
                    return send(`ðŸ“­ *Inbox: ${address}*\n\nNo messages yet.\n\n_Emails may take a few minutes to arrive._`);
                }
 
                const items = inbox.slice(0, 10).map((m, i) =>
                    `*${i + 1}.* From: ${m.sender || m.from?.address || 'Unknown'}\n   Subject: ${m.subject || '(no subject)'}\n   Date: ${new Date(m.date || m.createdAt).toLocaleString()}`
                ).join('\n\n');
 
                return send(`ðŸ“¬ *Inbox: ${address}*\n\n${items}\n\n_Use \`.readmail ${address} <number>\` to read a message_`);
            } catch { return send(`âŒ Could not fetch inbox for ${address}.\n\n_Try again in a moment._`); }
        }
 
        if (cmd === 'readmail') {
            const parts = text.split(/\s+/);
            const address = parts[0];
            const index   = parseInt(parts[1]) - 1 || 0;
 
            if (!address || !address.includes('@')) {
                return send('âŒ *Usage:* `.readmail <email@domain> <message number>`\n\nExample: `.readmail test@mail.com 1`');
            }
 
            try {
                await sock.sendPresenceUpdate('composing', jid);
                let inbox = null;
 
                try {
                    const { TempMail } = require('tempmail.lol');
                    const mail = new TempMail();
                    inbox = await mail.getInbox(address);
                } catch {
                    inbox = [];
                }
 
                if (!inbox?.length) return send(`ðŸ“­ No messages in inbox: ${address}`);
                if (index >= inbox.length) return send(`âŒ Message ${index + 1} not found. Inbox has ${inbox.length} message(s).`);
 
                const m = inbox[index];
                const body = (m.body || m.html || m.text || m.intro || '(empty)')
                    .replace(/<[^>]+>/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .slice(0, 1000);
 
                return send(
                    `ðŸ“© *Message ${index + 1}*\n\n` +
                    `ðŸ“§ *From:* ${m.sender || m.from?.address || 'Unknown'}\n` +
                    `ðŸ“‹ *Subject:* ${m.subject || '(no subject)'}\n` +
                    `ðŸ“… *Date:* ${new Date(m.date || m.createdAt).toLocaleString()}\n\n` +
                    `ðŸ“ *Content:*\n${body}`
                );
            } catch { return send(`âŒ Could not read message.\n\n_Try \`.tempinbox ${address}\` first._`); }
        }
    }
};

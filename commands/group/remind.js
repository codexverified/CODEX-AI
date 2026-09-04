'use strict';
 
function parseDelay(str) {
    const match = str.match(/^(\d+)(s|m|h)$/i);
    if (!match) return null;
    const n  = parseInt(match[1], 10);
    const u  = match[2].toLowerCase();
    if (u === 's') return n * 1000;
    if (u === 'm') return n * 60 * 1000;
    if (u === 'h') return n * 3600 * 1000;
    return null;
}
 
module.exports = {
    commands:    ['remind', 'remindme', 'reminder'],
    category: 'group',
    description: 'Set a reminder â€” bot will ping you after the given time',
    usage:       '.remind 10m Buy groceries',
    permission:  'public',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { jid, sender, contextInfo } = ctx;
        const replyTo = ctx.isGroup ? jid : sender;
 
        if (!args.length) {
            return sock.sendMessage(replyTo, {
                text: 'â° *Reminder Usage:*\n`.remind <time> <message>`\n\n*Time formats:*\nâ€¢ `30s` â€” 30 seconds\nâ€¢ `10m` â€” 10 minutes\nâ€¢ `2h` â€” 2 hours\n\n*Example:*\n`.remind 30m Call Dad`',
                contextInfo
            }, { quoted: message });
        }
 
        const delay = parseDelay(args[0]);
        if (!delay) {
            return sock.sendMessage(replyTo, {
                text: `âŒ Invalid time format. Use \`30s\`, \`10m\`, or \`2h\`.`,
                contextInfo
            }, { quoted: message });
        }
 
        if (delay < 5000) {
            return sock.sendMessage(replyTo, { text: 'âŒ Minimum reminder time is 5 seconds.', contextInfo }, { quoted: message });
        }
        if (delay > 24 * 3600 * 1000) {
            return sock.sendMessage(replyTo, { text: 'âŒ Maximum reminder time is 24 hours.', contextInfo }, { quoted: message });
        }
 
        const reminderText = args.slice(1).join(' ').trim() || 'Your reminder!';
        const timeLabel    = args[0];
        const mention      = ctx.isGroup ? `@${sender.split('@')[0]} ` : '';
        const mentionArr   = ctx.isGroup ? [sender] : [];
 
        await sock.sendMessage(replyTo, {
            text: `âœ… Reminder set for *${timeLabel}*.\n\nðŸ“ "${reminderText}"`,
            contextInfo
        }, { quoted: message });
 
        setTimeout(async () => {
            try {
                await sock.sendMessage(replyTo, {
                    text: `â° *Reminder!*\n\n${mention}${reminderText}`,
                    mentions: mentionArr
                });
            } catch { /* chat may be gone */ }
        }, delay);
    }
};

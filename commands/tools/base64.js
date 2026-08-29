'use strict';

module.exports = {
    name: 'base64',
    alias: ['b64'],
    category: 'tools',
    desc: 'Encode or decode Base64 text',
    usage: 'base64 <encode|decode> <text>',
    execute: async (sock, m, args) => {
        const mode = String(args[0] || '').toLowerCase();
        if (!['encode', 'decode', 'enc', 'dec'].includes(mode) || args.length < 2) {
            return m.reply(`Usage: ${m.bot?.prefix || '!'}base64 encode Hello World\n${m.bot?.prefix || '!'}base64 decode SGVsbG8=`);
        }
        const input = args.slice(1).join(' ');
        try {
            const output = mode === 'encode' || mode === 'enc'
                ? Buffer.from(input, 'utf8').toString('base64')
                : Buffer.from(input, 'base64').toString('utf8');
            return m.reply(output);
        } catch {
            return m.reply('Invalid Base64 string.');
        }
    }
};

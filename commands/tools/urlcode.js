'use strict';

module.exports = {
    name: 'urlencode',
    aliases: ['encodeurl', 'urldecode', 'decodeurl'],
    category: 'tools',
    desc: 'Encode or decode URL text',
    execute: async (sock, m, args) => {
        const command = String(m.command || m.cmd || '').toLowerCase();
        const input = args.join(' ');
        if (!input) return m.reply('Usage: .urlencode <text> or .urldecode <encoded>');
        try { return m.reply(command.includes('decode') ? decodeURIComponent(input) : encodeURIComponent(input)); }
        catch { return m.reply('Invalid URL text.'); }
    }
};

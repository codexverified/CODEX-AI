'use strict';

module.exports = {
    name: 'json',
    aliases: ['jsonformat', 'prettyjson'],
    category: 'tools',
    desc: 'Format JSON data',
    execute: async (sock, m, args) => {
        const input = args.join(' ').trim();
        if (!input) return m.reply('Usage: .json {"key":"value"}');
        try { return m.reply('```\n' + JSON.stringify(JSON.parse(input), null, 2) + '\n```'); }
        catch { return m.reply('Invalid JSON.'); }
    }
};

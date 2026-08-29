const crypto = require('crypto');

module.exports = {
    name: 'password',
    aliases: ['passwd', 'genpass'],
    category: 'tools',
    description: 'Generate a secure random password',
    execute: async (sock, m, args) => {
        const length = Math.min(Math.max(Number.parseInt(args[0], 10) || 16, 6), 64);
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
        const bytes = crypto.randomBytes(length);
        const password = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
        return m.reply(`🔐 Password (${length} chars):\n${password}`);
    }
};

'use strict';
const crypto = require('crypto');
module.exports = {
  name: 'hash', alias: ['md5', 'sha1', 'sha256'], category: 'tools', desc: 'Generate hashes',
  execute: async (sock, m, args) => {
    const text = args.join(' '); if (!text) return m.reply('Usage: hash <text>');
    const command = String(m.command || 'hash').toLowerCase();
    const algorithms = ['md5','sha1','sha256'].includes(command) ? [command] : ['md5','sha1','sha256','sha512'];
    return m.reply(algorithms.map(a => `${a.toUpperCase()}: ${crypto.createHash(a).update(text).digest('hex')}`).join('\n'));
  }
};

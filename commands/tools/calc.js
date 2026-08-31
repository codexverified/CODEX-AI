'use strict';

module.exports = {
  name: 'calc', alias: ['calculate', 'math'], category: 'tools', desc: 'Evaluate a safe math expression',
  execute: async (sock, m, args) => {
    const input = args.join(' ');
    if (!input) return m.reply('Usage: calc <expression>');
    if (!/^[0-9+\-*/().%\s]+$/.test(input)) return m.reply('Only numbers and basic operators are allowed.');
    try { const result = Function(`"use strict"; return (${input})`)(); if (!Number.isFinite(result)) throw new Error(); return m.reply(String(result)); }
    catch { return m.reply('Invalid expression.'); }
  }
};

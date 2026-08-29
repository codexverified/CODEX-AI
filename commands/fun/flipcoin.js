'use strict';

module.exports = {
  name: 'flip', alias: ['coin', 'dice', 'roll'], category: 'fun', desc: 'Flip a coin or roll dice',
  execute: async (sock, m, args) => {
    const command = String(m.command || 'flip').toLowerCase();
    if (command === 'flip' || command === 'coin') return m.reply(Math.random() < 0.5 ? 'HEADS' : 'TAILS');
    const match = String(args[0] || '1d6').match(/^(\d+)?d(\d+)$/i);
    const count = Math.min(Math.max(Number(match?.[1] || 1), 1), 20);
    const sides = Math.min(Math.max(Number(match?.[2] || args[0] || 6), 2), 100);
    const rolls = Array.from({length: count}, () => Math.floor(Math.random() * sides) + 1);
    return m.reply(`Rolls (${count}d${sides}): ${rolls.join(', ')}${count > 1 ? `\nTotal: ${rolls.reduce((a,b) => a+b, 0)}` : ''}`);
  }
};

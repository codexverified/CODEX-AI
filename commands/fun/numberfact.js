module.exports = {
    name: 'numberfact',
    aliases: ['numfact', 'number'],
    category: 'fun',
    description: 'Get an interesting fact about a number',
    execute: async (sock, m, args) => {
        const n = Number.parseInt(args[0], 10);
        if (!Number.isFinite(n)) return m.reply('Usage: .numberfact <number>');
        const facts = [
            `${n} is ${n % 2 ? 'odd' : 'even'}.`,
            Number.isInteger(Math.sqrt(n)) && n > 0 ? `${n} is a perfect square.` : null,
            `The digit sum of ${n} is ${String(Math.abs(n)).split('').reduce((sum, d) => sum + Number(d), 0)}.`
        ].filter(Boolean);
        return m.reply(`🔢 Number fact for ${n}:\n${facts.join('\n')}`);
    }
};

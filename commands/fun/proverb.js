module.exports = {
    name: 'proverb',
    aliases: ['saying', 'wisdom', 'adage'],
    category: 'fun',
    description: 'Get a random proverb',
    execute: async (sock, m) => {
        const sayings = [
            'A stitch in time saves nine.',
            'Actions speak louder than words.',
            'Better late than never.',
            'Knowledge is power.',
            'Practice makes perfect.',
            'Fortune favors the bold.',
            'Where there is a will, there is a way.'
        ];
        return m.reply(`📖 ${sayings[Math.floor(Math.random() * sayings.length)]}`);
    }
};

module.exports = {
    name: 'location',
    aliases: ['loc'],
    category: 'tools',
    reactions: { start: '📍' },
    description: 'Send a location pin from latitude and longitude.',
    usage: '.location 6.5244,3.3792',

    async execute(bot, m, args) {
        const [latRaw, lonRaw] = args.join(' ').split(',').map(p => p?.trim());
        const latitude = Number(latRaw);
        const longitude = Number(lonRaw);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return await m.reply(`Usage: *${bot.prefix}location 6.5244,3.3792*`);
        }

        await bot.sendMessage(m.chat, {
            location: { degreesLatitude: latitude, degreesLongitude: longitude }
        });
    },
};

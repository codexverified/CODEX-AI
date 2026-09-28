module.exports = {
    name: 'ephemeral',
    aliases: ['disappearing', 'toggleephemeral', 'settimer'],
    category: 'group',
    reactions: { start: '⏳' },
    description: 'Set the disappearing-messages timer for this group — e.g. .ephemeral 24hr, 7d, 90d, off.',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const input = (args || []).join('').toLowerCase().trim();

        const usage =
            `Usage: ${prefix}ephemeral <time>\n\n` +
            `• ${prefix}ephemeral 24hr\n` +
            `• ${prefix}ephemeral 7d\n` +
            `• ${prefix}ephemeral 90d\n` +
            `• ${prefix}ephemeral off`;

        if (!input) return m.reply(usage);

        // off / 0 → turn disappearing messages off
        let seconds;
        if (input === 'off' || input === '0') {
            seconds = 0;
        } else {
            // <number><unit>: 24hr, 24h, 7d, 7days, 1w, 1week ...
            const match = input.match(/^(\d+)(h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks)$/);
            if (!match) return m.reply(usage);
            const n = parseInt(match[1], 10);
            const unit = match[2][0]; // h / d / w
            const perUnit = unit === 'h' ? 3600 : unit === 'd' ? 86400 : 604800;
            seconds = n * perUnit;
            if (seconds <= 0) return m.reply(usage);
        }

        const label = seconds === 0 ? 'OFF'
            : seconds % 604800 === 0 ? `${seconds / 604800} week${seconds / 604800 === 1 ? '' : 's'}`
            : seconds % 86400 === 0 ? `${seconds / 86400} day${seconds / 86400 === 1 ? '' : 's'}`
            : `${seconds / 3600} hours`;

        try {
            await bot.sock.groupToggleEphemeral(m.chat, seconds);
            return m.reply(`⏳ *Disappearing messages:* ${label}`);
        } catch (err) {
            const msg = err.message?.includes('not-authorized')
                ? "I need to be an admin first."
                : err.message;
            return m.reply(`Failed: ${msg}`);
        }
    },
};

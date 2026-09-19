const os = require('os');

module.exports = {
    name: 'stats',
    aliases: ['check'],
    category: 'owner',
    description: 'Display bot statistics as a poll result. Owner only.',
    reactions: { start: '📊' },
    ownerOnly: true,

    async execute(bot, m, args) {
        try {
            const sock = bot.sock;
            const config = bot.config;

            const botName = config?.settings?.botName || config?.botName || 'CODEX-AI V3.0';

            const up = process.uptime();
            const days = Math.floor(up / 86400);
            const hours = Math.floor((up % 86400) / 3600);
            const minutes = Math.floor((up % 3600) / 60);
            const seconds = Math.floor(up % 60);
            const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
            const memoryTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
            const cpuUsage = (os.loadavg()[0] * 10).toFixed(1);
            const msgCount = global.codexStats?.messages || 0;
            const cmdCount = global.codexStats?.commands || 0;

            // The bar length in a WhatsApp poll result is driven by
            // voteCount. Scaling it 1:1 with the real count made the bar
            // fill up fast in any active chat. This keeps the real number
            // in the label, but grows the BAR on a heavily compressed
            // log scale instead — so it visually creeps up extremely
            // slowly no matter how high the real count gets.
            const slowBar = (n) => Math.min(Math.floor(Math.log2((n || 0) + 1) * 3), 999);

            const platform = os.platform();
            const nodeVersion = process.version;

            await sock.sendMessage(m.chat, {
                pollResult: {
                    name: `𝌆  ${botName.toUpperCase()} STATs 彡`,
                    votes: [
                        { name: `𝍖 Messages: ${msgCount.toLocaleString()}`, voteCount: slowBar(msgCount) },
                        { name: `♧ Commands: ${cmdCount.toLocaleString()}`, voteCount: slowBar(cmdCount) },
                        { name: `⎙ Memory: ${memoryUsed}MB / ${memoryTotal}GB`, voteCount: Math.floor(memoryUsed) },
                        { name: `☁︎  CPU: ${cpuUsage}%`, voteCount: Math.floor(cpuUsage) },
                        { name: `ⓘ Uptime: ${uptimeStr}`, voteCount: Math.floor(up / 3600) },
                        { name: `☢︎ Node: ${nodeVersion} | ${platform}`, voteCount: 1 }
                    ],
                    pollType: 0
                }
            }, { quoted: m });

        } catch (e) {
            console.error('[STATS]', e.message);
            await m.reply(`\`×͜× Stats failed: ${e.message} ×͜×\``);
        }
    }
};

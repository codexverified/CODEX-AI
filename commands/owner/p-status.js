const os = require('os');
const path = require('path');

module.exports = {
    name: 'p-status',
    aliases: ['pstatus'],
    category: 'owner',
    description: 'Show a PM2-style process status card for the bot. Owner only.',
    reactions: { start: '✳️' },
    ownerOnly: true,

    async execute(bot, m, args) {
        try {
            const config = bot.config || {};
            const botName = config.settings?.botName || config.botName || 'CODEX-AI';

            let version = '3.0.0';
            try {
                version = require(path.join(process.cwd(), 'package.json')).version || version;
            } catch {}

            const cpuPct = (os.loadavg()[0] * 10).toFixed(0);
            const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

            // Compact single-unit uptime (e.g. "16h", "2d") — same shape as
            // the reference screenshot, not a full "Xd Xh Xm" breakdown.
            const upSec = process.uptime();
            let uptimeStr;
            if (upSec < 3600) uptimeStr = `${Math.floor(upSec / 60)}m`;
            else if (upSec < 86400) uptimeStr = `${Math.floor(upSec / 3600)}h`;
            else uptimeStr = `${Math.floor(upSec / 86400)}d`;

            // "Restarts" — there's no PM2 wrapper here, so the closest real,
            // already-tracked equivalent is how many times the WhatsApp
            // connection itself has been (re)established this process
            // lifetime (see bot._connGeneration in lib/connection.js).
            // Generation 1 = the first, normal connect — not a restart.
            const restarts = Math.max((bot._connGeneration || 1) - 1, 0);

            const text =
                `*✳️ Bot Status*\n\n` +
                `*Process #0*: ${botName}\n` +
                `✓ *Status*: online\n` +
                `≡ *Mode*: fork\n` +
                `≡ *CPU*: ${cpuPct}%\n` +
                `≡ *Memory*: ${memMb}mb\n` +
                `≡ *Uptime*: ${uptimeStr}\n` +
                `≡ *Version*: ${version}\n` +
                `≡ *Restarts*: ${restarts}`;

            await m.reply(text);
        } catch (e) {
            console.error('[P-STATUS]', e.message);
            await m.reply(`Failed: ${e.message}`);
        }
    }
};

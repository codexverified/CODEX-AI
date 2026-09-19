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

            // BUG (was): used bot._connGeneration — in-memory only, always
            // resets to 0 on every real process restart, so it could never
            // actually show how many times the bot has been restarted; it
            // only ever showed WhatsApp reconnects within the CURRENT run.
            // Now reads the real, disk-persisted count — see
            // lib/restartCounter.js and where it's set once in app.js's
            // start(). Falls back to 0 if app.js hasn't set it yet for any
            // reason, rather than silently showing the wrong number again.
            const restarts = typeof bot.restartCount === 'number' ? bot.restartCount : 0;

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

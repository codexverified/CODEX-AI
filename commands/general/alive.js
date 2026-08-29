const os = require('os');
const { performance } = require('perf_hooks');

module.exports = {
  name: 'alive',
  aliases: ['botinfo'],
  description: 'Show bot status and uptime',
  category: 'General',
  usage: 'alive',
  reactions: { start: '⚡', success: '✨', error: '❔' },

  async execute(sock, m, { reply }) {
    const started = performance.now();
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const min = Math.floor((uptime % 3600) / 60);
    const sec = uptime % 60;
    const ram = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);
    const total = (os.totalmem() / 1073741824).toFixed(2);

    await reply(
      `*CODEX AI IS ALIVE*\n\n` +
      `Uptime: ${h}h ${min}m ${sec}s\n` +
      `Speed: ${(performance.now() - started).toFixed(1)} ms\n` +
      `Memory: ${ram}/${total} GB`,
    );
  },
};

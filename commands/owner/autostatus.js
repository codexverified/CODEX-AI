const fs = require('fs-extra');

module.exports = {
  name: 'autostatus',
  aliases: ['autostatusview', 'statusview'],
  category: 'owner',
  ownerOnly: true,
  reactions: { start: '👁️' },
  description: 'Automatically view WhatsApp statuses',
  async execute(bot, m, args) {
    const action = String(args[0] || '').toLowerCase();
    const customEmoji = String(args.slice(1).join(' ') || '').trim();

    bot.config.statusView = bot.config.statusView || { enabled: false, emoji: '👁️' };

    if (action === 'status') {
      return m.reply(`Auto status view: ${bot.config.statusView.enabled ? 'ON' : 'OFF'}\nEmoji: ${bot.config.statusView.emoji || '👁️'}`);
    }

    if (action === 'set' || action === 'emoji') {
      if (!customEmoji) {
        return m.reply(`Usage: ${bot.prefix}autostatus set <emoji>`);
      }
      bot.config.statusView.emoji = customEmoji;
      fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));
      return m.reply(`Status view emoji updated to ${customEmoji}`);
    }

    if (['on', 'off'].includes(action)) {
      if (customEmoji) bot.config.statusView.emoji = customEmoji;
      bot.config.statusView.enabled = action === 'on';
      fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));
      return m.reply(`Auto status view: ${bot.config.statusView.enabled ? 'ON' : 'OFF'}\nEmoji: ${bot.config.statusView.emoji || '👁️'}`);
    }

    return m.reply(`Usage: ${bot.prefix}autostatus on|off|status|set <emoji>`);
  },
};

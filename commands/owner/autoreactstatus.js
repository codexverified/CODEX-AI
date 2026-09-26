const fs = require('fs-extra');

module.exports = {
  name: 'autoreactstatus',
  aliases: ['statusreact', 'autoreactonstatus'],
  category: 'owner',
  ownerOnly: true,
  reactions: { start: '💚' },
  description: 'Automatically react to WhatsApp statuses',
  async execute(bot, m, args) {
    const action = String(args[0] || '').toLowerCase();
    const customEmoji = String(args.slice(1).join(' ') || '').trim();

    bot.config.statusReact = bot.config.statusReact || { enabled: false, emoji: '💚' };

    if (action === 'status') {
      return m.reply(`Auto status reaction: ${bot.config.statusReact.enabled ? 'ON' : 'OFF'}\nEmoji: ${bot.config.statusReact.emoji || '💚'}`);
    }

    if (action === 'set' || action === 'emoji') {
      if (!customEmoji) {
        return m.reply(`Usage: ${bot.prefix}autoreactstatus set <emoji>`);
      }
      bot.config.statusReact.emoji = customEmoji;
      fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));
      return m.reply(`Status reaction emoji updated to ${customEmoji}`);
    }

    if (['on', 'off'].includes(action)) {
      if (customEmoji) bot.config.statusReact.emoji = customEmoji;
      bot.config.statusReact.enabled = action === 'on';
      fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));
      return m.reply(`Auto status reaction: ${bot.config.statusReact.enabled ? 'ON' : 'OFF'}\nEmoji: ${bot.config.statusReact.emoji || '💚'}`);
    }

    return m.reply(`Usage: ${bot.prefix}autoreactstatus on|off|status|set <emoji>`);
  },
};

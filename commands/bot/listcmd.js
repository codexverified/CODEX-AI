const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const DB_PATH = path.join(PROJECT_ROOT, 'database', 'sticker_cmds.json');

module.exports = {
    name: 'listcmd',
    aliases: ['stickerlist'],
    category: 'bot',
    reactions: { start: '📝' },
    description: 'List all sticker-linked commands',

    async execute(bot, m, args) {
        let db = {};
        try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch {}
        const entries = Object.entries(db);
        if (entries.length === 0) return await m.reply(`No sticker commands set yet.\nAdd one: reply a sticker then type ${bot.prefix}setcmd <command>`);
        let text = 'Sticker commands:\n';
        entries.forEach(([id, data], i) => { text += `${i+1}. ${bot.prefix}${data.command}\n`; });
        text += `\nTotal: ${entries.length}\nRemove: reply sticker then type ${bot.prefix}delcmd`;
        await m.reply(text);
    }
};

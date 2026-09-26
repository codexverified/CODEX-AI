const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const DB_PATH = path.join(PROJECT_ROOT, 'database', 'sticker_cmds.json');

module.exports = {
    name: 'delcmd',
    aliases: [],
    category: 'bot',
    reactions: { start: '📝' },
    description: 'Reply a sticker with .delcmd to remove its linked command',

    async execute(bot, m, args) {
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage || m.msg?.contextInfo?.quotedMessage;
        if (!quoted?.stickerMessage) return await m.reply(`Reply to a sticker to unlink it.\nUsage: reply a sticker then type ${bot.prefix}delcmd`);

        const sha256 = quoted.stickerMessage.fileSha256;
        if (!sha256) return await m.reply('Could not read sticker ID.');
        const stickerId = (Buffer.isBuffer(sha256) || sha256 instanceof Uint8Array
            ? Buffer.from(sha256)
            : Buffer.from(sha256, 'base64')).toString('base64');

        let db = {};
        try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch {}
        if (!db[stickerId]) return await m.reply('This sticker has no command linked to it.');

        const removed = db[stickerId].command;
        delete db[stickerId];
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        await m.reply(`Sticker unlinked from ${bot.prefix}${removed}.`);
    }
};

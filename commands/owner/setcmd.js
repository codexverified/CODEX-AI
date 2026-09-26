const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const DB_PATH = path.join(PROJECT_ROOT, 'database', 'sticker_cmds.json');

function getStickerId(sha256) {
    if (Buffer.isBuffer(sha256) || sha256 instanceof Uint8Array) {
        return Buffer.from(sha256).toString('base64');
    }
    if (typeof sha256 === 'string' && sha256.trim()) {
        return Buffer.from(sha256, 'base64').toString('base64');
    }
    return null;
}

module.exports = {
    name: 'setcmd',
    aliases: [],
    category: 'owner',
    ownerOnly: true,
    reactions: { start: '📝' },
    description: 'Reply to a sticker to link it to a command',

    async execute(bot, m, args) {
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
            || m.msg?.contextInfo?.quotedMessage;
        if (!quoted?.stickerMessage) {
            return await m.reply(`Reply to a sticker with ${bot.prefix}setcmd <command>.`);
        }

        const stickerId = getStickerId(quoted.stickerMessage.fileSha256);
        if (!stickerId) return await m.reply('Could not read the sticker ID.');

        let commandName = String(args.join(' ')).trim();
        if (bot.prefix && commandName.startsWith(bot.prefix)) {
            commandName = commandName.slice(bot.prefix.length).trim();
        }
        commandName = commandName.split(/\s+/)[0]?.toLowerCase();
        if (!commandName) {
            return await m.reply(`Usage: reply to a sticker with ${bot.prefix}setcmd <command>`);
        }
        if (!bot.commandHandler?.getCommand(commandName)) {
            return await m.reply(`Unknown command: ${commandName}`);
        }

        let db = {};
        try {
            db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch {}
        db[stickerId] = { command: commandName };

        fs.ensureDirSync(path.dirname(DB_PATH));
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        return await m.reply(`Sticker linked to ${bot.prefix}${commandName}.`);
    }
};
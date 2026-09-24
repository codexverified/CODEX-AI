const fs = require('fs-extra');

const DB_PATH = './database/autoreply.json';

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return { enabled: false, trigger: '', triggers: [], message: '', type: 'text', stickerData: '' };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseTriggers(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeText(item))
            .filter(Boolean)
            .flatMap((item) => item.split(/[|,\n]+/).map((part) => normalizeText(part)))
            .filter(Boolean);
    }
    return String(value)
        .split(/[|,\n]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
}

function getQuotedTextValue(quoted) {
    if (!quoted) return '';
    const direct = [
        quoted.text,
        quoted.caption,
        quoted.body,
        quoted.message?.conversation,
        quoted.message?.extendedTextMessage?.text,
        quoted.message?.imageMessage?.caption,
        quoted.message?.videoMessage?.caption,
    ].find((v) => typeof v === 'string' && v.trim());
    if (direct) return normalizeText(direct);
    return '';
}

async function resolveQuotedReplyPayload(m) {
    const quoted = m?.quoted;
    if (!quoted) return null;

    if (quoted.mtype === 'stickerMessage' || quoted.message?.stickerMessage) {
        try {
            const buffer = await quoted.download();
            if (buffer && buffer.length) {
                return {
                    type: 'sticker',
                    stickerData: buffer.toString('base64'),
                };
            }
        } catch {}
    }

    const text = getQuotedTextValue(quoted);
    if (text) {
        return { type: 'text', message: text };
    }

    return null;
}

function getAutoReplyConfig(bot, db) {
    const triggerList = [
        ...parseTriggers(bot.config?.AUTOREPLY),
        ...parseTriggers(db.triggers),
        ...parseTriggers(db.trigger),
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    const trigger = triggerList[0] || '';
    const triggers = triggerList;
    const message = String(bot.config?.AUTOREPLY_MSG ?? db.message ?? '').trim();
    const type = String(bot.config?.AUTOREPLY_TYPE ?? db.type ?? 'text').toLowerCase();
    const stickerData = String(bot.config?.AUTOREPLY_STICKER ?? db.stickerData ?? '').trim();
    return { trigger, triggers, message, type, stickerData };
}

module.exports = {
    name: 'autoreply',
    aliases: ['ar', 'autoresponse'],
    category: 'bot',
    reactions: { start: '💬' },
    description: 'Simple auto-reply trigger based on a configured word or name.',

    async execute(bot, m, args) {
        const db = readDB();
        const sub = String(args[0] || '').toLowerCase();
        const { trigger, triggers, message } = getAutoReplyConfig(bot, db);

        if (!sub || sub === 'status') {
            return await m.reply(
`AUTO-REPLY SETTINGS

Status: ${db.enabled ? 'ON' : 'OFF'}
Triggers: ${triggers.length ? triggers.join(', ') : 'not set'}
Reply: ${message || 'not set'}

Usage:
${bot.prefix}setvar AUTOREPLY=word1,word2
${bot.prefix}autoreply trigger word1 word2
${bot.prefix}autoreply on
${bot.prefix}autoreply setmsg=your default reply
${bot.prefix}autoreply off
${bot.prefix}autoreply clear`
            );
        }

        if (sub === 'on') {
            const activeTriggers = [...new Set([
                ...triggers,
                ...parseTriggers(bot.config?.AUTOREPLY),
                ...parseTriggers(db.trigger),
                ...parseTriggers(db.triggers),
            ])];
            if (!activeTriggers.length) {
                return await m.reply('No trigger set yet. Use `.setvar AUTOREPLY=word1,word2` or `.autoreply trigger word1 word2` first.');
            }
            db.enabled = true;
            db.trigger = activeTriggers[0];
            db.triggers = activeTriggers;
            bot.config.AUTOREPLY = activeTriggers.join(',');
            saveDB(db);
            return await m.reply(`Auto-reply enabled for trigger(s): "${activeTriggers.join(', ')}"`);
        }

        if (sub === 'off') {
            db.enabled = false;
            saveDB(db);
            return await m.reply('Auto-reply disabled.');
        }

        if (sub === 'setmsg' || sub.startsWith('setmsg=')) {
            let msgText = sub.startsWith('setmsg=')
                ? sub.slice('setmsg='.length) + (args.length > 1 ? ' ' + args.slice(1).join(' ') : '')
                : args.slice(1).join(' ');

            if (!msgText.trim() && m.quoted) {
                const payload = await resolveQuotedReplyPayload(m);
                if (!payload) return await m.reply('Reply to a text message or sticker, or use `.autoreply setmsg=your reply`');

                db.type = payload.type;
                if (payload.type === 'sticker') {
                    db.message = '';
                    db.stickerData = payload.stickerData;
                    bot.config.AUTOREPLY_TYPE = 'sticker';
                    bot.config.AUTOREPLY_STICKER = payload.stickerData;
                } else {
                    db.message = payload.message;
                    db.stickerData = '';
                    bot.config.AUTOREPLY_TYPE = 'text';
                    bot.config.AUTOREPLY_MSG = payload.message;
                }
                saveDB(db);
                return await m.reply(`Auto-reply content saved from your reply.\nType: ${payload.type}`);
            }

            msgText = normalizeText(msgText);
            if (!msgText) {
                return await m.reply('Usage: `.autoreply setmsg=Your default reply`');
            }

            db.type = 'text';
            db.message = msgText;
            db.stickerData = '';
            bot.config.AUTOREPLY_TYPE = 'text';
            bot.config.AUTOREPLY_MSG = db.message;
            saveDB(db);
            return await m.reply(`Auto-reply message saved:\n${db.message}`);
        }

        if (sub === 'settrigger' || sub === 'trigger') {
            const newTrigger = args.slice(1).join(' ').trim();
            const parsed = parseTriggers(newTrigger);
            if (!parsed.length) {
                return await m.reply('Usage: `.autoreply trigger your word` or `.autoreply trigger hello,hi`');
            }

            db.trigger = parsed[0];
            db.triggers = parsed;
            bot.config.AUTOREPLY = parsed.join(',');
            saveDB(db);
            return await m.reply(`Auto-reply trigger(s) set to: "${parsed.join(', ')}"`);
        }

        if (sub === 'clear' || sub === 'reset') {
            delete db.trigger;
            delete db.triggers;
            delete db.message;
            delete db.type;
            delete db.stickerData;
            db.enabled = false;
            delete bot.config.AUTOREPLY;
            delete bot.config.AUTOREPLY_MSG;
            delete bot.config.AUTOREPLY_TYPE;
            delete bot.config.AUTOREPLY_STICKER;
            saveDB(db);
            return await m.reply('Auto-reply cleared and disabled.');
        }

        await m.reply('Unknown option. Use ' + bot.prefix + 'autoreply');
    }
};

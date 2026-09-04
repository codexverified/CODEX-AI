const axios = require('axios');
const fs = require('fs');
const path = require('path');
 
// Ã¢â€â‚¬Ã¢â€â‚¬ Persistent storage helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
 
function readJson(file, def = {}) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return def; }
}
function writeJson(file, data) {
    try { fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2)); } catch {}
}
 
// Ã¢â€â‚¬Ã¢â€â‚¬ In-memory reminder store (survives within session) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const reminders = new Map(); // key Ã¢â€ â€™ { jid, from, text, fireAt, timerId }
 
// Ã¢â€â‚¬Ã¢â€â‚¬ Word filter storage Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
let wordFilters = readJson('word-filters.json', {});
// { "groupJid": ["word1", "word2", ...] }
 
// Ã¢â€â‚¬Ã¢â€â‚¬ Slowmode storage Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
let slowmodeSettings = readJson('slowmode.json', {});
// { "groupJid": { enabled: true, seconds: 10 } }
const slowmodeTrack = new Map(); // "groupJid:senderJid" Ã¢â€ â€™ lastMsgTimestamp
 
// Ã¢â€â‚¬Ã¢â€â‚¬ onMessage hook: word filter + slowmode enforcement Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const onMessagePlugin = {
    commands: ['__advanced_onmessage__'],
    category: 'admin',
    description: 'Internal onMessage hook for word filter and slowmode',
    permission: 'public',
    run: async () => {},
    onMessage: async (sock, message, text, { jid, from, isGroup }) => {
        if (!isGroup || !text) return;
 
        // Word filter
        const filters = wordFilters[jid];
        if (filters?.length) {
            const lower = text.toLowerCase();
            const hit = filters.find(w => lower.includes(w.toLowerCase()));
            if (hit) {
                try {
                    await sock.sendMessage(jid, { delete: message.key });
                    await sock.sendMessage(jid, {
                        text: `Ã¢Å¡Â Ã¯Â¸Â @${(message.key.participant || from).split('@')[0]} that word is not allowed here.`,
                        mentions: [message.key.participant || from]
                    });
                } catch {}
                return;
            }
        }
 
        // Slowmode
        const sm = slowmodeSettings[jid];
        if (sm?.enabled && sm.seconds > 0) {
            const sender = message.key.participant || from;
            const trackKey = `${jid}:${sender}`;
            const last = slowmodeTrack.get(trackKey) || 0;
            const now = Date.now();
            if (now - last < sm.seconds * 1000) {
                try { await sock.sendMessage(jid, { delete: message.key }); } catch {}
                return;
            }
            slowmodeTrack.set(trackKey, now);
        }
    }
};
 
module.exports = [
 
    onMessagePlugin,
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Native WhatsApp Poll Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['poll', 'createpoll', 'vote'],
    category: 'group',
        description: 'Create a native WhatsApp poll. Usage: .poll Question | Option1 | Option2 | ...',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const text = args.join(' ').trim();
            if (!text.includes('|')) return reply(
                'Ã°Å¸â€œÅ  *Create a Poll*\n\nUsage:\n`.poll Question | Option1 | Option2 | Option3`\n\nExample:\n`.poll Favorite fruit? | Apple | Banana | Mango | Orange`\n\nMax 12 options.'
            );
            const parts = text.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length < 3) return reply('Ã¢ÂÅ’ Need at least 1 question + 2 options.\n\nExample: `.poll Best OS? | Android | iOS | Windows`');
            const [question, ...options] = parts;
            if (options.length > 12) return reply('Ã¢ÂÅ’ Maximum 12 options allowed.');
            try {
                await sock.sendMessage(jid, {
                    poll: {
                        name: question,
                        values: options,
                        selectableCount: 1
                    }
                }, { quoted: message });
            } catch (e) {
                reply(`Ã¢ÂÅ’ Poll failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Multi-select Poll Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['multipoll', 'multivote'],
    category: 'group',
        description: 'Poll where users can pick multiple options. Usage: .multipoll Question | Opt1 | Opt2 ...',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const text = args.join(' ').trim();
            const parts = text.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length < 3) return reply('Ã¢ÂÅ’ Need question + at least 2 options.\nExample: `.multipoll Pick all fruits you like | Apple | Mango | Orange`');
            const [question, ...options] = parts;
            try {
                await sock.sendMessage(jid, {
                    poll: {
                        name: question,
                        values: options.slice(0, 12),
                        selectableCount: options.length > 12 ? 12 : options.length
                    }
                }, { quoted: message });
            } catch (e) {
                reply(`Ã¢ÂÅ’ Poll failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Reminder Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['remind', 'reminder', 'remindme'],
    category: 'general',
        description: 'Set a timed reminder. Usage: .remind 10m Buy groceries',
        permission: 'public',
        run: async (sock, message, args, ctx) => {
            const { jid, from, reply } = ctx;
            if (!args.length) return reply(
                'Ã¢ÂÂ° *Reminder*\n\nUsage: `.remind <time> <message>`\n\nTime formats:\nÃ¢â‚¬Â¢ `30s` Ã¢â‚¬â€ 30 seconds\nÃ¢â‚¬Â¢ `5m` Ã¢â‚¬â€ 5 minutes\nÃ¢â‚¬Â¢ `2h` Ã¢â‚¬â€ 2 hours\nÃ¢â‚¬Â¢ `1d` Ã¢â‚¬â€ 1 day\n\nExamples:\n`.remind 10m Take medicine`\n`.remind 2h Call mom`\n`.remind 1d Pay rent`'
            );
            const timeStr = args[0].toLowerCase();
            const text = args.slice(1).join(' ').trim() || 'Reminder!';
            let ms = 0;
            if (/^\d+s$/.test(timeStr)) ms = parseInt(timeStr) * 1000;
            else if (/^\d+m$/.test(timeStr)) ms = parseInt(timeStr) * 60000;
            else if (/^\d+h$/.test(timeStr)) ms = parseInt(timeStr) * 3600000;
            else if (/^\d+d$/.test(timeStr)) ms = parseInt(timeStr) * 86400000;
            else return reply('Ã¢ÂÅ’ Invalid time. Use: 30s, 5m, 2h, 1d');
            if (ms < 5000) return reply('Ã¢ÂÅ’ Minimum reminder time is 5 seconds.');
            if (ms > 7 * 24 * 3600000) return reply('Ã¢ÂÅ’ Maximum reminder time is 7 days.');
 
            const fireAt = Date.now() + ms;
            const id = `${jid}-${Date.now()}`;
            const mins = Math.round(ms / 60000);
            const displayTime = ms < 60000 ? `${ms / 1000}s` : ms < 3600000 ? `${Math.round(ms/60000)}m` : ms < 86400000 ? `${Math.round(ms/3600000)}h` : `${Math.round(ms/86400000)}d`;
 
            const timerId = setTimeout(async () => {
                reminders.delete(id);
                try {
                    await sock.sendMessage(jid, {
                        text: `Ã¢ÂÂ° *Reminder!*\n\n${text}\n\n_Set ${displayTime} ago_`,
                        mentions: [from]
                    });
                } catch {}
            }, ms);
 
            reminders.set(id, { jid, from, text, fireAt, timerId });
            reply(`Ã¢ÂÂ° *Reminder Set!*\n\nÃ°Å¸â€œÂ *Note:* ${text}\nÃ¢ÂÂ± *Fires in:* ${displayTime}\nÃ°Å¸â€¢Â *At:* ${new Date(fireAt).toLocaleTimeString()}\n\nI'll ping you here when the time comes!`);
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ List reminders Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['reminders', 'myreminders', 'listreminders'],
    category: 'general',
        description: 'List your active reminders',
        permission: 'public',
        run: async (sock, message, args, ctx) => {
            const { jid, from, reply } = ctx;
            const mine = [...reminders.values()].filter(r => r.jid === jid && r.from === from);
            if (!mine.length) return reply('Ã°Å¸â€œÂ­ You have no active reminders in this chat.');
            const lines = mine.map((r, i) => {
                const left = Math.max(0, r.fireAt - Date.now());
                const mins = Math.round(left / 60000);
                return `${i + 1}. Ã¢ÂÂ° *${r.text}* Ã¢â‚¬â€ in ${mins < 1 ? '<1' : mins}m`;
            });
            reply(`Ã¢ÂÂ° *Your Reminders (${mine.length})*\n\n${lines.join('\n')}`);
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Word Filter Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['addfilter', 'filterword', 'blockword'],
    category: 'admin',
        description: 'Auto-delete messages containing a word. Usage: .addfilter <word>',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const word = args.join(' ').trim().toLowerCase();
            if (!word) return reply('Usage: `.addfilter <word>`\nExample: `.addfilter spam`');
            if (!wordFilters[jid]) wordFilters[jid] = [];
            if (wordFilters[jid].includes(word)) return reply(`Ã¢Å¡Â Ã¯Â¸Â *"${word}"* is already filtered.`);
            wordFilters[jid].push(word);
            writeJson('word-filters.json', wordFilters);
            reply(`Ã¢Å“â€¦ Word filter added: *"${word}"*\n\nMessages containing this word will be auto-deleted.`);
        }
    },
 
    {
        commands: ['removefilter', 'unfilter', 'unblockword'],
    category: 'admin',
        description: 'Remove a word filter',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const word = args.join(' ').trim().toLowerCase();
            if (!wordFilters[jid]?.length) return reply('Ã°Å¸â€œÂ­ No word filters active in this group.');
            const idx = wordFilters[jid].indexOf(word);
            if (idx === -1) return reply(`Ã¢ÂÅ’ *"${word}"* is not in the filter list.`);
            wordFilters[jid].splice(idx, 1);
            writeJson('word-filters.json', wordFilters);
            reply(`Ã¢Å“â€¦ Removed filter: *"${word}"*`);
        }
    },
 
    {
        commands: ['listfilters', 'filterlist', 'wordfilters'],
    category: 'group',
        description: 'List active word filters in this group',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const list = wordFilters[jid];
            if (!list?.length) return reply('Ã°Å¸â€œÂ­ No word filters active in this group.\n\nAdmins can add them with `.addfilter <word>`');
            reply(`Ã°Å¸Å¡Â« *Word Filters (${list.length})*\n\n${list.map((w, i) => `${i + 1}. \`${w}\``).join('\n')}\n\nMessages containing these words are auto-deleted.`);
        }
    },
 
    {
        commands: ['clearfilters', 'resetfilters'],
    category: 'group',
        description: 'Remove all word filters from this group',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            if (!wordFilters[jid]?.length) return reply('Ã°Å¸â€œÂ­ No filters to clear.');
            delete wordFilters[jid];
            writeJson('word-filters.json', wordFilters);
            reply('Ã¢Å“â€¦ All word filters cleared for this group.');
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Slowmode Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['slowmode', 'slow'],
    category: 'admin',
        description: 'Set a cooldown between messages per user. Usage: .slowmode 30 (seconds) or .slowmode off',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const arg = (args[0] || '').toLowerCase();
            if (arg === 'off' || arg === 'disable' || arg === '0') {
                delete slowmodeSettings[jid];
                writeJson('slowmode.json', slowmodeSettings);
                return reply('Ã¢Å“â€¦ Slowmode *disabled* for this group.');
            }
            const secs = parseInt(arg);
            if (isNaN(secs) || secs < 1) return reply('Usage:\n`.slowmode 30` Ã¢â‚¬â€ 30 second cooldown\n`.slowmode off` Ã¢â‚¬â€ disable');
            if (secs > 3600) return reply('Ã¢ÂÅ’ Maximum slowmode is 3600 seconds (1 hour).');
            slowmodeSettings[jid] = { enabled: true, seconds: secs };
            writeJson('slowmode.json', slowmodeSettings);
            reply(`Ã°Å¸ÂÂ¢ *Slowmode ON*\n\nUsers must wait *${secs} seconds* between messages.\n\nType \`.slowmode off\` to disable.`);
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Disappearing Messages Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['disappear', 'disappearing', 'ephemeral'],
    category: 'group',
        description: 'Toggle disappearing messages in a chat',
        permission: 'admin',
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const arg = (args[0] || '').toLowerCase();
            let duration = 604800; // 7 days default
            if (arg === 'off' || arg === '0') duration = 0;
            else if (arg === '24h' || arg === '1d') duration = 86400;
            else if (arg === '7d' || arg === '7') duration = 604800;
            else if (arg === '90d' || arg === '90') duration = 7776000;
            try {
                await sock.sendMessage(jid, { disappearingMessagesInChat: duration });
                if (duration === 0) reply('Ã¢Å“â€¦ Disappearing messages *disabled*.');
                else reply(`Ã¢Å“â€¦ Disappearing messages set to *${arg === '24h' || arg === '1d' ? '24 hours' : arg === '90d' || arg === '90' ? '90 days' : '7 days'}*.\n\nAll new messages will auto-delete after this period.`);
            } catch (e) {
                reply(`Ã¢ÂÅ’ Failed: ${e.message}\n\nMake sure the bot has admin rights.`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Mention Admins Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['admins', 'tagadmins', 'mentionadmins', '@admins'],
    category: 'group',
        description: 'Mention all group admins',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply, safeSend, groupMetadata } = ctx;
            const meta = groupMetadata || await sock.groupMetadata(jid).catch(() => null);
            if (!meta) return reply('Ã¢ÂÅ’ Could not fetch group info.');
            const adminList = (meta.participants || []).filter(p => p.admin);
            if (!adminList.length) return reply('Ã¢Å¡Â Ã¯Â¸Â No admins found in this group.');
            const reason = args.join(' ').trim() || 'Attention needed';
            const mentions = adminList.map(p => p.id || p.jid || p.phoneNumber).filter(Boolean);
            const text = `Ã°Å¸â€œÂ¢ *Admins Mentioned*\n\nÃ°Å¸â€œÂ *Reason:* ${reason}\n\n${adminList.map(p => `Ã¢â‚¬Â¢ @${p.id.split('@')[0]}`).join('\n')}`;
            await safeSend({ text, mentions }, { quoted: message });
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Group Link Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['grouplink', 'invitelink', 'groupinvite'],
    category: 'group',
        description: 'Get the group invite link (bot must be admin)',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            try {
                const code = await sock.groupInviteCode(jid);
                reply(`Ã°Å¸â€â€” *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}\n\n_Share this link to invite people to the group._`);
            } catch (e) {
                reply(`Ã¢ÂÅ’ Failed to get invite link.\nMake sure I'm an admin: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Revoke Group Link Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['revokelink', 'resetlink', 'newlink'],
    category: 'group',
        description: 'Revoke and reset the group invite link',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            try {
                const code = await sock.groupRevokeInvite(jid);
                reply(`Ã¢Å“â€¦ *Group link revoked!*\n\nNew link:\nhttps://chat.whatsapp.com/${code}\n\n_Old link is now invalid._`);
            } catch (e) {
                reply(`Ã¢ÂÅ’ Failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Bulk Promote Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['promote', 'makeadmin'],
    category: 'group',
        description: 'Promote mentioned users to admin (reply or mention)',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply, mentionedJid } = ctx;
            const targets = mentionedJid?.length
                ? mentionedJid
                : message.message?.extendedTextMessage?.contextInfo?.participant
                    ? [message.message.extendedTextMessage.contextInfo.participant]
                    : [];
            if (!targets.length) return reply('Ã¢ÂÅ’ Mention or reply to users to promote.\nExample: `.promote @user1 @user2`');
            try {
                await sock.groupParticipantsUpdate(jid, targets, 'promote');
                reply(`Ã¢Å“â€¦ Promoted ${targets.length} user(s) to admin:\n${targets.map(t => `Ã¢â‚¬Â¢ @${t.split('@')[0]}`).join('\n')}`);
            } catch (e) {
                reply(`Ã¢ÂÅ’ Failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Bulk Demote Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['demote', 'removeadmin'],
    category: 'group',
        description: 'Demote mentioned admins to regular member',
        permission: 'admin',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply, mentionedJid } = ctx;
            const targets = mentionedJid?.length
                ? mentionedJid
                : message.message?.extendedTextMessage?.contextInfo?.participant
                    ? [message.message.extendedTextMessage.contextInfo.participant]
                    : [];
            if (!targets.length) return reply('Ã¢ÂÅ’ Mention or reply to users to demote.\nExample: `.demote @user`');
            try {
                await sock.groupParticipantsUpdate(jid, targets, 'demote');
                reply(`Ã¢Å“â€¦ Demoted ${targets.length} user(s):\n${targets.map(t => `Ã¢â‚¬Â¢ @${t.split('@')[0]}`).join('\n')}`);
            } catch (e) {
                reply(`Ã¢ÂÅ’ Failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Group Stats Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['groupstats', 'gstats', 'groupinfo2'],
    category: 'group',
        description: 'Detailed group statistics',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply, groupMetadata } = ctx;
            const meta = groupMetadata || await sock.groupMetadata(jid).catch(() => null);
            if (!meta) return reply('Ã¢ÂÅ’ Could not fetch group info.');
            const admins = (meta.participants || []).filter(p => p.admin);
            const members = (meta.participants || []).filter(p => !p.admin);
            const creation = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';
            reply(
                `Ã°Å¸â€œÅ  *Group Statistics*\n\n` +
                `Ã°Å¸â€œâ€º *Name:* ${meta.subject || 'N/A'}\n` +
                `Ã°Å¸â€˜Â¥ *Total Members:* ${meta.participants?.length || 0}\n` +
                `Ã°Å¸â€˜â€˜ *Admins:* ${admins.length}\n` +
                `Ã°Å¸â€˜Â¤ *Members:* ${members.length}\n` +
                `Ã°Å¸â€œâ€¦ *Created:* ${creation}\n` +
                `Ã°Å¸â€œÂ *Description:* ${(meta.desc || 'No description').slice(0, 100)}\n` +
                `Ã°Å¸â€â€™ *Restrict:* ${meta.restrict ? 'Only admins can edit' : 'All members'}\n` +
                `Ã°Å¸â€œÂ£ *Announce:* ${meta.announce ? 'Only admins can message' : 'All members can message'}`
            );
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Ping / Latency Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['ping2', 'latency', 'ms'],
    category: 'bot',
        description: 'Check bot response latency',
        permission: 'public',
        run: async (sock, message, args, ctx) => {
            const { jid, reply, safeSend } = ctx;
            const t = Date.now();
            const sent = await safeSend({ text: 'Ã°Å¸Ââ€œ Pinging...' }, { quoted: message });
            const latency = Date.now() - t;
            reply(`Ã°Å¸Ââ€œ *Pong!*\n\nÃ¢Å¡Â¡ *Latency:* ${latency}ms\nÃ°Å¸Â¤â€“ *Status:* Online\nÃ°Å¸â€™Â¾ *Memory:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ React to message Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['react', 'reaction'],
    category: 'general',
        description: 'React to a replied message with an emoji. Usage: .react Ã°Å¸ËœÂ',
        permission: 'public',
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const emoji = args[0] || 'Ã°Å¸â€˜Â';
            const quoted = message.message?.extendedTextMessage?.contextInfo;
            if (!quoted?.stanzaId) return reply('Ã¢ÂÅ’ Reply to a message first, then use `.react Ã°Å¸ËœÂ`');
            try {
                await sock.sendMessage(jid, {
                    react: {
                        text: emoji,
                        key: {
                            remoteJid: jid,
                            fromMe: quoted.participant === (ctx.sock?.user?.id || ''),
                            id: quoted.stanzaId,
                            participant: quoted.participant
                        }
                    }
                });
            } catch (e) {
                reply(`Ã¢ÂÅ’ Reaction failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Steal Sticker (convert media to sticker) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['steal', 'stealsticker', 'takesticker'],
    category: 'media',
        description: 'Convert any replied image/video/sticker to a bot-branded sticker',
        permission: 'public',
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return reply('Ã¢ÂÅ’ Reply to an image, video, or sticker with `.steal`');
            const { downloadContentFromMessage } = require('../../lib/baileys');
            let buffer, mime;
            try {
                let media, mtype;
                if (quoted.imageMessage) { media = quoted.imageMessage; mtype = 'image'; mime = 'image/webp'; }
                else if (quoted.videoMessage) { media = quoted.videoMessage; mtype = 'video'; mime = 'video/webp'; }
                else if (quoted.stickerMessage) { media = quoted.stickerMessage; mtype = 'sticker'; mime = 'image/webp'; }
                else return reply('Ã¢ÂÅ’ Reply to an image, video, or sticker.');
                const stream = await downloadContentFromMessage(media, mtype);
                buffer = Buffer.concat(await (async function*() { for await (const chunk of stream) yield chunk; })().next().then(async function collect(acc, stream) {
                    const chunks = [];
                    for await (const c of stream) chunks.push(c);
                    return chunks;
                }));
            } catch {}
            if (!buffer) {
                // Simpler approach
                try {
                    const stickerMsg = quoted.stickerMessage;
                    if (stickerMsg) {
                        const { downloadContentFromMessage } = require('../../lib/baileys');
                        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        buffer = Buffer.concat(chunks);
                        mime = 'image/webp';
                    }
                } catch (e) { return reply(`Ã¢ÂÅ’ Could not download media: ${e.message}`); }
            }
            if (!buffer) return reply('Ã¢ÂÅ’ Could not download the media. Try again.');
            try {
                await sock.sendMessage(jid, { sticker: buffer }, { quoted: message });
            } catch (e) {
                reply(`Ã¢ÂÅ’ Sticker send failed: ${e.message}`);
            }
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Broadcast to all group members' DMs (owner only) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['broadcast2', 'bcastmembers'],
    category: 'group',
        description: 'DM a message to all members of the current group (owner only)',
        permission: 'owner',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply, groupMetadata } = ctx;
            const text = args.join(' ').trim();
            if (!text) return reply('Usage: `.broadcast2 <message>`\n\nThis sends a private DM to every group member.');
            const meta = groupMetadata || await sock.groupMetadata(jid).catch(() => null);
            if (!meta) return reply('Ã¢ÂÅ’ Could not fetch group info.');
            const members = (meta.participants || []).filter(p => !p.id.endsWith('@lid'));
            reply(`Ã°Å¸â€œÂ¤ Broadcasting to ${members.length} members... This may take a moment.`);
            let sent = 0, failed = 0;
            for (const p of members) {
                try {
                    await sock.sendMessage(p.id, { text: `Ã°Å¸â€œÂ¢ *Group Broadcast*\n\n${text}\n\n_From: ${meta.subject}_` });
                    sent++;
                    await new Promise(r => setTimeout(r, 800));
                } catch { failed++; }
            }
            reply(`Ã¢Å“â€¦ Broadcast complete!\n\nÃ¢Å“â€Ã¯Â¸Â Sent: ${sent}\nÃ¢ÂÅ’ Failed: ${failed}`);
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Anonymous Message Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['anon', 'anonymous', 'anonmsg'],
    category: 'group',
        description: 'Send an anonymous message to this group. Only bot knows who sent it.',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, safeSend } = ctx;
            const text = args.join(' ').trim();
            if (!text) return ctx.reply('Usage: `.anon <your message>`\nYour identity will be hidden!');
            await safeSend({
                text: `Ã°Å¸â€¢ÂµÃ¯Â¸Â *Anonymous Message*\n\n${text}\n\n_Ã°Å¸â€™Â¬ Use .anon to send an anonymous message_`
            });
        }
    },
 
    // Ã¢â€â‚¬Ã¢â€â‚¬ Chat Statistics Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    {
        commands: ['chatstats', 'toptalkers', 'whotalks'],
    category: 'group',
        description: 'Show who talks most in this group',
        permission: 'public',
        group: true,
        run: async (sock, message, args, ctx) => {
            const { jid, reply } = ctx;
            const gMap = global.groupMsgMap?.get(jid);
            if (!gMap?.size) return reply('Ã°Å¸â€œÅ  Not enough data yet. Chat a bit more and try again!');
            const sorted = [...gMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
            const total = [...gMap.values()].reduce((a, b) => a + b, 0);
            const lines = sorted.map(([phone, count], i) => {
                const pct = Math.round(count / total * 100);
                const bar = 'Ã¢â€“Ë†'.repeat(Math.round(pct / 10)) + 'Ã¢â€“â€˜'.repeat(10 - Math.round(pct / 10));
                return `${i + 1}. +${phone}\n   ${bar} ${count} msgs (${pct}%)`;
            });
            reply(`Ã°Å¸â€œÅ  *Top Talkers*\n\n${lines.join('\n\n')}\n\n_Total messages tracked: ${total}_`);
        }
    },
 
];

const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database/antiword.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {}
    return {};
}

function saveDB(db) {
    fs.ensureDirSync(path.dirname(DB_PATH));
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = {
    name: 'antiword',
    alias: ['bw', 'bannedwords'],
    desc: 'Manage banned words in the group',
    category: 'Admin',
    reactions: { start: '🛡️' },
    groupOnly: true,
    adminOnly: true,

    execute: async (sock, m, { args, reply, prefix }) => {
        const db = loadDB();
        const groupId = m.chat;
        if (!db[groupId]) db[groupId] = { enabled: false, words: [], action: 'warn', maxWarns: 3 };

        const sub  = (args[0] || '').toLowerCase();
        const rest = args.slice(1).join(' ').trim();

        // .antiword  — show status
        if (!sub) {
            const status = db[groupId].enabled ? 'ON' : 'OFF';
            const action = db[groupId].action || 'warn';
            const words = db[groupId].words || [];
            return reply(
                `╭─❍ *ANTI-WORD*\n` +
                `│ Status   : *${status}*\n` +
                `│ Action   : *${action.toUpperCase()}*\n` +
                `│ Warnings : ${db[groupId].maxWarns || 3}\n` +
                `│ Words    : ${words.length}\n` +
                `│\n` +
                `│ Commands:\n` +
                `│ .antiword on\n` +
                `│ .antiword off\n` +
                `│ .antiword delete\n` +
                `│ .antiword kick\n` +
                `│ .antiword warn [1-3]\n` +
                `│ .antiword action delete|warn|kick\n` +
                `│ .antiword add <word>\n` +
                `│ .antiword remove <word>\n` +
                `│ .antiword list\n` +
                `│ .antiword clear\n` +
                `╰────────────────`
            );
        }

        // .antiword on
        if (sub === 'on') {
            db[groupId].enabled = true;
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Anti-Word ENABLED`');
        }

        // .antiword off
        if (sub === 'off') {
            db[groupId].enabled = false;
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Anti-Word DISABLED`');
        }

        // .antiword delete / kick — direct shorthand, same style as antilink
        if (sub === 'delete') {
            db[groupId].action = 'delete';
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Action set to: DELETE`');
        }
        if (sub === 'kick') {
            db[groupId].action = 'kick';
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Action set to: KICK`');
        }

        // .antiword warn [1-3]
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return reply(`\`✘ Usage: ${prefix || '.'}antiword warn [1-3]\nMax warnings allowed is 3.\``);
            db[groupId].action = 'warn';
            db[groupId].maxWarns = n;
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Action set to WARN. Max ${n} warnings before kick.\``);
        }

        // .antiword action delete|warn|kick
        if (sub === 'action') {
            const newAction = rest.toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(newAction)) {
                return reply('`✘ Action must be: delete, warn, or kick`');
            }
            db[groupId].action = newAction;
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Action set to: ${newAction.toUpperCase()}\``);
        }

        // .antiword add <word>
        if (sub === 'add') {
            if (!rest) return reply('`✘ Provide a word to add`');
            const word = rest.toLowerCase();
            if (db[groupId].words.includes(word)) return reply('`✘ Word already in list`');
            db[groupId].words.push(word);
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Word added: "${word}"\``);
        }

        // .antiword remove <word>
        if (sub === 'remove') {
            if (!rest) return reply('`✘ Provide a word to remove`');
            const word = rest.toLowerCase();
            if (!db[groupId].words.includes(word)) return reply('`✘ Word not in list`');
            db[groupId].words = db[groupId].words.filter(w => w !== word);
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Word removed: "${word}"\``);
        }

        // .antiword list
        if (sub === 'list') {
            const words = db[groupId].words || [];
            if (!words.length) return reply('`✘ No banned words yet`');
            return reply('`Banned words:\n' + words.map((w, i) => `${i + 1}. ${w}`).join('\n') + '`');
        }

        // .antiword clear
        if (sub === 'clear') {
            db[groupId].words = [];
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 All banned words cleared`');
        }

        return reply('`✘ Invalid sub-command`');
    }
};
                               

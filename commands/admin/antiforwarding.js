const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database/antiforwarding.json');

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
    name: 'antiforwarding',
    alias: ['af', 'antiforward'],
    desc: 'Block forwarded messages',
    category: 'Admin',
    reactions: { start: '🛡️' },
    groupOnly: true,
    adminOnly: true,

    execute: async (sock, m, { args, reply, prefix }) => {
        const db = loadDB();
        const groupId = m.chat;
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'warn', maxWarns: 3 };

        const sub  = (args[0] || '').toLowerCase();
        const rest = args.slice(1).join(' ').trim();

        // .antiforwarding  — show status
        if (!sub) {
            const status = db[groupId].enabled ? 'ON' : 'OFF';
            const action = db[groupId].action || 'warn';
            return reply(
                `╭─❍ *ANTI-FORWARDING*\n` +
                `│ Status   : *${status}*\n` +
                `│ Action   : *${action.toUpperCase()}*\n` +
                `│ Warnings : ${db[groupId].maxWarns || 3}\n` +
                `│\n` +
                `│ Commands:\n` +
                `│ .antiforwarding on\n` +
                `│ .antiforwarding off\n` +
                `│ .antiforwarding delete\n` +
                `│ .antiforwarding kick\n` +
                `│ .antiforwarding warn [1-3]\n` +
                `│ .antiforwarding action delete|warn|kick\n` +
                `╰────────────────`
            );
        }

        // .antiforwarding on
        if (sub === 'on') {
            db[groupId].enabled = true;
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Anti-Forwarding ENABLED`');
        }

        // .antiforwarding off
        if (sub === 'off') {
            db[groupId].enabled = false;
            saveDB(db);
            return reply('`—͟͟͞͞𖣘 Anti-Forwarding DISABLED`');
        }

        // .antiforwarding delete / kick — direct shorthand, same style as antilink
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

        // .antiforwarding warn [1-3]
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return reply(`\`✘ Usage: ${prefix || '.'}antiforwarding warn [1-3]\nMax warnings allowed is 3.\``);
            db[groupId].action = 'warn';
            db[groupId].maxWarns = n;
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Action set to WARN. Max ${n} warnings before kick.\``);
        }

        // .antiforwarding action delete|warn|kick
        if (sub === 'action') {
            const newAction = rest.toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(newAction)) {
                return reply('`✘ Action must be: delete, warn, or kick`');
            }
            db[groupId].action = newAction;
            saveDB(db);
            return reply(`\`—͟͟͞͞𖣘 Action set to: ${newAction.toUpperCase()}\``);
        }

        return reply('`✘ Invalid sub-command`');
    }
};

/**
 * AntiGCStatus — Block/delete group status posts made by members.
 * Uses the SAME enabled/action(delete|warn|kick) system as the rest of
 * this bot's anti-systems (.antilink, .antiforwarding, .antiword, etc.),
 * so warnings accumulate consistently and the command surface matches.
 *
 * Enforcement lives in lib/antiSystems.js#checkAll(), which also runs a
 * reliable multi-method delete first (a group status post needs a special
 * key shape to actually revoke on WhatsApp's side).
 */
const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../database/antigcstatus.json');

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
    name: 'antigcstatus',
    aliases: ['nogcstatus', 'blockgcstatus', 'agcs'],
    description: 'Prevent members from posting to the group status feed',
    category: 'admin',
    reactions: { start: '🛡️' },
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const db = loadDB();
        const groupId = m.chat;
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'warn', maxWarns: 3 };

        const sub  = (args[0] || '').toLowerCase();
        const rest = args.slice(1).join(' ').trim();

        // .antigcstatus — show status
        if (!sub || sub === 'status') {
            const status = db[groupId].enabled ? 'ON' : 'OFF';
            const action = db[groupId].action || 'warn';
            return m.reply(
                `📊 *Anti-Group-Status Settings*\n\n` +
                `Status : *${status}*\n` +
                `Action : *${action.toUpperCase()}*\n` +
                `Warnings: ${db[groupId].maxWarns || 3}\n\n` +
                `*Usage:*\n` +
                `• \`${bot.prefix}antigcstatus on\`\n` +
                `• \`${bot.prefix}antigcstatus off\`\n` +
                `• \`${bot.prefix}antigcstatus delete\`\n` +
                `• \`${bot.prefix}antigcstatus kick\`\n` +
                `• \`${bot.prefix}antigcstatus warn [1-3]\`\n` +
                `• \`${bot.prefix}antigcstatus action delete|warn|kick\`\n` +
                `• \`${bot.prefix}antigcstatus status\``
            );
        }

        // .antigcstatus on
        if (sub === 'on') {
            db[groupId].enabled = true;
            saveDB(db);
            return m.reply('✅ *Anti-Group-Status Enabled*\n\nGroup status posts by members will now be handled per the current action (default: warn).');
        }

        // .antigcstatus off
        if (sub === 'off') {
            db[groupId].enabled = false;
            saveDB(db);
            return m.reply('❌ *Anti-Group-Status Disabled*\n\nMembers can now post to group status freely.');
        }

        // .antigcstatus delete / kick — direct shorthand, same style as antilink
        if (sub === 'delete') {
            db[groupId].action = 'delete';
            saveDB(db);
            return m.reply('✅ Action set to: *DELETE*');
        }
        if (sub === 'kick') {
            db[groupId].action = 'kick';
            saveDB(db);
            return m.reply('✅ Action set to: *KICK*');
        }

        // .antigcstatus warn [1-3]
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return m.reply(`✘ Usage: ${bot.prefix}antigcstatus warn [1-3]\nMax warnings allowed is 3.`);
            db[groupId].action = 'warn';
            db[groupId].maxWarns = n;
            saveDB(db);
            return m.reply(`✅ Action set to WARN. Max ${n} warnings before kick.`);
        }

        // .antigcstatus action delete|warn|kick
        if (sub === 'action') {
            const newAction = rest.toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(newAction)) {
                return m.reply('✘ Action must be: delete, warn, or kick');
            }
            db[groupId].action = newAction;
            saveDB(db);
            return m.reply(`✅ Action set to: *${newAction.toUpperCase()}*`);
        }

        return m.reply('✘ Invalid sub-command. Use: on, off, action delete|warn|kick, status');
    },
};
                   

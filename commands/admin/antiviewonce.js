const fs = require('fs-extra');

// Enforced from lib/antiSystems.js#_checkAllInner like every other anti-system.
// This file is only the on/off/action toggle. Group admins are always exempt.
module.exports = {
    name: 'antivv',
    aliases: ['avv', 'novv'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Delete view-once messages in this group (delete / warn / kick)',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antivv.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'warn', maxWarns: 3 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antivv status
Status: ${s.enabled ? 'ON' : 'OFF'}
Action: ${(s.action||'warn').toUpperCase()}
MaxWarns: ${s.maxWarns||3}

Deletes any view-once photo, video or voice note sent by a non-admin member.

Usage:
${bot.prefix}antivv on/off
${bot.prefix}antivv delete
${bot.prefix}antivv kick
${bot.prefix}antivv warn [1-3]`);

        if (sub === 'on')     { s.enabled = true;  save(); return await m.reply('Anti-ViewOnce enabled.'); }
        if (sub === 'off')    { s.enabled = false; save(); return await m.reply('Anti-ViewOnce disabled.'); }
        if (sub === 'delete') { s.action = 'delete'; save(); return await m.reply('Action set to DELETE. Those messages are deleted immediately.'); }
        if (sub === 'kick')   { s.action = 'kick';   save(); return await m.reply('Action set to KICK. User kicked immediately.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antivv warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antivv status`);
    }
};


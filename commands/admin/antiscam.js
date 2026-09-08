const fs = require('fs-extra');

// Detection itself (SCAM_CATEGORIES/detectScam) lives in lib/antiPatterns.js
// and is enforced from lib/antiSystems.js#_checkAllInner, exactly like
// antilink/antiword/antispam etc. This file is only the on/off/action
// toggle — same shape and config file layout as every other anti-system.
module.exports = {
    name: 'antiscam',
    aliases: ['as'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Configure anti-scam/fraud-message protection',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antiscam.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'delete', maxWarns: 3 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antiscam status
Status: ${s.enabled ? 'ON' : 'OFF'}
Action: ${(s.action||'delete').toUpperCase()}
MaxWarns: ${s.maxWarns||3}

Detects: investment fraud, fake giveaways, phishing, loan/money-mule
scams, crypto/forex scams, and fake job offers.

Usage:
${bot.prefix}antiscam on/off
${bot.prefix}antiscam delete
${bot.prefix}antiscam kick
${bot.prefix}antiscam warn [1-3]`);

        if (sub === 'on')     { s.enabled = true;  save(); return await m.reply('Anti-Scam enabled.'); }
        if (sub === 'off')    { s.enabled = false; save(); return await m.reply('Anti-Scam disabled.'); }
        if (sub === 'delete') { s.action = 'delete'; save(); return await m.reply('Action set to DELETE. Scam messages deleted immediately.'); }
        if (sub === 'kick')   { s.action = 'kick';   save(); return await m.reply('Action set to KICK. User kicked immediately for scam messages.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antiscam warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antiscam status`);
    }
};

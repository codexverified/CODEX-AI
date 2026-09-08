const fs = require('fs-extra');

// Detection (BEG_PATTERNS/detectBeg) lives in lib/antiPatterns.js and is
// enforced from lib/antiSystems.js#_checkAllInner, exactly like every other
// anti-system. This file is only the on/off/action toggle.
module.exports = {
    name: 'antibeg',
    aliases: ['ab2', 'antibegging'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Configure anti-begging protection (please/help/give/money/data solicitation)',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antibeg.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'warn', maxWarns: 3 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antibeg status
Status: ${s.enabled ? 'ON' : 'OFF'}
Action: ${(s.action||'warn').toUpperCase()}
MaxWarns: ${s.maxWarns||3}

Flags begging/solicitation messages — "please help me", "send me
money/data/airtime", "I need cash", "I'm broke", and similar phrasing.

Usage:
${bot.prefix}antibeg on/off
${bot.prefix}antibeg delete
${bot.prefix}antibeg kick
${bot.prefix}antibeg warn [1-3]`);

        if (sub === 'on')     { s.enabled = true;  save(); return await m.reply('Anti-Beg enabled.'); }
        if (sub === 'off')    { s.enabled = false; save(); return await m.reply('Anti-Beg disabled.'); }
        if (sub === 'delete') { s.action = 'delete'; save(); return await m.reply('Action set to DELETE. Begging messages deleted immediately.'); }
        if (sub === 'kick')   { s.action = 'kick';   save(); return await m.reply('Action set to KICK. User kicked immediately for begging.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antibeg warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antibeg status`);
    }
};
      

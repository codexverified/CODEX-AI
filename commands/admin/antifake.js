const fs = require('fs-extra');

// Anti-Fake — flags/removes joining members whose number doesn't start with
// any real international dialing code (lib/countryCodes.js).
//
// Enforcement lives in lib/antiSystems.js#checkGroupJoin(), called from
// app.js's handleGroupUpdate() on every 'add' event — the same join hook
// used for welcome messages, .akick, and .bancountry. (The previous version
// of this file exported its own onGroupParticipantsUpdate() hook, but
// nothing in this codebase's event wiring ever called it, so it silently
// never ran. Routing through the shared antiSystems engine like every
// other anti-system fixes that.)
//
// No "delete" action here — a join event has no message to delete — so
// this only exposes kick/warn, same warn[1-3] cap as the rest.
module.exports = {
    name: 'antifake',
    aliases: ['af2', 'fakenumber'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Kick/warn members who join with an unrecognized/fake phone number',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antifake.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'kick', maxWarns: 3 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antifake status
Status: ${s.enabled ? 'ON' : 'OFF'}
Action: ${(s.action||'kick').toUpperCase()}
MaxWarns: ${s.maxWarns||3}

Flags members who join with a number that has no valid international
country code (fake/unrecognized numbers).

Usage:
${bot.prefix}antifake on/off
${bot.prefix}antifake kick
${bot.prefix}antifake warn [1-3]`);

        if (sub === 'on')   { s.enabled = true;  save(); return await m.reply('Anti-Fake enabled.'); }
        if (sub === 'off')  { s.enabled = false; save(); return await m.reply('Anti-Fake disabled.'); }
        if (sub === 'kick') { s.action = 'kick'; save(); return await m.reply('Action set to KICK. Fake numbers removed on join.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antifake warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antifake status`);
    }
};

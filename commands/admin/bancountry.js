const bancountryStore = require('../../lib/bancountryStore');
const { normalizeCode } = require('../../lib/countryCodes');

// Same pattern as .akick: no separate on/off switch — a banned code is
// simply active the moment it's on the list. Enforcement lives in
// lib/antiSystems.js#checkGroupJoin(), called from app.js's
// handleGroupUpdate() on every 'add' event.
module.exports = {
    name: 'bancountry',
    aliases: ['bancc', 'countryban'],
    category: 'admin',
    reactions: { start: '🌍' },
    description: 'Ban a country code from this group — anyone joining with it is auto-kicked.\n' +
                 '.bancountry +92 — .bancountry remove +92 — .bancountry clear — .bancountry list',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'remove' || sub === 'unban' || sub === 'del' || sub === 'delete') {
            const raw = args[1];
            if (!raw) return m.reply(`Usage: ${bot.prefix}bancountry remove +92`);
            const clean = normalizeCode(raw);
            if (!clean) return m.reply('That doesn\'t look like a valid country code.');
            const removed = bancountryStore.remove(groupId, clean);
            if (!removed) return m.reply(`+${clean} isn't on the banned-country list.`);
            return m.reply(`✅ +${clean} removed from the banned-country list. Members from there can join normally now.`);
        }

        if (sub === 'clear') {
            bancountryStore.clear(groupId);
            return m.reply('🧹 Banned-country list cleared for this group.');
        }

        if (sub === 'list' || sub === '') {
            const codes = bancountryStore.list(groupId);
            if (!codes.length) return m.reply(`The banned-country list is empty.\n\nUsage: ${bot.prefix}bancountry +92`);
            return m.reply(`🌍 Banned countries (${codes.length}):\n${codes.map((c, i) => `${i + 1}. +${c}`).join('\n')}`);
        }

        // Anything else is treated as "ban this code" — .bancountry +92
        const clean = normalizeCode(sub);
        if (!clean) {
            return m.reply(`Usage:\n${bot.prefix}bancountry +92\n${bot.prefix}bancountry remove +92\n${bot.prefix}bancountry clear\n${bot.prefix}bancountry list`);
        }
        if (bancountryStore.isBanned(groupId, clean)) {
            return m.reply(`+${clean} is already banned in this group.`);
        }
        bancountryStore.add(groupId, clean);
        return m.reply(`🚫 +${clean} banned. Anyone joining this group with that country code will be automatically kicked.`);
    }
};

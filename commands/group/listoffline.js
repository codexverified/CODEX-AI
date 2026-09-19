const { parseDuration, formatDuration, MAX_DURATION_MS } = require('../../lib/duration');
const presenceStore = require('../../lib/presenceStore');

// Resolves a @lid pseudo-id down to the real phone-number jid where
// possible, using Baileys' own lid<->PN mapping store, so a tag never
// shows a meaningless @lid number. Falls back to the jid as-is if it's
// already a phone jid, or if no mapping is known yet.
async function resolvePhoneJid(bot, jid) {
    const clean = String(jid || '').replace(/:[0-9]+@/, '@');
    if (clean.endsWith('@lid')) {
        try {
            const lidMap = bot?.sock?.signalRepository?.lidMapping;
            if (lidMap?.getPNForLID) {
                const pn = await lidMap.getPNForLID(clean);
                if (pn) return String(pn).replace(/:[0-9]+@/, '@');
            }
        } catch (_) {}
    }
    return clean;
}

function digitsOf(jid) {
    return String(jid || '').split('@')[0].replace(/\D/g, '');
}

module.exports = {
    name: 'listoffline',
    aliases: ['offline'],
    category: 'group',
    reactions: { start: '⚪' },
    description: `List members NOT seen online for at least a given time, e.g. .listoffline 3m (max ${formatDuration(MAX_DURATION_MS)}).`,
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const ms = parseDuration(args?.[0]);

        if (ms === null) return m.reply(`Usage: ${prefix}listoffline <time>, e.g. ${prefix}listoffline 3m`);
        if (ms > MAX_DURATION_MS) return m.reply(`Max is ${formatDuration(MAX_DURATION_MS)}.`);

        await presenceStore.ensureSubscribed(bot.sock, m.chat);

        let participants = [];
        try {
            const meta = await bot.sock.groupMetadata(m.chat);
            participants = (meta?.participants || []).map(p => p.id).filter(Boolean);
        } catch (err) {
            return m.reply(`Failed: ${err.message}`);
        }

        const offline = presenceStore.getOffline(m.chat, ms, participants);
        if (!offline.length) return m.reply('No one offline.');

        const resolved = await Promise.all(offline.map(async (r) => ({
            ...r,
            phoneJid: await resolvePhoneJid(bot, r.jid),
        })));

        const lines = resolved.map(r => `@${digitsOf(r.phoneJid)} — ${r.lastOnlineAt ? formatDuration(Date.now() - r.lastOnlineAt) : '?'}`);
        const mentions = resolved.map(r => r.phoneJid);
        await m.reply(lines.join('\n'), { mentions });
    },
};

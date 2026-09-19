const duration = require('../../lib/duration');
const activityStore = require('../../lib/activityStore');

// Resolves a @lid pseudo-id down to the real phone-number jid where
// possible, using Baileys' own lid<->PN mapping store. Most stored
// activity is already a real phone jid (see messageHandler.js, which
// prefers key.participantPn when recording) — this is just a safety net
// for the rare case that wasn't available.
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

// The bot itself must never show up in its own online/offline list.
function isBotJid(bot, rawJid, phoneJid) {
    const botDigits = digitsOf(bot?.sock?.user?.id);
    const botLidDigits = digitsOf(bot?.sock?.user?.lid);
    const d1 = digitsOf(rawJid);
    const d2 = digitsOf(phoneJid);
    return (botDigits && (d1 === botDigits || d2 === botDigits)) ||
           (botLidDigits && (d1 === botLidDigits || d2 === botLidDigits));
}

module.exports = {
    name: 'listoffline',
    aliases: [],
    category: 'group',
    description: 'List members who sent no message for a given time, e.g. .listoffline 24h (max 24h).',
    groupOnly: true,
    adminOnly: true,

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        const ms = typeof duration.parseDuration === 'function' ? duration.parseDuration(args?.[0]) : null;

        if (ms === null) return m.reply(`Usage: ${prefix}listoffline <time>, e.g. ${prefix}listoffline 24h`);
        if (ms > duration.MAX_DURATION_MS) return m.reply('Max is 24h.');

        let participants = [];
        try {
            const meta = await bot.sock.groupMetadata(m.chat);
            for (const participant of meta?.participants || []) {
                const rawJid = participant.id;
                const phoneJid = await resolvePhoneJid(bot, rawJid);
                if (!isBotJid(bot, rawJid, phoneJid)) participants.push(phoneJid);
            }
        } catch (err) {
            return m.reply(`Failed: ${err.message}`);
        }

        const inactive = activityStore.getInactive(m.chat, ms, participants);
        if (!inactive.length) return m.reply(`Everyone sent a message within the last ${duration.formatDuration(ms)}.`);

        const resolved = [];
        for (const r of inactive) {
            const phoneJid = await resolvePhoneJid(bot, r.jid);
            if (isBotJid(bot, r.jid, phoneJid)) continue;
            resolved.push(phoneJid);
        }
        if (!resolved.length) return m.reply(`Everyone sent a message within the last ${duration.formatDuration(ms)}.`);

        const lines = resolved.map(jid => `@${digitsOf(jid)}`);
        await m.reply(`⚪ No message from these members in the last ${duration.formatDuration(ms)} (${resolved.length}):\n\n${lines.join('\n')}`, { mentions: resolved });
    },
};
            

/**
 * .foldgc — fold the group: removes EVERY member, including the owner, then
 * the bot leaves too. Owner/mod only. Irreversible, so it asks first:
 *
 *   .foldgc   → bot: "This action is irreversible. Reply with yes to confirm."
 *   yes       → runs immediately (no delay). "no" cancels.
 *
 * The confirm waits for the owner/mod to answer in the same chat (it lapses
 * after 2 minutes so an old "yes" can never fire later). The "yes" is picked
 * up by the BAN GATE-adjacent hook in lib/messageHandler.js, which calls
 * confirmIfPending() below.
 * (WhatsApp never lets anyone remove the group creator, so if the creator is a
 * different person they are the only one who stays — the bot still leaves.)
 *
 * This replaces .delgc — its names (delgc / deletegc / dgc) are aliases here.
 */
const gt = require('../../lib/groupTools');

const EXPIRES_MS = 2 * 60 * 1000;

function pending(bot) {
    if (!bot._foldgcPending) bot._foldgcPending = new Map();
    return bot._foldgcPending;
}

async function fold(bot, m) {
    let meta;
    try { meta = await bot.sock.groupMetadata(m.chat); }
    catch (err) { return m.reply(`❌ Couldn't read the group: ${err.message}`); }

    const list = await gt.listParticipants(bot, m, meta);
    const targets = list.filter(x => !x.bot).map(x => x.id).filter(Boolean);

    await m.reply('_𝌫 folding group..._').catch(() => {});

    try { if (targets.length) await gt.updateMany(bot, m.chat, targets, 'remove'); }
    catch (err) { console.error('[foldgc] remove failed:', err.message); }

    try { await bot.sock.groupLeave(m.chat); }
    catch (err) { console.error('[foldgc] leave failed:', err.message); }
}

/**
 * Called by lib/messageHandler.js for every plain-text message. Returns true
 * when it consumed the message (a "yes" / "no" answering a pending .foldgc).
 */
async function confirmIfPending(bot, m, text) {
    if (!m.isGroup) return false;
    const answer = String(text || '').trim().toLowerCase();
    if (answer !== 'yes' && answer !== 'no') return false;

    const map = pending(bot);
    const until = map.get(m.chat);
    if (!until) return false;
    if (Date.now() > until) { map.delete(m.chat); return false; }

    // Only the owner / a mod can answer (same people who can run .foldgc).
    let allowed = false;
    try { allowed = !!(m.key?.fromMe || bot.permission.isMod(m.sender, m._participantRaw)); } catch {}
    if (!allowed) return false;

    map.delete(m.chat);
    if (answer === 'no') { await m.reply('Cancelled.').catch(() => {}); return true; }

    if (!(await bot.permission.isBotAdmin(m.chat).catch(() => false))) {
        await m.reply('❌ I need to be a group admin to fold the group.').catch(() => {});
        return true;
    }
    await fold(bot, m);
    return true;
}

module.exports = {
    name: 'foldgc',
    aliases: ['foldgroup', 'delgc', 'deletegc', 'dgc'],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Remove every single person from the group, including the bot. Asks for a "yes" first. Irreversible.',
    groupOnly: true,
    ownerOnly: true,

    confirmIfPending,

    async execute(bot, m) {
        if (!(await bot.permission.isBotAdmin(m.chat).catch(() => false))) {
            return m.reply('❌ I need to be a group admin to fold the group.');
        }
        pending(bot).set(m.chat, Date.now() + EXPIRES_MS);
        return m.reply('⚠️ This action is irreversible. Every member will be removed and I will leave the group.\n\nReply *yes* to confirm.');
    },
};
    

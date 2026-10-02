/**
 * .tkick — temporary kick: removes a user, then automatically adds them back
 * after the time you give.
 *
 *   .tkick @user 10m      → kicked now, added back in 10 minutes (s / m / h / d / w)
 *   .tkick 2349012345678 1h   → by number (or reply to their message)
 *
 * The re-add survives a bot restart (persistent timer, lib/mute-core.js →
 * lib/tkickCore.js). If the user's privacy settings block a direct add, the bot
 * DMs them the group invite link instead.
 */
const { getTarget } = require('../../lib/getTarget');
const gt = require('../../lib/groupTools');
const mc = require('../../lib/mute-core');

module.exports = {
    name: 'tkick',
    aliases: ['tempkick', 'timedkick'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Kick a user and automatically add them back after a time — .tkick @user 10m',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const P = bot.prefix || '.';
        const usage =
`⏳ *TKICK*
Kick someone now and add them back automatically.

${P}tkick @user 10m
${P}tkick @user 1h
${P}tkick 2349012345678 30m  _(by number, or reply to them)_

_Time units: s m h d w_`;

        // ── who ──────────────────────────────────────────────────────────────
        const words = (args || []).filter(a => !String(a).startsWith('@'));
        let target = getTarget(m);
        if (!target) {
            const i = words.findIndex(a => /^\+?\d{7,}$/.test(a));
            if (i >= 0) { target = `${words[i].replace(/\D/g, '')}@s.whatsapp.net`; words.splice(i, 1); }
        }
        if (!target) return m.reply(usage);

        // ── how long ─────────────────────────────────────────────────────────
        const text = words.join(' ').toLowerCase().replace(/^(for|in|after)\s+/, '').replace(/(\d)\s+([a-z])/g, '$1$2').trim();
        const ms = text ? mc.parseTime(text.split(/\s+/)[0]) : 0;
        if (!ms) return m.reply(`⚠️ Tell me how long they should stay out.\n\n${usage}`);

        if (!(await bot.permission.isBotAdmin(m.chat).catch(() => false))) {
            return m.reply('❌ I need to be a group admin to kick members.');
        }

        // ── find them in the group ───────────────────────────────────────────
        let meta;
        try { meta = await bot.sock.groupMetadata(m.chat); }
        catch (err) { return m.reply(`❌ Couldn't read the group: ${err.message}`); }

        const list = await gt.listParticipants(bot, m, meta);
        const digits = [String(target).replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '')];
        const hit = list.find(x => x.forms.some(f => digits.includes(String(f).split('@')[0].replace(/[^0-9]/g, ''))));
        if (!hit) return m.reply("ℹ️ That person isn't in this group.");

        if (hit.bot)        return m.reply("❌ I can't kick myself.");
        if (hit.owner)      return m.reply("⛔ You can't kick the bot owner.");
        if (hit.sender)     return m.reply("⛔ You can't tkick yourself.");
        if (hit.superadmin) return m.reply("⛔ The group creator can't be removed.");

        // ── kick, then schedule the re-add ───────────────────────────────────
        const { done } = await gt.updateMany(bot, m.chat, [hit.id], 'remove');
        if (!done) return m.reply('❌ Failed to kick — WhatsApp refused it.');

        const pn  = hit.forms.find(f => f.endsWith('@s.whatsapp.net')) || null;
        const alt = pn && pn !== hit.id ? pn : null;
        try { mc.cancel({ type: 'tkickAdd', chat: m.chat, target: hit.id }); } catch {}
        mc.schedule({
            type: 'tkickAdd', chat: m.chat, target: hit.id,
            expiresAt: Date.now() + ms, mutedBy: m.sender,
            extra: { alt },
        });

        const who = `@${(alt || hit.id).split('@')[0]}`;
        return bot.sendMessage(m.chat, {
            text: `✅ ${who} was kicked and will be added back in *${mc.humanize(ms)}*.`,
            mentions: [hit.id, alt].filter(Boolean),
        });
    },
};
                                             

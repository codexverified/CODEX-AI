/**
 * .ban — stop a user from using the bot (all groups + DMs).
 *
 *   .ban @user                    → banned until you .unban them
 *   .ban @user 2h                 → banned for 2 hours (s / m / h / d / w)
 *   .ban @user after 2h           → ban starts in 2 hours
 *   .ban @user after 2h for 1h    → starts in 2 hours, lasts 1 hour
 *   .ban 2349012345678 1d         → by number (or reply to their message)
 *   .ban list  (or .banlist, .list ban)  → everyone who is banned
 *   .unban @user                  → lift a ban        (commands/owner/unban.js)
 *   .sch -ban @user 6pm to 9pm daily   (see commands/admin/sch.js)
 *
 * A banned user gets total silence: no reply, no reaction, no error — the bot
 * acts as if it never saw their message. The owner and mods can't be banned.
 * Logic lives in lib/banStore.js; timing uses the same timer engine as
 * .permit / .mute / .sch (lib/mute-core.js).
 */
const banStore = require('../../lib/banStore');
const { parseTime, humanize } = require('../../lib/mute-core');

// "after 2h for 1h" / "2h" / "" → { kind, ... } | { error }
function parseWindow(tokens) {
    const t = tokens.join(' ').toLowerCase().replace(/(\d)\s+([a-z])/g, '$1$2').split(/\s+/).filter(Boolean);
    if (t[0] === 'for') t.shift();
    if (!t.length) return { kind: 'forever' };

    if (t[0] === 'after' || t[0] === 'in') {
        t.shift();
        const delayMs = parseTime(t.shift());
        if (!delayMs) return { error: 'Bad delay after "after".' };
        if (t[0] === 'for') t.shift();
        let forMs = null;
        if (t.length) {
            forMs = parseTime(t.shift());
            if (!forMs) return { error: 'Bad duration after "for".' };
        }
        if (t.length) return { error: 'Too many words in that time.' };
        return { kind: 'after', delayMs, forMs };
    }

    const ms = parseTime(t.shift());
    if (!ms || t.length) return { error: 'Bad duration.' };
    return { kind: 'timed', ms };
}

module.exports = {
    name: 'ban',
    aliases: ['banuser', 'banlist', 'bans'],
    category: 'owner',
    reactions: { start: '🔨' },
    ownerOnly: true,
    description: 'Ban a user from using the bot (bot goes silent for them) — .ban @user | 2h | after 2h | after 2h for 1h | .ban list | .unban @user | .sch -ban @user 6pm to 9pm daily',

    async execute(bot, m, args, cmdName = '') {
        const P  = bot.prefix || '.';
        // .banlist / .bans always mean "show the list", whatever follows
        const a0 = /^(banlist|bans)$/i.test(String(cmdName || '')) ? 'list' : (args[0] || '').toLowerCase();

        const usage =
`🔨 *BAN*
Stop someone from using the bot. They get total silence — no reply, no reaction. Works in *all groups* and DMs.

*Ban*
${P}ban @user
${P}ban @user 2h  _(ends after 2h)_
${P}ban @user after 2h  _(starts in 2h)_
${P}ban @user after 2h for 1h
${P}ban 2349012345678  _(by number, or reply to them)_

*Manage*
${P}ban list  _(or ${P}banlist)_
${P}unban @user
${P}sch -ban @user 6pm to 9pm daily

_Time units: s m h d w. The owner and mods can't be banned._`;

        // ── list ─────────────────────────────────────────────────────────────
        if (a0 === 'list' || a0 === 'ls' || a0 === 'status') {
            const r = banStore.renderList(bot);
            return m.reply(r.text, { mentions: r.mentions });
        }
        if (a0 === 'help') return m.reply(usage);

        // ── who ──────────────────────────────────────────────────────────────
        const t = await banStore.targetFromMessage(bot, m, args);
        if (!t) return m.reply(usage);

        const why = banStore.protectedReason(bot, t.forms);
        if (why) return m.reply(`⛔ ${why}`);

        // ── when ─────────────────────────────────────────────────────────────
        const w = parseWindow(t.rest);
        if (w.error) {
            return m.reply(`⚠️ ${w.error} Try:\n${P}ban @user 2h\n${P}ban @user after 2h\n${P}ban @user after 2h for 1h\n_(units: s m h d w)_`);
        }

        const now = Date.now();
        const who = `@${t.jid.split('@')[0]}`;
        let startsAt = null, expiresAt = null, msg;

        if (w.kind === 'forever') {
            msg = `🔨 ${who} is now *banned* — the bot will ignore them until you ${P}unban them.`;
        } else if (w.kind === 'timed') {
            expiresAt = now + w.ms;
            msg = `🔨 ${who} is now *banned* for *${humanize(w.ms)}*.`;
        } else {
            startsAt  = now + w.delayMs;
            expiresAt = w.forMs ? startsAt + w.forMs : null;
            msg = `⏳ ${who} will be *banned* in *${humanize(w.delayMs)}*` +
                  (w.forMs ? ` and stay banned for *${humanize(w.forMs)}*.` : ' and stay banned until you unban them.');
        }

        banStore.ban({ jid: t.jid, forms: t.forms }, { startsAt, expiresAt }, { by: m.sender, notifyChat: m.chat });
        return m.reply(msg, { mentions: [t.jid] });
    },
};

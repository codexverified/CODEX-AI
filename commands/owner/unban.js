/**
 * .unban — lift a ban set with .ban (see commands/owner/ban.js).
 *
 *   .unban @user              → unban right now (also cancels any timer or daily ban for them)
 *   .unban @user after 2h     → the ban lifts by itself in 2 hours (s / m / h / d / w)
 *   .unban 2349012345678      → by number (or reply to their message)
 *   .unban all                → lift every ban
 *   .unban (alone)            → shows the command helpers, like .ban does
 */
const banStore = require('../../lib/banStore');
const { parseTime, humanize } = require('../../lib/mute-core');

// "after 2h" / "in 2h" / "" → { kind:'now' } | { kind:'after', ms } | { error }
function parseWhen(tokens) {
    const t = tokens.join(' ').toLowerCase().replace(/(\d)\s+([a-z])/g, '$1$2').split(/\s+/).filter(Boolean);
    if (!t.length) return { kind: 'now' };
    if (t[0] !== 'after' && t[0] !== 'in') return { error: 'Put "after" before the time.' };
    t.shift();
    const ms = parseTime(t.shift());
    if (!ms || t.length) return { error: 'Bad delay after "after".' };
    return { kind: 'after', ms };
}

module.exports = {
    name: 'unban',
    aliases: ['unbanuser'],
    category: 'owner',
    reactions: { start: '✅' },
    ownerOnly: true,
    description: 'Unban a user so the bot answers them again — .unban @user | .unban @user after 2h | .unban all',

    async execute(bot, m, args) {
        const P  = bot.prefix || '.';
        const a0 = (args[0] || '').toLowerCase();

        if (a0 === 'all') {
            const r = banStore.clearAll();
            if (!r.users && !r.windows) return m.reply('ℹ️ No one was banned.');
            return m.reply(`✅ *All bans lifted* — ${r.users} ban${r.users === 1 ? '' : 's'}${r.windows ? ` and ${r.windows} daily schedule${r.windows === 1 ? '' : 's'}` : ''} removed.`);
        }

        const usage =
`✅ *UNBAN*
Let a banned user use the bot again.

*Unban*
${P}unban @user  _(right now)_
${P}unban @user after 2h  _(lifts by itself in 2h)_
${P}unban 2349012345678  _(by number, or reply to them)_
${P}unban all  _(everyone)_

*Manage*
${P}ban list
${P}sch -unban @user 6pm to 9pm daily  _(unbanned in that window, banned the rest of the day)_

_Time units: s m h d w_`;

        if (a0 === 'help') return m.reply(usage);

        const t = await banStore.targetFromMessage(bot, m, args);
        if (!t) return m.reply(usage);

        const when = parseWhen(t.rest);
        if (when.error) {
            return m.reply(`⚠️ ${when.error}\n\n${usage}`);
        }

        const who = `@${t.jid.split('@')[0]}`;

        // ── later: .unban @user after 2h ─────────────────────────────────────
        if (when.kind === 'after') {
            const r = banStore.unbanAfter({ jid: t.jid, forms: t.forms }, when.ms, { by: m.sender, notifyChat: m.chat });
            if (r.status === 'none')    return m.reply(`ℹ️ ${who} isn't banned.`, { mentions: [t.jid] });
            if (r.status === 'windows') return m.reply(`ℹ️ ${who} only has a daily ban schedule. Use ${P}unban ${who} to remove it.`, { mentions: [t.jid] });
            if (r.status === 'sooner')  return m.reply(`ℹ️ ${who}'s ban already ends in *${humanize(r.endsInMs)}* — sooner than that.`, { mentions: [t.jid] });
            return m.reply(
                r.cancelled
                    ? `✅ ${who}'s upcoming ban was cancelled — it would only have started after that time.`
                    : `⏳ ${who} will be *unbanned* in *${humanize(when.ms)}*.`,
                { mentions: [t.jid] },
            );
        }

        // ── now ──────────────────────────────────────────────────────────────
        const r = banStore.unban(t.forms);
        if (!r.hadBan && !r.windowsRemoved) return m.reply(`ℹ️ ${who} isn't banned.`, { mentions: [t.jid] });

        return m.reply(
            `✅ ${who} is *unbanned* — the bot answers them again.${r.windowsRemoved ? '\n_(their daily ban schedule was removed too)_' : ''}`,
            { mentions: [t.jid] },
        );
    },
};
                

/**
 * .permit — open commands to EVERYONE (non-mod / non-sudo too), in ALL groups + DMs.
 *
 *   .permit ping                   → permit .ping (until removed)
 *   .permit ping 2h                → permit for 2 hours (s / m / h / d / w)
 *   .permit ping after 2h          → starts in 2 hours
 *   .permit ping after 2h for 1h   → starts in 2 hours, lasts 1 hour
 *   .permit economy                → every economy command (new ones included)
 *   .permit remove ping            → take a permit away (also: .permit remove economy)
 *   .permit off / .permit on       → switch the whole permit system off / on
 *   .list permit                   → show everything that is permitted
 *   .clear permit                  → remove all permits
 *   .sch -permit ping 6pm to 9pm daily   (see commands/admin/sch.js)
 *
 * Owner/admin commands can never be permitted. Logic lives in lib/permit.js;
 * timing uses the same timer engine as .mute / .sch (lib/mute-core.js).
 */
const permit = require('../../lib/permit');
const { parseTime, humanize } = require('../../lib/mute-core');

const REMOVE_WORDS = new Set(['remove', 'rm', 'del', 'delete', 'revoke', 'unpermit']);

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
    name: 'permit',
    aliases: ['permits'],
    category: 'owner',
    reactions: { start: '🔓' },
    ownerOnly: true,
    description: 'Open a command (or all economy cmds) to everyone in all groups — .permit ping | ping 2h | ping after 2h | economy | remove <cmd> | on/off | .list permit | .clear permit | .sch -permit <cmd> 6pm to 9pm daily',

    async execute(bot, m, args) {
        const P   = bot.prefix || '.';
        const a0  = (args[0] || '').toLowerCase();
        const off = () => (permit.isEnabled() ? '' : `\n\n⚠️ The permit system is currently *OFF* — use ${P}permit on.`);

        // ── help ─────────────────────────────────────────────────────────────
        if (!a0 || a0 === 'help') {
            return m.reply(
`🔓 *PERMIT*
Let everyone use a command — even people who aren't mod/sudo. Works in *all groups* and DMs.

*Give access*
${P}permit ping
${P}permit ping 2h  _(ends after 2h)_
${P}permit ping after 2h  _(starts in 2h)_
${P}permit ping after 2h for 1h
${P}permit economy  _(all economy cmds)_

*Manage*
${P}permit remove ping
${P}permit off  /  ${P}permit on
${P}list permit
${P}clear permit
${P}sch -permit ping 6pm to 9pm daily

_Time units: s m h d w. Owner/admin commands can never be permitted._`);
        }

        // ── on / off ─────────────────────────────────────────────────────────
        if (a0 === 'on' || a0 === 'off') {
            const changed = permit.setEnabled(a0 === 'on');
            return m.reply(a0 === 'on'
                ? `✅ Permit system *ON* — your permits are active again.${changed ? '' : '\n_(it was already on)_'}`
                : `🔒 Permit system *OFF* — all permits are paused (nothing is deleted).\nUse ${P}permit on to turn them back on.${changed ? '' : '\n_(it was already off)_'}`);
        }

        // ── list / clear ─────────────────────────────────────────────────────
        if (a0 === 'list' || a0 === 'ls' || a0 === 'status') return m.reply(permit.renderList(bot));

        if (a0 === 'clear' || a0 === 'reset') {
            const r = permit.clearAll();
            if (!r.grants && !r.windows) return m.reply('ℹ️ There were no permits to clear.');
            return m.reply(`🗑️ *Permits cleared* — ${r.grants} permit${r.grants === 1 ? '' : 's'}${r.windows ? ` and ${r.windows} daily schedule${r.windows === 1 ? '' : 's'}` : ''} removed.`);
        }

        // ── remove ───────────────────────────────────────────────────────────
        if (REMOVE_WORDS.has(a0)) {
            const names = args.slice(1);
            if (!names.length) return m.reply(`Usage: ${P}permit remove <command>\nExample: ${P}permit remove ping`);
            const out = [];
            for (const raw of names) {
                let key = null, label = raw;
                const res = permit.resolveTarget(bot, raw);
                if (res.ok) { key = res.key; label = res.label; }
                else {
                    // command may have been deleted since — fall back to any stored key with that name
                    const clean = raw.toLowerCase().replace(new RegExp(`^${P.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
                    const stored = permit.storedKeys();
                    key = [`cmd:${clean}`, `cat:${clean}`].find(k => stored.includes(k)) || null;
                    if (key) label = permit.describeKey(bot, key);
                }
                if (!key) { out.push(`❌ ${res.error || `No permit found for *${raw}*.`}`); continue; }

                const r = permit.revoke(key);
                if (!r.hadGrant && !r.windowsRemoved) { out.push(`ℹ️ *${label}* had no permit.`); }
                else out.push(`🗑️ Permit removed: *${label}*${r.windowsRemoved ? ' (and its daily schedule)' : ''}`);

                // still open through its category?
                if (key.startsWith('cmd:')) {
                    const cmd = bot.commandHandler.getCommand(key.slice(4));
                    if (cmd && permit.isCommandPermitted(bot, cmd)) {
                        out.push(`   ↳ still open via its *${cmd.category}* category permit — ${P}permit remove ${cmd.category} to close it.`);
                    }
                }
            }
            return m.reply(out.join('\n'));
        }

        // ── grant: .permit <cmd|category> [time] ─────────────────────────────
        if (parseTime(a0) || a0 === 'after' || a0 === 'for') {
            return m.reply(`⚠️ Which command? Put the command first, then the time:\n${P}permit ping ${a0 === 'after' ? 'after 2h' : '2h'}`);
        }
        const target = permit.resolveTarget(bot, args[0]);
        if (!target.ok) return m.reply(`❌ ${target.error}`);

        const rest = args.slice(1);
        if (rest.length === 1 && /^(off|remove|rm)$/i.test(rest[0])) {
            const r = permit.revoke(target.key);
            return m.reply(r.hadGrant || r.windowsRemoved ? `🗑️ Permit removed: *${target.label}*` : `ℹ️ *${target.label}* had no permit.`);
        }

        const w = parseWindow(rest);
        if (w.error) {
            return m.reply(`⚠️ ${w.error} Try:\n${P}permit ${target.name} 2h\n${P}permit ${target.name} after 2h\n${P}permit ${target.name} after 2h for 1h\n_(units: s m h d w)_`);
        }

        const now = Date.now();
        let startsAt = null, expiresAt = null, msg;
        const scope = target.type === 'cat'
            ? (() => { const c = permit.countCategory(bot, target.name); return `all *${target.name}* commands (${c.ok}${c.locked ? `; ${c.locked} owner/admin stay locked` : ''} — new ones are included automatically)`; })()
            : `*${target.label}*`;

        if (w.kind === 'forever') {
            msg = `✅ ${scope} is now open to *everyone*, in all groups — until you remove it.`;
        } else if (w.kind === 'timed') {
            expiresAt = now + w.ms;
            msg = `✅ ${scope} is now open to *everyone*, in all groups, for *${humanize(w.ms)}*.`;
        } else {
            startsAt  = now + w.delayMs;
            expiresAt = w.forMs ? startsAt + w.forMs : null;
            msg = `⏳ ${scope} will open to *everyone* in *${humanize(w.delayMs)}*` +
                  (w.forMs ? ` and stay open for *${humanize(w.forMs)}*.` : ' and stay open until you remove it.');
        }

        permit.grant(target, { startsAt, expiresAt }, { by: m.sender, notifyChat: m.chat });

        const mode = String(bot.config?.mode || 'public').toLowerCase();
        const hint = mode === 'public'
            ? `\n\n_ℹ️ Bot mode is PUBLIC, so everyone can already use non-restricted commands. Permits take effect when you switch to ${P}mode private._`
            : '';
        return m.reply(msg + hint + off());
    },
};
                     

'use strict';
 
/**
 * plugins/lendlimit.js
 * Owner tools:
 *  .lendlimit <n>   Ã¢â‚¬â€ set max simultaneous sub-bots (0 = unlimited)
 *  .lendexpiry <n>d|h Ã¢â‚¬â€ set default lend expiry (e.g. 7d, 24h, 0 = forever)
 *  .lendstats       Ã¢â‚¬â€ show lend health dashboard
 *  .expirelends     Ã¢â‚¬â€ owner manually triggers expiry check now
 */
 
const fs   = require('fs');
const path = require('path');
const { fmt } = require('../../lib/theme');
const { stopSubBot, wipeSubBotSession } = require('../../lib/subbot');
 
const SETTINGS_PATH = path.join(__dirname, '../../../data/lend-settings.json');
const LENDS_PATH    = path.join(__dirname, '../../../data/lends.json');
 
function loadSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return { maxSubBots: 0, defaultExpiryMs: 0 }; }
}
function saveSettings(s) {
    try { fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true }); fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2)); } catch { /* ignore */ }
}
function loadLends() {
    try { return JSON.parse(fs.readFileSync(LENDS_PATH, 'utf8')); } catch { return { pending: {}, approved: {}, rejected: {} }; }
}
function saveLends(db) {
    try { fs.mkdirSync(path.dirname(LENDS_PATH), { recursive: true }); fs.writeFileSync(LENDS_PATH, JSON.stringify(db, null, 2)); } catch { /* ignore */ }
}
 
function parseDuration(str) {
    const m = String(str).match(/^(\d+)(d|h|m)$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit === 'd') return n * 86400000;
    if (unit === 'h') return n * 3600000;
    if (unit === 'm') return n * 60000;
    return null;
}
 
function formatDuration(ms) {
    if (!ms) return 'Never (Ã¢Ë†Å¾)';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    return parts.join(' ') || '<1h';
}
 
// Ã¢â€â‚¬Ã¢â€â‚¬ Expiry checker (exported so codex.js can schedule it) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
async function checkExpiredLends(sock) {
    const settings = loadSettings();
    if (!settings.defaultExpiryMs) return; // no expiry configured
 
    const db  = loadLends();
    const now = Date.now();
    let expired = 0;
 
    for (const [key, record] of Object.entries(db.approved || {})) {
        const expiryMs = record.expiryMs || settings.defaultExpiryMs;
        if (!expiryMs) continue;
        const expiresAt = (record.approvedAt || 0) + expiryMs;
        if (now >= expiresAt) {
            // Stop sub-bot
            try { await stopSubBot(record.targetNumber); } catch { /* ignore */ }
            wipeSubBotSession(record.targetNumber);
 
            // Notify user
            const rJid = `${record.requestorNum}@s.whatsapp.net`;
            try {
                await sock.sendMessage(rJid, {
                    text: fmt(
                        `Ã¢ÂÂ° *Lend Expired*\n\n` +
                        `Your sub-bot (+${record.targetNumber}) lend has expired and been automatically stopped.\n\n` +
                        `Contact the bot owner to renew: \`.lend ${record.targetNumber}\``
                    )
                });
            } catch { /* ignore */ }
 
            // Move to rejected with expired flag
            record.expiredAt = now;
            db.rejected[key] = record;
            delete db.approved[key];
            expired++;
            console.log(`[LendExpiry] Expired sub-bot +${record.targetNumber} for +${record.requestorNum}`);
        }
    }
    if (expired) saveLends(db);
    return expired;
}
global._lendExpiryCheck = checkExpiredLends;
 
module.exports = {
    commands:    ['lendlimit', 'lendexpiry', 'lendstats', 'expirelends', 'lendconfig'],
    category: 'owner',
    description: 'Configure lend limits, expiry times, and view lend health dashboard',
    usage:       '.lendlimit 5 | .lendexpiry 7d | .lendstats | .expirelends',
    permission:  'owner',
    group:       true,
    private:     true,
 
    run: async (sock, message, args, ctx) => {
        const { sender, jid, isOwner, contextInfo, reply } = ctx;
        if (!isOwner) return reply(fmt('Ã¢â€ºâ€ Only the owner can manage lend settings.'));
 
        const rawCmd = (
            message.message?.extendedTextMessage?.text ||
            message.message?.conversation || ''
        ).trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
 
        const settings = loadSettings();
        const db       = loadLends();
 
        // Ã¢â€â‚¬Ã¢â€â‚¬ .lendconfig Ã¢â‚¬â€ show current config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (rawCmd === 'lendconfig' || (rawCmd === 'lendlimit' && !args.length)) {
            const pending  = Object.keys(db.pending  || {}).length;
            const approved = Object.keys(db.approved || {}).length;
            const running  = global.subBots?.size || 0;
            return reply(fmt(
                `Ã¢Å¡â„¢Ã¯Â¸Â *Lend Configuration*\n\n` +
                `Ã°Å¸â€Â¢ *Max sub-bots:*     ${settings.maxSubBots || 'Ã¢Ë†Å¾ (unlimited)'}\n` +
                `Ã¢ÂÂ° *Default expiry:*   ${formatDuration(settings.defaultExpiryMs)}\n\n` +
                `Ã°Å¸â€œÅ  *Current Status:*\n` +
                `   Pending requests: ${pending}\n` +
                `   Active lends: ${approved}\n` +
                `   Running sub-bots: ${running}\n\n` +
                `_Commands:_\n` +
                `Ã¢â‚¬Â¢ \`.lendlimit 5\` Ã¢â‚¬â€ max 5 sub-bots at once\n` +
                `Ã¢â‚¬Â¢ \`.lendlimit 0\` Ã¢â‚¬â€ unlimited\n` +
                `Ã¢â‚¬Â¢ \`.lendexpiry 7d\` Ã¢â‚¬â€ lends expire after 7 days\n` +
                `Ã¢â‚¬Â¢ \`.lendexpiry 0\` Ã¢â‚¬â€ no expiry`
            ));
        }
 
        // Ã¢â€â‚¬Ã¢â€â‚¬ .lendlimit <n> Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (rawCmd === 'lendlimit') {
            const n = parseInt(args[0], 10);
            if (isNaN(n) || n < 0) return reply(fmt('Ã¢Å¡Â Ã¯Â¸Â Usage: `.lendlimit <number>` (0 = unlimited)'));
            settings.maxSubBots = n;
            saveSettings(settings);
            return reply(fmt(`Ã¢Å“â€¦ Max simultaneous sub-bots set to *${n === 0 ? 'Ã¢Ë†Å¾ unlimited' : n}*.`));
        }
 
        // Ã¢â€â‚¬Ã¢â€â‚¬ .lendexpiry <duration> Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (rawCmd === 'lendexpiry') {
            if (!args[0]) return reply(fmt('Ã¢Å¡Â Ã¯Â¸Â Usage: `.lendexpiry 7d` (or 24h, 30d, 0 for no expiry)'));
            if (args[0] === '0') {
                settings.defaultExpiryMs = 0;
                saveSettings(settings);
                return reply(fmt('Ã¢Å“â€¦ Default lend expiry removed Ã¢â‚¬â€ lends are now permanent until revoked.'));
            }
            const ms = parseDuration(args[0]);
            if (!ms) return reply(fmt('Ã¢Å¡Â Ã¯Â¸Â Invalid format. Use `7d`, `24h`, `30d`, etc.'));
            settings.defaultExpiryMs = ms;
            saveSettings(settings);
            return reply(fmt(`Ã¢Å“â€¦ Default lend expiry set to *${formatDuration(ms)}*.\n\nAll new lends will expire after this duration.`));
        }
 
        // Ã¢â€â‚¬Ã¢â€â‚¬ .lendstats Ã¢â‚¬â€ dashboard Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (rawCmd === 'lendstats') {
            const approved = Object.values(db.approved || {});
            const pending  = Object.values(db.pending  || {});
            const running  = global.subBots?.size || 0;
            const now      = Date.now();
 
            const activeLines = approved.map(r => {
                const entry     = global.subBots?.get(r.targetNumber?.replace(/\D/g, ''));
                const status    = entry ? `Ã°Å¸Å¸Â¢ ${entry.status}` : 'Ã°Å¸â€Â´ offline';
                const expiryMs  = r.expiryMs || settings.defaultExpiryMs;
                let expiryStr   = 'never';
                if (expiryMs) {
                    const remaining = ((r.approvedAt || 0) + expiryMs) - now;
                    expiryStr = remaining > 0 ? `${Math.floor(remaining/86400000)}d ${Math.floor((remaining%86400000)/3600000)}h left` : 'Ã¢Å¡Â Ã¯Â¸Â expired';
                }
                return `  Ã°Å¸â€œÂ± *+${r.targetNumber}* Ã¢â€ â€™ ${r.requestorName}\n     ${status} | expires: ${expiryStr}`;
            });
 
            const pendingLines = pending.map(r =>
                `  Ã¢ÂÂ³ *${r.requestorName}* (+${r.requestorNum}) Ã¢â€ â€™ +${r.targetNumber}`
            );
 
            return reply(fmt(
                `Ã°Å¸â€œÅ  *Lend Dashboard*\n\n` +
                `Ã°Å¸â€Â¢ Limit: ${settings.maxSubBots || 'Ã¢Ë†Å¾'}  |  Ã¢ÂÂ° Expiry: ${formatDuration(settings.defaultExpiryMs)}\n` +
                `Ã°Å¸Å¸Â¢ Running: ${running}  |  Ã¢Å“â€¦ Approved: ${approved.length}  |  Ã¢ÂÂ³ Pending: ${pending.length}\n\n` +
                (activeLines.length ? `*Active Lends:*\n${activeLines.join('\n')}\n\n` : '') +
                (pendingLines.length ? `*Pending Requests:*\n${pendingLines.join('\n')}` : '') +
                (!activeLines.length && !pendingLines.length ? '_No lends on record._' : '')
            ));
        }
 
        // Ã¢â€â‚¬Ã¢â€â‚¬ .expirelends Ã¢â‚¬â€ manual trigger Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if (rawCmd === 'expirelends') {
            await reply(fmt('Ã¢ÂÂ³ Running expiry checkÃ¢â‚¬Â¦'));
            const expired = await checkExpiredLends(sock);
            return reply(fmt(
                expired
                    ? `Ã¢Å“â€¦ Expired and stopped *${expired}* sub-bot${expired !== 1 ? 's' : ''}.`
                    : `Ã¢Å“â€¦ No expired lends found.`
            ));
        }
    }
};

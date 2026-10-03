/**
 * C☯︎DEX-AI — Bad MAC self-heal
 *
 * WHAT THE ERROR IS
 *   "Session error: Bad MAC … SessionCipher.doDecryptWhisperMessage" means one
 *   incoming 1-to-1 message could not be decrypted with the stored Signal
 *   session for that sender. The stack names the session: the
 *   "at async 22355975864405_1.0 [as awaitable]" line is the sender's session
 *   address (user_domain.device — "_1" is a @lid address).
 *
 *   Normally WhatsApp's retry-receipt flow repairs this in seconds: the bot asks
 *   the sender to re-send, the sender builds a fresh session, done. When the
 *   STORED session is out of step with the sender's (a session file saved by
 *   an older/other process, a lost write, a LID↔phone session mix-up, …) the
 *   old session keeps being tried first, keeps failing, and every message from
 *   that person is silently dropped — while the phone and other linked
 *   devices, which have their own sessions, keep working. Restarting the bot
 *   doesn't help because the bad session is saved on disk.
 *
 * WHAT THIS DOES
 *   Watches the console (libsignal prints these errors straight to it) and,
 *   when the SAME session address fails twice within a minute, deletes just
 *   that one pairwise session (never creds / other sessions / sender keys).
 *   With no stored session, Baileys' retry receipt carries a fresh key bundle,
 *   the sender re-establishes the session and the next message decrypts.
 *   One heal per address per 10 minutes, at most 10 per hour, so it can't loop
 *   or wipe sessions broadly.
 */
const path = require('path');

let chalk = null;
try { chalk = require('chalk'); } catch {}
const note = (msg) => console.log(chalk ? chalk.magenta(msg) : msg);

const DEFAULTS = {
    threshold: 2,                  // failures for the same address …
    windowMs: 60 * 1000,           // … within this long → heal
    healDelayMs: 2000,             // let the in-flight burst finish first
    perAddressCooldownMs: 10 * 60 * 1000,
    maxPerHour: 10,
};

// "at async 22355975864405_1.0 [as awaitable]" → "22355975864405_1.0"
const ADDR_RE = /at async ([0-9A-Za-z_.-]+\.\d+) \[as awaitable\]/;

function init(bot, opts = {}) {
    if (!bot || bot._badMacHealInstalled) return;
    bot._badMacHealInstalled = true;
    const cfg = { ...DEFAULTS, ...opts };

    const hits = new Map();       // address → [timestamps]
    const lastHeal = new Map();   // address → timestamp
    const healLog = [];           // timestamps of recent heals
    const scheduled = new Set();

    async function deleteSession(address) {
        const keys = bot.sock?.authState?.keys;
        if (keys?.set) {
            await keys.set({ session: { [address]: null } });
            return 'store';
        }
        // Fallback: remove the file Baileys' multi-file auth state keeps for it.
        const fs = require('fs');
        const root = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
        const file = path.join(root, 'session', `session-${address}.json`);
        if (fs.existsSync(file)) { fs.unlinkSync(file); return 'file'; }
        return null;
    }

    async function heal(address) {
        scheduled.delete(address);
        const now = Date.now();
        while (healLog.length && now - healLog[0] > 60 * 60 * 1000) healLog.shift();
        if (healLog.length >= cfg.maxPerHour) return;
        if (now - (lastHeal.get(address) || 0) < cfg.perAddressCooldownMs) return;

        try {
            const how = await deleteSession(address);
            if (!how) return;
            lastHeal.set(address, now);
            healLog.push(now);
            hits.delete(address);
            note(`[bad-mac-heal] reset the broken session with ${address} — it will be re-established on their next message`);
        } catch (err) {
            console.log(`[bad-mac-heal] couldn't reset ${address}: ${err.message}`);
        }
    }

    function onLog(args) {
        const text = args.map(a => (typeof a === 'string' ? a : (a?.stack || a?.message || ''))).join(' ');
        if (!/bad mac/i.test(text) || !/session_cipher/i.test(text)) return; // 1-to-1 sessions only
        const m = text.match(ADDR_RE);
        if (!m) return;
        const address = m[1];

        const now = Date.now();
        const list = (hits.get(address) || []).filter(t => now - t <= cfg.windowMs);
        list.push(now);
        hits.set(address, list);

        if (list.length >= cfg.threshold && !scheduled.has(address)) {
            scheduled.add(address);
            const t = setTimeout(() => heal(address), cfg.healDelayMs);
            t.unref?.();
        }
    }

    for (const level of ['error', 'warn', 'log', 'info']) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
            orig(...args);
            try { onLog(args); } catch {}
        };
    }
}

module.exports = { init, ADDR_RE };
          

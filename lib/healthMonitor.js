/**
 * C☯︎DEX-AI — Health monitor ("why is the bot dead?")
 *
 * Symptom it explains: the bot shows connected on the panel and on the phone's
 * linked devices, but doesn't reply to commands, doesn't auto-read and doesn't
 * view statuses. Every 10 seconds this looks at the message pipeline and prints
 * ONE short [health] line naming the cause as soon as there is one:
 *
 *   • pipeline stuck in "<stage>" for Ns   → a step in the message queue never
 *                                            finished (which one, and for what chat)
 *   • websocket not open                   → the connection itself is down
 *   • no WhatsApp traffic for Nm           → socket looks open but nothing arrives
 *                                            (WhatsApp stopped delivering / half-dead)
 *   • N decrypt errors in 5m               → messages arrive but can't be read
 *                                            (Bad MAC / no session)
 *
 * It also un-sticks the queue by itself: if the pipeline is stuck for over 60s it
 * abandons the stuck work and lets new messages through, so the bot answers again
 * without a restart. When the problem is gone it prints "[health] recovered".
 * A single "[health] ok …" line is printed every 10 minutes when all is fine.
 *
 * Reads these fields (set in lib/connection.js): bot._pipe {stage,since,info},
 * bot._pipeQueued, bot._statusPipe, bot._lastInboundAt / _lastLiveEventAt,
 * bot._msgUpsertChain, bot.sock.ws.
 */
let chalk = null;
try { chalk = require('chalk'); } catch {}
const paint = (fn, s) => (chalk && chalk[fn] ? chalk[fn](s) : s);

const DEF = {
    everyMs: 10 * 1000,
    stuckWarnMs: 20 * 1000,        // say so after this
    stuckHealMs: 60 * 1000,        // abandon the stuck work after this
    silenceMs: 10 * 60 * 1000,     // open socket, nothing received this long
    decryptWindowMs: 5 * 60 * 1000,
    decryptWarnCount: 20,
    repeatMs: 60 * 1000,           // same problem is repeated at most this often
    okEveryMs: 10 * 60 * 1000,
};

const fmt = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m${s % 60 ? ' ' + (s % 60) + 's' : ''}` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function wsState(bot) {
    const ws = bot?.sock?.ws;
    if (!ws) return { known: false, open: false, label: 'no socket' };
    const rs = ws.socket?.readyState ?? ws.readyState;
    if (typeof ws.isOpen === 'boolean') return { known: true, open: ws.isOpen, label: ws.isOpen ? 'open' : `not open (readyState ${rs ?? '?'})` };
    if (typeof rs === 'number') return { known: true, open: rs === 1, label: rs === 1 ? 'open' : `not open (readyState ${rs})` };
    return { known: false, open: true, label: 'unknown' };
}

function start(bot, opts = {}) {
    if (!bot || bot._healthMonitor) return;
    const cfg = { ...DEF, ...opts };
    const log = opts.log || ((line, level) => console.log(level === 'warn' ? paint('yellow', line) : level === 'ok' ? paint('green', line) : paint('gray', line)));

    // count decrypt failures printed by libsignal / Baileys (same console feed lib/badMacHeal.js reads)
    const decryptHits = [];
    if (!opts.noConsoleHook) {
        for (const level of ['error', 'warn', 'log', 'info']) {
            const orig = console[level].bind(console);
            console[level] = (...args) => {
                orig(...args);
                try {
                    const t = typeof args[0] === 'string' ? args[0] : '';
                    if (/failed to decrypt|session error|bad mac|no session found|no matching sessions/i.test(t)) decryptHits.push(Date.now());
                } catch {}
            };
        }
    }

    const lastLogged = new Map();     // problem key -> time
    let hadProblem = false;
    let lastOk = Date.now();

    const problemLine = (key, text) => {
        const now = Date.now();
        if (now - (lastLogged.get(key) || 0) < cfg.repeatMs) return;
        lastLogged.set(key, now);
        log(`[health] ⚠ ${text}`, 'warn');
    };

    function check() {
        const now = Date.now();
        const problems = [];

        // 1) message pipeline stuck?
        const pipe = bot._pipe;
        const stuckFor = pipe && pipe.stage && pipe.stage !== 'idle' ? now - pipe.since : 0;
        const queued = bot._pipeQueued || 0;
        if (stuckFor >= cfg.stuckWarnMs) {
            problems.push('pipe');
            problemLine('pipe', `bot is not answering: the message queue is stuck in "${pipe.stage}" for ${fmt(stuckFor)}` +
                `${pipe.info ? ` (${pipe.info})` : ''}, ${queued} batch${queued === 1 ? '' : 'es'} waiting behind it. ` +
                `Socket and phone still look fine because only this queue is blocked.`);
            if (stuckFor >= cfg.stuckHealMs) {
                // abandon the stuck work (it keeps running in the background) so new messages flow again
                bot._msgUpsertChain = Promise.resolve();
                bot._pipeQueued = 0;
                bot._pipe = { stage: 'idle', since: now };
                bot._pipeUnstuck = (bot._pipeUnstuck || 0) + 1;
                log(`[health] ↻ abandoned the stuck "${pipe.stage}" step — new messages are handled again (times so far: ${bot._pipeUnstuck})`, 'warn');
            }
        } else if (queued > 3 && bot._lastBatchDoneAt && now - bot._lastBatchDoneAt > cfg.stuckWarnMs) {
            problems.push('backlog');
            problemLine('backlog', `${queued} message batches waiting and none finished for ${fmt(now - bot._lastBatchDoneAt)}`);
        }

        // 2) status queue stuck? (separate from commands, so only statuses are affected)
        const sp = bot._statusPipe;
        if (sp && now - sp.since >= cfg.stuckWarnMs) {
            problemLine('status', `status view/react has been working on one status for ${fmt(now - sp.since)} (${sp.info || '?'}) — commands are NOT affected`);
        }

        // 3) websocket state
        const ws = wsState(bot);
        const started = !!bot._connectionReadyAt;
        if (started && ws.known && !ws.open) {
            problems.push('ws');
            problemLine('ws', `websocket is ${ws.label} — the bot is disconnected from WhatsApp right now (a reconnect should follow)`);
        }

        // 4) open socket but nothing arriving
        const lastIn = Math.max(bot._lastInboundAt || 0, bot._lastLiveEventAt || 0);
        if (started && ws.open && lastIn && now - lastIn >= cfg.silenceMs) {
            problems.push('silence');
            problemLine('silence', `socket says ${ws.label} but NO WhatsApp traffic (messages/statuses/receipts) for ${fmt(now - lastIn)} — ` +
                `either truly quiet, or WhatsApp stopped delivering to this linked device. A restart/relink fixes the second case.`);
        }

        // 5) decrypt failures
        while (decryptHits.length && now - decryptHits[0] > cfg.decryptWindowMs) decryptHits.shift();
        if (decryptHits.length >= cfg.decryptWarnCount) {
            problems.push('decrypt');
            problemLine('decrypt', `${decryptHits.length} decrypt errors in the last ${fmt(cfg.decryptWindowMs)} — messages from some contacts reach the bot but can't be read (session out of sync)`);
        }

        if (problems.length) { hadProblem = true; return; }
        if (hadProblem) {
            hadProblem = false;
            log('[health] ✓ recovered — message pipeline is moving again', 'ok');
            lastOk = now;
        } else if (now - lastOk >= cfg.okEveryMs) {
            lastOk = now;
            log(`[health] ok — ws ${ws.label}, last WhatsApp traffic ${lastIn ? fmt(now - lastIn) + ' ago' : 'none yet'}, ` +
                `queue ${queued ? queued + ' waiting' : 'idle'}, decrypt errors ${decryptHits.length}/${fmt(cfg.decryptWindowMs)}, ` +
                `un-stuck ${bot._pipeUnstuck || 0}x`, 'ok');
        }
    }

    bot._healthMonitor = setInterval(() => { try { check(); } catch (e) { /* never let monitoring crash the bot */ } }, cfg.everyMs);
    bot._healthMonitor.unref?.();
    bot._healthCheck = check;     // exposed for tests
}

function stop(bot) { try { if (bot?._healthMonitor) clearInterval(bot._healthMonitor); } catch {} }

module.exports = { start, stop, wsState };
  

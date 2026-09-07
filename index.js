/**
 * Entry point — safe for hosts that hardcode `node index.js` or `npm start`.
 *
 * Baileys v7+ is ESM-only, so it can't be `require()`d directly from our
 * CommonJS code. We load it ONCE here via the CJS↔ESM bridge
 * (lib/baileys.js → dynamic import), THEN require the actual bot body (app.js).
 * app.js and every module it pulls in destructure Baileys synchronously from the
 * shim, which is fully populated by the time they load.
 *
 * The real application lives in app.js — this file is only the loader.
 */
// Filter a small set of forbidden log patterns (session keys, prekey
// bundles, ratchet/cipher material) out of anything printed via console.*.
// Baileys' own logger is already set to pino({ level: "silent" }) elsewhere,
// so this is a defense-in-depth net for any other library or code path that
// might otherwise print raw auth/session internals to the console/host logs.
(function _installConsoleFilter() {
    const FORBIDDEN = /(prekey|pre-key|signedidentitykey|noisekey|registrationid|ratchet|macKey|cipherKey|"creds":|privateKey)/i;
    for (const method of ['log', 'info', 'warn', 'error']) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            try {
                const joined = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
                if (FORBIDDEN.test(joined)) return;
            } catch {}
            original(...args);
        };
    }
})();

// Centralized temp directory MUST be set up before any library that reads
// TMPDIR/TMP/TEMP at load time (ffmpeg, canvas, Baileys media handling).
require('./utils/tempManager').initializeTempSystem();

// Retry the initial Baileys/app load a few times before giving up — a
// transient failure here (e.g. a slow disk, a momentary module resolution
// hiccup on a panel host) previously killed the process immediately via
// process.exit(1), and depending on the host's restart policy that could
// leave the bot down rather than simply retrying in place.
(async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await require('./lib/baileys').__load();   // populate the Baileys shim first
            require('./app.js');                        // app.js self-starts bot.start()
            return;
        } catch (err) {
            console.error(`Boot attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err?.message || err);
            if (attempt === MAX_ATTEMPTS) {
                console.error('Fatal: failed to load Baileys / boot after retries. The process will stay alive; fix the underlying issue and restart.');
                return;
            }
            await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
    }
})();

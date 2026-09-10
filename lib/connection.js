// Loaded via the CJS↔ESM bridge (index.js calls __load() before this runs).
// makeWASocket may be a default OR named export depending on Baileys version;
// the shim normalizes it so `makeWASocket` is always present.
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  getContentType,
  Browsers,
} = require("./baileys");
const pino = require("pino");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const axios = require("axios");
const readline = require("readline");
const { getVar } = require("./utils");

const SESSION_API_DEFAULT = "https://codex-ai-j8wh.onrender.com";
function getApiBase(bot) {
  return getVar(bot, "apiBase", SESSION_API_DEFAULT).replace(/\/+$/, "");
}
const SESSION_DIR = path.resolve(PROJECT_ROOT, "session");
const RECONNECT_DELAY_MS = 5000;
// Was 60s — a probe every minute causes false-positive reconnects on
// perfectly healthy but quiet sockets, since any single slow probe response
// (WhatsApp server hiccup, brief network jitter) gets treated as staleness.
// 30 minutes matches a normal "is this socket still alive" cadence and
// still catches genuinely dead sockets well within a usable window.
const CONNECTION_WATCHDOG_MS = 30 * 60 * 1000;

const MSG_CACHE_MAX = 2000;
const MSG_CACHE_PATH = "./database/msgcache.json";

// ── In-memory msgcache with debounced async persistence ─────────────────────
// _cacheMessage() in app.js used to call readMsgCache()/writeMsgCache() with
// fs.readFileSync/writeFileSync on every single incoming message. With an
// active chat and a cache that grows toward MSG_CACHE_MAX (2000 full
// message entries), that's a synchronous JSON.parse + JSON.stringify of a
// multi-hundred-KB file on the event loop for every message — which delays
// whatever else is queued on the loop, including Baileys' own websocket
// frame handling and keep-alive pings. Over many hours in an active group
// this is a major contributor to the socket going "silently stale" while
// still technically open.
//
// Fix: keep one in-memory object as the source of truth (readMsgCache()
// returns a live reference, matching the old call sites that do
// `cache[key] = ...; writeMsgCache(cache)`), and only touch disk on a
// trailing debounce so a burst of messages results in one write, not one
// per message. A max-delay guard still forces a flush periodically so data
// isn't lost for long if the process dies mid-burst.
let _msgCacheMem = null;
let _msgCacheLoaded = false;
let _msgCacheFlushTimer = null;
let _msgCacheFirstPendingWriteAt = 0;
const MSG_CACHE_DEBOUNCE_MS = 1500;
const MSG_CACHE_MAX_DELAY_MS = 8000;

function _loadMsgCacheOnce() {
  if (_msgCacheLoaded) return;
  _msgCacheLoaded = true;
  try {
    _msgCacheMem = JSON.parse(fs.readFileSync(MSG_CACHE_PATH, "utf8"));
  } catch {
    _msgCacheMem = {};
  }
}

function _flushMsgCacheToDisk() {
  if (_msgCacheFlushTimer) {
    clearTimeout(_msgCacheFlushTimer);
    _msgCacheFlushTimer = null;
  }
  _msgCacheFirstPendingWriteAt = 0;
  if (!_msgCacheMem) return;
  const keys = Object.keys(_msgCacheMem);
  const data =
    keys.length > MSG_CACHE_MAX
      ? Object.fromEntries(keys.slice(-MSG_CACHE_MAX).map((k) => [k, _msgCacheMem[k]]))
      : _msgCacheMem;
  const json = JSON.stringify(data);
  fs.writeFile(MSG_CACHE_PATH, json, (err) => {
    if (err) console.error("[msgcache] async write failed:", err.message);
  });
}

function readMsgCache() {
  _loadMsgCacheOnce();
  return _msgCacheMem;
}

function writeMsgCache(cache) {
  _msgCacheMem = cache;
  _msgCacheLoaded = true;
  const now = Date.now();
  if (!_msgCacheFirstPendingWriteAt) _msgCacheFirstPendingWriteAt = now;

  if (_msgCacheFlushTimer) clearTimeout(_msgCacheFlushTimer);

  // Force a flush if writes have been arriving continuously for too long
  // (keeps disk state from drifting too far behind under sustained load),
  // otherwise debounce so a burst of messages only costs one disk write.
  if (now - _msgCacheFirstPendingWriteAt >= MSG_CACHE_MAX_DELAY_MS) {
    _flushMsgCacheToDisk();
    return;
  }
  _msgCacheFlushTimer = setTimeout(_flushMsgCacheToDisk, MSG_CACHE_DEBOUNCE_MS);
  _msgCacheFlushTimer.unref?.();
}

// ── Debounced creds persistence ─────────────────────────────────────────────
// saveCreds() (from Baileys' useMultiFileAuthState) does a full write of
// creds.json on every single "creds.update" event. That event doesn't just
// fire once at login — app-state sync key rotations, registration/platform
// info changes, and other routine housekeeping all trigger it too, so on a
// long-running bot it can fire repeatedly in quick bursts. Each write is a
// JSON.stringify + disk write happening in the same tick as event
// processing — the exact same event-loop-blocking pattern already fixed
// above for the message cache, just for the credentials file this time.
//
// Unlike the message cache, losing creds.json is NOT low-stakes — a lost
// write means re-pairing the device from scratch. So this debounces WRITES
// (coalescing a tight burst into one call), never the underlying DATA: the
// real saveCreds() is always invoked with Baileys' current in-memory state
// (not a stale snapshot), a short debounce window still flushes promptly
// (1s, capped at 3s under sustained bursts), and flushPendingCredsSave()
// below is called from every shutdown/exit path so a pending debounced
// write is never silently dropped.
let _credsSaveFn = null;
let _credsFlushTimer = null;
let _credsFirstPendingAt = 0;
const CREDS_DEBOUNCE_MS = 1000;
const CREDS_MAX_DELAY_MS = 3000;

function _wrapSaveCreds(saveCreds) {
  _credsSaveFn = saveCreds;
  return function debouncedSaveCreds(...args) {
    const now = Date.now();
    if (!_credsFirstPendingAt) _credsFirstPendingAt = now;
    if (_credsFlushTimer) clearTimeout(_credsFlushTimer);

    if (now - _credsFirstPendingAt >= CREDS_MAX_DELAY_MS) {
      _flushCredsSave();
      return;
    }
    _credsFlushTimer = setTimeout(_flushCredsSave, CREDS_DEBOUNCE_MS);
    _credsFlushTimer.unref?.();
  };
}

function _flushCredsSave() {
  if (_credsFlushTimer) {
    clearTimeout(_credsFlushTimer);
    _credsFlushTimer = null;
  }
  _credsFirstPendingAt = 0;
  if (!_credsSaveFn) return;
  Promise.resolve(_credsSaveFn()).catch((err) => {
    console.error("[creds] save failed:", err?.message || err);
  });
}

// Exposed so app.js's graceful-shutdown handler can flush any pending
// debounced creds write before the process actually exits.
function flushPendingCredsSave() {
  _flushCredsSave();
}

async function askPhoneNumber() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
      console.log(chalk.blue("\nEnter your phone number starting with 234xxx"));
    rl.question(chalk.blue("Phone number: "), (answer) => {
      rl.close();
      resolve(answer.replace(/[^0-9]/g, ""));
    });
  });
}

async function askLoginMethod() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    console.log(chalk.white("\nNo saved credentials found choose how to login"));
    console.log(chalk.green("1 session id"));
    console.log(chalk.yellow("2 phone number\n"));
    rl.question(chalk.yellow("Choose [1/2]: "), (answer) => {
      rl.close();
      const val = String(answer || "")
        .trim()
        .toLowerCase();
      resolve(val === "1" || val.startsWith("s") ? "session" : "phone");
    });
  });
}

async function askSessionId() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    console.log(chalk.blue("\nEnter your session id starting with codex_ai-xxxx"));
    rl.question(chalk.blue("Session id: "), (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

// ── Restore a session from the remote session store ────────────────────────
// Fetches {apiBase}/api/session/:id (apiBase configurable via config.json's
// "apiBase", falling back to SESSION_API_DEFAULT), which returns:
//   { id, data: { files: { "creds_json": { originalName, content }, ... } }, storage: {...} }
// Each entry in `data.files` is written to ./session/<originalName> so
// useMultiFileAuthState() picks it up as a normal Baileys auth file.
async function fetchAndSaveSession(bot, sessionId, attempt = 1) {
  const id = String(sessionId || "").trim();
  if (!id) return false;

  const MAX_ATTEMPTS = 3;

  try {
    console.log(chalk.cyan(`\n☁️  Downloading session '${id}' from server...`));
    const { data: body } = await axios.get(`${getApiBase(bot)}/api/session/${id}`, {
      // Render's free tier spins the service down when idle; the first
      // request after that can take 30-60s to wake it back up. 15s was
      // too short and made valid session IDs look "broken".
      timeout: 60000,
    });

    // Support both our /sessions/:id shape and /whatsapp/fetch-example/:id shape.
    const files = body?.data?.files || body?.data?.data?.files || {};
    const entries = Object.values(files);

    if (!entries.length) {
      console.log(chalk.red(`❌ No session files found for ID '${id}'.`));
      console.log(
        chalk.gray(
          `   Raw server response: ${JSON.stringify(body).slice(0, 500)}`,
        ),
      );
      return false;
    }

    fs.ensureDirSync(SESSION_DIR);
    let written = 0;
    for (const file of entries) {
      if (!file?.originalName || file.content === undefined) continue;
      const filePath = path.join(SESSION_DIR, path.basename(file.originalName));
      fs.writeFileSync(filePath, JSON.stringify(file.content, null, 2));
      written++;
    }

    if (!written) {
      console.log(chalk.red(`❌ Session '${id}' returned no usable files.`));
      return false;
    }

    console.log(
      chalk.green(`✅ Restored ${written} session file(s) from ID '${id}'.`),
    );
    return true;
  } catch (err) {
    const serverMessage =
      err.response?.data?.error || err.response?.data?.message;
    const isTimeoutOrDown =
      err.code === "ECONNABORTED" ||
      err.code === "ECONNREFUSED" ||
      !err.response;

    if (isTimeoutOrDown && attempt < MAX_ATTEMPTS) {
      console.log(
        chalk.yellow(
          `⏳ Session server didn't respond in time (likely waking up from sleep). Retrying (${attempt}/${MAX_ATTEMPTS})...`,
        ),
      );
      return fetchAndSaveSession(bot, id, attempt + 1);
    }

    console.log(
      chalk.red(
        `❌ Failed to fetch session '${id}': ${serverMessage || err.message}`,
      ),
    );
    return false;
  }
}

// Persist a manually-entered session ID to a small dedicated file instead of
// rewriting config.json. config.json is the bot's main settings file — a
// dozen+ command handlers (mode, autoread, mods, ...) already read/write it
// for user-facing toggles, and on network/shared filesystems (Pterodactyl
// panels, some VPS setups) every extra writer to the SAME file increases
// the odds of two writes racing and corrupting it. Session persistence is
// purely internal bookkeeping and doesn't need to live in the user-editable
// settings file at all.
const SESSION_META_PATH = path.resolve(PROJECT_ROOT, "session", ".sessionId");

function persistSessionId(bot, sessionId) {
  try {
    bot.config.sessionId = sessionId; // keep in-memory config in sync for this run
    fs.ensureDirSync(SESSION_DIR);
    fs.writeFileSync(SESSION_META_PATH, String(sessionId || ""));
    console.log(
      chalk.green(
        "\n💾 Session ID saved — you won't be asked again.\n",
      ),
    );
  } catch (err) {
    console.log(
      chalk.yellow(
        `\n⚠️  Could not save session ID: ${err.message}\n`,
      ),
    );
  }
}

// Read a previously-persisted session ID from the dedicated file, falling
// back to nothing if it was never set this way (e.g. config.json's
// sessionId field, or the SESSION_ID env var, are checked separately by
// callers).
function _readPersistedSessionId() {
  try {
    return fs.readFileSync(SESSION_META_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

function _clearPersistedSessionId() {
  try {
    if (fs.existsSync(SESSION_META_PATH)) fs.unlinkSync(SESSION_META_PATH);
  } catch {}
}

// ── WA version fetch with a mirror fallback ─────────────────────────────────
// fetchLatestBaileysVersion() pulls the current WhatsApp Web version from
// GitHub's raw content servers. Some hosts (certain VPS/panel providers,
// or hosts behind country-level filtering) block or throttle raw GitHub
// specifically while general internet access is fine — which is exactly
// what silently produces "Couldn't link device" with a correct code: the
// socket falls back to Baileys' bundled version and WhatsApp quietly
// refuses to complete the link with it. jsDelivr mirrors GitHub repo
// contents and is reachable from most places raw GitHub isn't, so try that
// next before accepting the bundled fallback.
async function fetchVersionViaMirror() {
  const res = await axios.get(
    "https://cdn.jsdelivr.net/gh/WhiskeySockets/Baileys@master/src/Defaults/baileys-version.json",
    { timeout: 8000 },
  );
  const v = res.data?.version;
  if (!Array.isArray(v) || v.length !== 3) throw new Error("unexpected mirror response shape");
  return v;
}

async function resolveWAVersion() {
  console.log(chalk.yellow("Checking WhatsApp version..."));

  try {
    const fetched = await fetchLatestBaileysVersion();
    if (fetched.isLatest !== false) {
      console.log(chalk.green(`[Baileys] using WhatsApp version ${fetched.version.join(".")}`));
      return fetched.version;
    }
    const mirrorVersion = await fetchVersionViaMirror();
    console.log(chalk.green(`[Baileys] using WhatsApp version ${mirrorVersion.join(".")}`));
    return mirrorVersion;
  } catch {
    try {
      const mirrorVersion = await fetchVersionViaMirror();
      console.log(chalk.green(`[Baileys] using WhatsApp version ${mirrorVersion.join(".")}`));
      return mirrorVersion;
    } catch {
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
      console.log(chalk.green(`[Baileys] using WhatsApp version ${version ? version.join(".") : "default"}`));
      return version;
    }
  }
}

// Structured log line: timestamp, memory usage, and whatever context the
// caller passes. Used at every disconnect/reconnect/watchdog decision point
// so a stuck bot's logs actually show why, instead of just "connected" /
// silence.
function _logConn(label, extra = {}) {
  const mem = process.memoryUsage();
  const stamp = new Date().toISOString();
  const parts = Object.entries(extra)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(
    chalk.cyan(
      `[conn ${stamp}] ${label}${parts ? " " + parts : ""} rssMB=${(mem.rss / 1048576).toFixed(1)} heapMB=${(mem.heapUsed / 1048576).toFixed(1)}`,
    ),
  );
}

// Every code path that wants to reconnect goes through this so there is
// only ever one pending reconnect timer and one in-flight connection
// attempt. Previously, a "close" event could schedule a delayed reconnect
// via setTimeout AND the watchdog could separately call startConnection()
// immediately (after force-closing a stale socket) — both were guarded
// against running *simultaneously* by _startingConnection, but nothing
// stopped the delayed timer from firing again shortly after a fresh
// reconnect from the other path already succeeded, causing a redundant
// second reconnect. Centralizing scheduling here means a new reason to
// reconnect always cancels any earlier still-pending one first.
function _scheduleReconnect(bot, delayMs, reason) {
  if (bot._reconnectTimer) {
    clearTimeout(bot._reconnectTimer);
    bot._reconnectTimer = null;
  }
  _logConn("reconnect scheduled", { reason, delayMs });
  bot._reconnectTimer = setTimeout(() => {
    bot._reconnectTimer = null;
    startConnection(bot).catch((err) =>
      _logConn("reconnect attempt failed", { error: err?.message || err }),
    );
  }, delayMs);
  bot._reconnectTimer.unref?.();
}

function _clearConnectionTimers(bot) {
  if (bot._heartbeatInterval) {
    clearInterval(bot._heartbeatInterval);
    bot._heartbeatInterval = null;
  }
  if (bot._connectionHeartbeat) {
    clearInterval(bot._connectionHeartbeat);
    bot._connectionHeartbeat = null;
  }
  if (bot._connectionWatchdog) {
    clearInterval(bot._connectionWatchdog);
    bot._connectionWatchdog = null;
  }
  bot._connectionWatchdogCallback = null;
  if (bot._startupMessageTimer) {
    clearTimeout(bot._startupMessageTimer);
    bot._startupMessageTimer = null;
  }
  if (bot._reconnectTimer) {
    clearTimeout(bot._reconnectTimer);
    bot._reconnectTimer = null;
  }
  if (bot._stableResetTimer) {
    clearTimeout(bot._stableResetTimer);
    bot._stableResetTimer = null;
  }
}

async function _startConnection(bot) {
  // Monotonically increasing generation token. Every closure created for
  // this socket (watchdog cycle, pairing-code retry chain, connection.update
  // handler) captures `myGeneration` below and must check it against
  // `bot._connGeneration` before mutating bot state or creating a new
  // socket. This is what stops a stale callback from an old, already-
  // replaced socket from acting as if it were still current.
  bot._connGeneration = (bot._connGeneration || 0) + 1;
  const myGeneration = bot._connGeneration;
  // Clean up any existing event listeners AND every timer tied to the old
  // socket to prevent duplicates on reconnect. Previously only
  // _heartbeatInterval was cleared here — _connectionWatchdog and
  // _connectionHeartbeat were only cleared inside the "close" handler, so a
  // reconnect triggered any other way (e.g. the watchdog calling
  // startConnection() directly) could leave the old socket's watchdog/log
  // heartbeat interval running forever in the background alongside the new
  // one's.
  if (bot.sock) {
    try {
      bot.sock.ev.removeAllListeners();
    } catch {}
    try {
      bot.sock.end();
    } catch {}
  }
  _clearConnectionTimers(bot);

  fs.ensureDirSync(SESSION_DIR);
  let { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  let version = await resolveWAVersion();

  let hasSession = !!state.creds?.me?.id;

  let phoneNumber = "";
  bot._loginMethod = hasSession ? "session" : "phone";

  if (!hasSession) {
    // ── 1. Session ID from (in priority order): SESSION_ID env var,
    //    config.json's sessionId field, or a previously-persisted session
    //    file — fetch it automatically. Checking the env var first lets a
    //    host set it purely via environment/panel variables without ever
    //    touching config.json at all.
    const configSessionId = String(
      process.env.SESSION_ID || bot.config.sessionId || _readPersistedSessionId() || ""
    ).trim();
    if (configSessionId) {
      const ok = await fetchAndSaveSession(bot, configSessionId);
      if (ok) {
        ({ state, saveCreds } = await useMultiFileAuthState(SESSION_DIR));
        hasSession = !!state.creds?.me?.id;
      }
      if (!hasSession) {
        console.log(chalk.red("session id could not be verified"));
      }
    }

    // ── 2. Nothing configured / configured session failed — ask in terminal ──
    if (!hasSession) {
      const method = await askLoginMethod();

      if (method === "session") {
        const id = await askSessionId();
        const ok = id && (await fetchAndSaveSession(bot, id));
        if (ok) {
          ({ state, saveCreds } = await useMultiFileAuthState(SESSION_DIR));
          hasSession = !!state.creds?.me?.id;
          if (hasSession) {
            bot._loginMethod = "session";
            persistSessionId(bot, id);
          }
        }
        if (!hasSession) {
          console.log(chalk.red("session id could not be verified"));
          bot._loginMethod = "phone";
          phoneNumber = await askPhoneNumber();
          if (phoneNumber.length < 7) {
            console.log(
              chalk.red("\n❌ Invalid phone number. Please restart.\n"),
            );
            process.exit(1);
          }
        }
      } else {
        bot._loginMethod = "phone";
        phoneNumber = await askPhoneNumber();
        if (phoneNumber.length < 7) {
          console.log(chalk.red("Invalid phone number. Please restart."));
          process.exit(1);
        }
      }
    }
  }

  // Use one stable browser identity for phone-number pairing.
  // IMPORTANT: this must look like a real, current browser. WhatsApp's linking
  // servers silently reject pairing-code handshakes from stale/spoofed-looking
  // client fingerprints — the code still "generates" and can be typed in fine,
  // but the phone then reports "Couldn't link device" because WA never
  // completes the handshake on its end. A hardcoded old version string
  // (e.g. Chrome 95, from 2021) is exactly the kind of fingerprint that gets
  // silently rejected. Browsers.ubuntu("Chrome") asks Baileys to fill in a
  // tuple that matches what it currently knows WhatsApp accepts, so it stays
  // valid across Baileys updates instead of rotting like a hardcoded string.
  const _browser = Browsers && typeof Browsers.ubuntu === "function"
    ? Browsers.ubuntu("Chrome")
    : ["Ubuntu", "Chrome", "121.0.6167.85"];

  bot.sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: _browser,
    generateHighQualityLinkPreview: false,   // off — avoids unnecessary server calls
    syncFullHistory: false,                  // CRITICAL: never sync full history
    markOnlineOnConnect: true,
    getMessage: async () => proto.Message.fromObject({}),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined,        // no timeout — CRYSNOVA pattern
    keepAliveIntervalMs: 10000,              // 10s keep-alive — more responsive
    retryRequestDelayMs: 2000,              // conservative retry delay
    maxMsgRetryCount: 5,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    patchMessageBeforeSending: (msg) => msg,
  });

  // ── Secure Meta Service Label & AI Badge (@codexverified/baileys) ────────
  // Wrapped at the socket level once, so EVERY outgoing message gets both
  // flags — whether sent via bot.sendMessage(...) or directly via
  // bot.sock.sendMessage(...). Both are toggleable via dedicated commands.
  //
  // - SECURE_META_SERVICE: Flag "This account uses a secured service from Meta
  //   to manage this chat". Defaults ON. Toggle with .metasecure on|off.
  // - AI_BADGE: Shows 🤖 in DMs only. Defaults ON. Toggle with .aibadge on|off.
  const _origSendMessage = bot.sock.sendMessage.bind(bot.sock);
  bot.sock.sendMessage = async (jid, content, options = {}) => {
    try {
      if (content && typeof content === 'object') {
        // Secure Meta Service Label — ON by default, applies to ALL messages
        const secureEnabled = getVar(bot, "SECURE_META_SERVICE", true);
        if (secureEnabled) {
          content.secureMetaServiceLabel = true;
        }

        // AI badge — DMs only (@codexverified/baileys), ON by default
        const aiEnabled = getVar(bot, "AI_BADGE", true);
        const jidStr = typeof jid === "string" ? jid : Array.isArray(jid) ? jid[0] : "";
        const isPrivateChat =
          !!jidStr &&
          (jidStr.endsWith("@s.whatsapp.net") || jidStr.endsWith("@lid")) &&
          !jidStr.includes("@g.us");
        if (aiEnabled && isPrivateChat && content.ai === undefined) {
          content.ai = true;
        }
      }
    } catch {}
    // Never swallow a send failure — the command pipeline (and anything
    // else calling sock.sendMessage/bot.sendMessage) needs to see either a
    // real result or a thrown error, not a silently-resolved undefined.
    // This also gives the health endpoint a genuine "did a message actually
    // go out" signal instead of just "is the socket object present".
    try {
      const result = await _origSendMessage(jid, content, options);
      bot._lastOutboundSuccessAt = Date.now();
      return result;
    } catch (err) {
      const jidStr = typeof jid === "string" ? jid : Array.isArray(jid) ? jid[0] : "[unknown]";
      _logConn("sendMessage failed", { jid: jidStr, error: err?.message || err });
      throw err;
    }
  };

  if (!hasSession && phoneNumber) {
    // requestPairingCode only succeeds once the underlying websocket has
    // actually finished connecting to WhatsApp. A single flat 3s timeout is
    // often too short right after a fresh deploy/redeploy (npm install just
    // finished, host is still cold, network handshake hasn't completed yet),
    // which is what produces "failed to generate pairing code". Retry a few
    // times with backoff before giving up and doing a full socket restart.
    const requestCodeWithRetry = async (attempt = 1) => {
      const MAX_ATTEMPTS = 4;
      try {
        const code = await bot.sock.requestPairingCode(phoneNumber);
        console.log(chalk.green(`Your pairing code is ${code}`));
        console.log(chalk.yellow("Enter it on your phone to link the device."));
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          console.log(
            chalk.yellow(
              `Pairing code request failed (${err.message || "unknown error"}), retrying (${attempt}/${MAX_ATTEMPTS})...`,
            ),
          );
          setTimeout(() => requestCodeWithRetry(attempt + 1), 3000 * attempt);
        } else {
          console.log(chalk.red("Pairing code failed after several attempts"));
          // Route through the single supervisor instead of a scattered raw
          // setTimeout()->startConnection() call. Previously this created an
          // untracked timer that _clearConnectionTimers()/_scheduleReconnect()
          // didn't know about, so it could fire and start a second bootstrap
          // even after some other path (a close event, the watchdog) had
          // already scheduled — or completed — its own reconnect.
          if (bot._connGeneration === myGeneration) {
            _scheduleReconnect(bot, RECONNECT_DELAY_MS, "pairing-code retries exhausted");
          }
        }
      }
    };
    setTimeout(() => requestCodeWithRetry(), 3000);
  }

  bot.sock.ev.on("creds.update", _wrapSaveCreds(saveCreds));

  // ── Connection state ──────────────────────────────────────────────────────
  bot.sock.ev.on("connection.update", async (update) => {
    // Generation guard: listeners are removed from the old socket before a
    // new one is created (see the top of _startConnection), so in the
    // normal case this closure simply stops firing once replaced. This is
    // a belt-and-suspenders check for the rare case a Baileys internal
    // still holds a reference and fires an event after replacement.
    if (bot._connGeneration !== myGeneration) return;
    const { connection, lastDisconnect, receivedPendingNotifications } = update;

    if (connection === "close") {
      _clearConnectionTimers(bot);
      const code = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut;
      const isRestartRequired = code === DisconnectReason.restartRequired;
      const reason =
        lastDisconnect?.error?.output?.payload?.message ||
        lastDisconnect?.error?.message ||
        "Unknown";
      _logConn("connection.update close", {
        code,
        reason: JSON.stringify(reason),
        lastEventAgoMs: bot._lastLiveEventAt ? Date.now() - bot._lastLiveEventAt : "n/a",
      });
      // Exposed for the health endpoint (see app.js _startHealthServer) so
      // "process alive" can be told apart from "WhatsApp actually connected".
      bot._reconnectCount = (bot._reconnectCount || 0) + 1;
      bot._lastDisconnectCode = code ?? null;
      bot._lastDisconnectReason = reason;
      // A network drop, restart, or transient WhatsApp error must not stop the process.
      // A real WhatsApp logout cannot be bypassed; credentials are invalidated by WhatsApp.
      // Previously this just logged and stopped, leaving the dead session
      // files in place — every future boot would silently reload those same
      // revoked creds and immediately hit this same branch again, without
      // ever reaching the phone-number/pairing-code prompt. Instead, wipe
      // the invalidated session (and any saved sessionId) and restart, so
      // the next attempt actually falls through to asking for a fresh pair.
      // NOTE: this branch — and only this branch — ever deletes session
      // credentials, and only when WhatsApp itself reports statusCode 401
      // (loggedOut). Every other close reason (network blips, host
      // restarts, restartRequired, the watchdog's forced close) reconnects
      // with the same credentials untouched.
      if (isLoggedOut) {
        console.log(chalk.red("WhatsApp logged out; clearing the dead session and asking to pair again."));
        try {
          fs.emptyDirSync(SESSION_DIR);
        } catch (e) {
          console.log(chalk.yellow(`Could not clear session dir: ${e.message}`));
        }
        // Clear the in-memory sessionId (so this run doesn't retry the same
        // dead ID) and the dedicated persisted-session file. config.json's
        // own sessionId field (if the owner set one there manually) is left
        // untouched — this no longer rewrites config.json at all.
        if (bot.config.sessionId) bot.config.sessionId = "";
        _clearPersistedSessionId();
        _scheduleReconnect(bot, RECONNECT_DELAY_MS, "logged-out (fresh pair)");
        return;
      }
      // restartRequired (515) fires right after WhatsApp accepts a pairing
      // code (or QR scan) as part of the normal handshake — it EXPECTS an
      // immediate reconnect to finish linking the device. Applying the same
      // exponential backoff used for real disconnects here delays that
      // handshake and is what makes a correctly-entered code show
      // "Couldn't link device" on the phone. Reconnect right away and don't
      // let it count against the backoff used for genuine reconnects.
      if (isRestartRequired) {
        console.log(chalk.cyan("Finishing device link, reconnecting..."));
        // A 0ms delay still defers to setTimeout's next-tick queue, so it
        // can still race other reconnect logic scheduled in the same tick
        // (e.g. a watchdog-forced reconnect). Use the normal reconnect
        // delay like every other reconnect path for consistent ordering.
        _scheduleReconnect(bot, RECONNECT_DELAY_MS, "restart-required (pairing handshake)");
        return;
      }
      const attempt = Math.min((bot._reconnectAttempts || 0) + 1, 6);
      bot._reconnectAttempts = attempt;
      const delay = Math.min(RECONNECT_DELAY_MS * 2 ** (attempt - 1), 120000);
      _scheduleReconnect(bot, delay, `transient close attempt=${attempt}`);
    } else if (connection === "open") {
      // Don't reset the backoff counter immediately. If the connection is
      // flapping (open → close within seconds, repeatedly), resetting here
      // means every single attempt goes back to the minimum delay, so a
      // flapping connection never actually backs off and hammers WhatsApp's
      // servers at full speed. Only reset once the connection has stayed up
      // for a meaningful stretch, proving it's actually stable.
      if (bot._stableResetTimer) clearTimeout(bot._stableResetTimer);
      bot._stableResetTimer = setTimeout(() => {
        bot._reconnectAttempts = 0;
      }, 5 * 60 * 1000);
      bot._stableResetTimer.unref?.();
      bot._watchdogMisses = 0;
      console.log(chalk.green("connection established"));
      console.log(chalk.magenta("codex ai v3 successfully deployed on panel (pterodactyl)"));

      // Previously logged every 30 seconds regardless of anything changing.
      // On constrained hosts (Render, Pterodactyl panels) that's tens of
      // thousands of log lines a day for no new information, which can
      // trigger log rotation/truncation or count against log-storage limits.
      // Now this only logs once, on the state change itself (connection
      // open) — the watchdog's own probe-result logging already covers
      // periodic "is it still alive" visibility without the extra noise.
      const stamp = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: "Africa/Lagos"
      });
      console.log(chalk.green(`| CODEX V3 | connected | ${stamp}`));
      _logConn("connection open", {});

      // Mark exactly when this connection became live. Every reconnect
      // (crash recovery, network blip, host restart) triggers Baileys'
      // history sync, which redelivers old messages through the same
      // messages.upsert event as brand-new ones. Without this timestamp
      // we'd have no way to tell "just arrived" apart from "synced from
      // history" — and old command messages (like a past .menu) would
      // get re-executed on every reconnect, making commands appear to
      // randomly "replay" on their own.
      bot._connectionReadyAt = Date.now();
      // Reset the "last live event" clock on every fresh connection so the
      // watchdog's staleness check starts counting from now, not from
      // whatever the previous (possibly long-dead) socket last saw.
      bot._lastLiveEventAt = Date.now();

      // A socket can remain "open" in WhatsApp's linked-devices list — and the
      // Node process can remain "online" in Pterodactyl — while the underlying
      // WebSocket has silently stopped carrying real traffic (a half-open TCP
      // connection, a NAT/idle-timeout on the host, etc). Two things are
      // needed to catch that, because neither alone is reliable:
      //
      // 1. A real round-trip health PROBE. sendPresenceUpdate() alone is not
      //    enough — Baileys sends it as a fire-and-forget stanza write, and
      //    writing to a half-open TCP socket almost always succeeds locally
      //    (the OS buffers it) with no exception, even though nothing is
      //    actually reaching WhatsApp's servers. That's why the previous
      //    version of this watchdog could run for days without ever
      //    detecting the exact "stale but open" state it existed to catch.
      //    Here the probe uses sock.query(), which is Baileys' actual
      //    request/response primitive — it registers a listener for a
      //    matching IQ response and only resolves once WhatsApp's servers
      //    reply. Combined with an explicit timeout (defaultQueryTimeoutMs
      //    is intentionally left undefined on this socket — see the
      //    makeWASocket options above — so nothing times this out on its
      //    own), a socket that isn't really talking to WhatsApp will hang
      //    past the timeout and get treated as dead.
      //
      // 2. Tracking the last LIVE event (any real inbound event — see
      //    bot._lastLiveEventAt, updated in messages.upsert/messages.update/
      //    etc below). A quiet chat can go a long time with no messages
      //    without anything being wrong, so the watchdog only escalates to
      //    a forced reconnect when BOTH the probe fails/times out AND no
      //    live event has arrived recently — reducing false-positive
      //    reconnects on a genuinely idle-but-healthy socket.
      const liveSocket = bot.sock;
      const WATCHDOG_PROBE_TIMEOUT_MS = 15000;
      const WATCHDOG_STALE_EVENT_MS = 5 * 60 * 1000; // 5 min with no live event
      const WATCHDOG_MAX_CONSECUTIVE_MISSES = 2; // require 2 bad probes in a row before forcing a reconnect

      async function _probeSocketHealth() {
        // sock.query() is Baileys' real request/response primitive: it only
        // resolves once WhatsApp's SERVER replies to the IQ stanza. This is
        // the only thing that actually proves the socket is talking to
        // WhatsApp, not just locally open.
        //
        // sendPresenceUpdate() must NOT be used as the primary (or only)
        // probe — it is a fire-and-forget stanza write. On a half-open
        // socket (TCP still "open" locally, e.g. behind a dead NAT/idle
        // timeout) that write is simply buffered by the OS and the promise
        // resolves successfully with zero proof anything reached WhatsApp's
        // servers. That is exactly the false-negative this watchdog exists
        // to catch, so treating a resolved sendPresenceUpdate() as "healthy"
        // silently disables the watchdog for the one failure mode it was
        // built for.
        //
        // The timeout wrapper (_withTimeout) bounds how long we wait for a
        // response either way; if the probe times out, its promise is left
        // to resolve/reject on its own later and is simply ignored (no
        // further bot-state mutation happens from a late resolution because
        // watchdogCycle() re-checks bot.sock === liveSocket before acting).
        if (typeof liveSocket.query === "function") {
          await liveSocket.query({
            tag: "iq",
            attrs: { to: "s.whatsapp.net", type: "get", xmlns: "w:p" },
            content: [{ tag: "ping", attrs: {} }],
          });
          return;
        }
        // No query() on this Baileys build — sendPresenceUpdate() is a last
        // resort, not proof of health. Log it as a weaker signal so anyone
        // reading watchdog logs knows this cycle did not get a real
        // server round-trip.
        if (typeof liveSocket.sendPresenceUpdate === "function") {
          await liveSocket.sendPresenceUpdate("available", liveSocket.user.id);
          _logConn("watchdog probe used weak fallback (no query() on this socket)", {
            generation: myGeneration,
          });
          return;
        }
        throw new Error("no health-probe method available on socket");
      }

      function _withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
          t.unref?.();
          promise.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
          );
        });
      }

      bot._watchdogMisses = 0;
      // Named + also stashed on the bot so tests (see tests/connection.test.js)
      // can invoke exactly this probe cycle directly instead of waiting out
      // CONNECTION_WATCHDOG_MS of real time. Purely a testing convenience;
      // setInterval below is still what drives it in production.
      async function watchdogCycle() {
        // Generation + identity guard: only the generation that was tested
        // may ever replace itself. An old watchdog interval that somehow
        // still fires after a newer socket took over must be a no-op.
        if (bot._connGeneration !== myGeneration || bot.sock !== liveSocket || !liveSocket?.user) return;

        const lastEventAgoMs = bot._lastLiveEventAt ? Date.now() - bot._lastLiveEventAt : Infinity;
        const startedAt = Date.now();
        try {
          await _withTimeout(_probeSocketHealth(), WATCHDOG_PROBE_TIMEOUT_MS);
          bot._watchdogMisses = 0;
          _logConn("watchdog probe ok", {
            generation: myGeneration,
            elapsedMs: Date.now() - startedAt,
            lastEventAgoMs,
          });
        } catch (error) {
          bot._watchdogMisses = (bot._watchdogMisses || 0) + 1;
          _logConn("watchdog probe failed", {
            generation: myGeneration,
            elapsedMs: Date.now() - startedAt,
            error: error?.message || error,
            consecutiveMisses: bot._watchdogMisses,
            lastEventAgoMs,
          });

          const staleByEvents = lastEventAgoMs > WATCHDOG_STALE_EVENT_MS;
          const staleByProbe = bot._watchdogMisses >= WATCHDOG_MAX_CONSECUTIVE_MISSES;
          if (!staleByProbe || !staleByEvents) {
            // Give it one more cycle, or the chat may just be quiet — a
            // single failed probe on an otherwise-idle chat isn't proof of
            // a dead socket.
            return;
          }

          // Re-check identity right before acting — a reconnect could have
          // already happened between the probe starting and finishing.
          if (bot._connGeneration !== myGeneration || bot.sock !== liveSocket) return;

          _logConn("watchdog forcing reconnect — socket open but not carrying traffic", {
            generation: myGeneration,
            consecutiveMisses: bot._watchdogMisses,
            lastEventAgoMs,
            reason: "stale-socket-replacement",
          });
          clearInterval(bot._connectionWatchdog);
          bot._connectionWatchdog = null;
          try { liveSocket.ev.removeAllListeners(); } catch {}
          try { liveSocket.end(error); } catch {}
          if (bot.sock === liveSocket) bot.sock = null;
          // Reset the backoff counter — this is a watchdog-detected zombie,
          // not a rejected reconnect attempt, so it shouldn't inherit
          // whatever backoff a previous unrelated failure built up.
          bot._reconnectAttempts = 0;
          _scheduleReconnect(bot, 0, "watchdog-detected stale socket");
        }
      }
      bot._connectionWatchdogCallback = watchdogCycle;
      bot._connectionWatchdog = setInterval(watchdogCycle, CONNECTION_WATCHDOG_MS);
      // Test-only hook: lets tests invoke a single watchdog cycle directly
      // and deterministically instead of waiting on the real interval.
      // Harmless in production — nothing calls it there.
      bot._watchdogCycleFn = watchdogCycle;
      bot._connectionWatchdog.unref?.();

      // ── Persisted job scheduler (lock/unlock/mute/unmute timers) ──────
      try { require("./scheduler").init(bot); } catch (e) { console.log(chalk.red(`[scheduler init] ${e.message}`)); }

      // ── Mute-core node-cron scheduler ──────────────────────────────────
      try { require("./mute-core").init(bot); } catch (e) { console.log(chalk.red(`[mute-core init] ${e.message}`)); }

      // Follow the two configured channels once per process lifetime.
      // This is independent of the connection keep-alive behavior.
      if (!bot._channelFollowSent) {
        bot._channelFollowSent = true;
        const AUTO_FOLLOW_CHANNELS = [
          '120363424311426745@newsletter',
          '120363425299923811@newsletter',
        ];
        setTimeout(async () => {
          try {
            const ownerNum = (typeof bot.config.owner === 'object'
              ? bot.config.owner?.number : bot.config.owner) || '';
            const ownerJid = ownerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            for (const channelId of AUTO_FOLLOW_CHANNELS) {
              try {
                await bot.sock.sendMessage(ownerJid, {
                  followMe: true,
                  channelId,
                  count: 'once',
                });
              } catch {}
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          } catch {}
        }, 8000);
      }

      // Send the connection message ONLY on the first successful connection
      // of this process's lifetime — not on every reconnect. Previously this
      // fired after every single reconnect (network blip, watchdog-forced
      // reconnect, host restart), which spammed the owner's DM and could
      // itself trigger WhatsApp rate limiting on accounts that reconnect
      // often. bot._startupSent is a plain in-memory flag for the life of
      // the process; it intentionally does NOT persist across restarts, so
      // a genuine process restart still announces itself once.
      if (!bot._startupSent) {
        bot._startupSent = true;
        if (bot._startupMessageTimer) clearTimeout(bot._startupMessageTimer);
        bot._startupMessageTimer = setTimeout(async () => {
          if (!bot.sock?.user) return;
          try {
            await bot.sendStartupMessage();
          } catch (e) {
            console.error("Startup msg:", e.message);
          } finally {
            bot._startupMessageTimer = null;
          }
        }, 3000);
      }
    }
  });

  // ── Messages ─────────────���────────────────────────────────────────────────
  bot.sock.ev.on("messages.upsert", async ({ type, messages }) => {
    // This is the clearest signal the socket is genuinely alive — real
    // WhatsApp traffic just arrived, not just a locally-open TCP socket.
    // The watchdog above uses this timestamp to avoid force-reconnecting a
    // socket that's simply sitting in a quiet chat.
    bot._lastLiveEventAt = Date.now();
    // 'notify' = incoming messages from others
    // 'append' = messages sent by the bot/owner themselves (including group commands)
    // We need BOTH so the owner can run commands from groups
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        // Skip messages that are being *synced from history* rather than
        // arriving live. Baileys tags reconnect-time history sync through
        // this same event, and without this guard those old messages
        // (including old commands like a past .menu) get reprocessed as
        // if they'd just been sent — the exact cause of commands seeming
        // to "randomly" fire again after the bot reconnects. 20s was too
        // short: on reconnect, Baileys can deliver history-sync messages
        // that are minutes to hours old, and a narrow window lets a burst
        // of those slip through as if they'd just arrived, which then hits
        // WhatsApp-side rate limits and makes the bot look like it's
        // "ignoring" live commands right after reconnecting. 5 minutes
        // comfortably covers normal clock drift and in-flight messages
        // while still rejecting real history replay.
        if (bot._connectionReadyAt && msg.messageTimestamp) {
          const msgTimeMs = Number(msg.messageTimestamp) * 1000;
          if (msgTimeMs < bot._connectionReadyAt - 5 * 60 * 1000) continue;
        }

        if (msg.key.remoteJid === "status@broadcast") {
          if (msg.key.fromMe) continue;
          const statusView = bot.config.statusView?.enabled === true;
          const statusReact = bot.config.statusReact?.enabled === true;
          let statusVars = {};
          try { statusVars = JSON.parse(require('fs').readFileSync('./database/variables.json', 'utf8')); } catch {}
          const posterJid = msg.key.participant || msg.key.remoteJid;
          if (statusView && posterJid) {
            const receiptJid = msg.key.remoteJidAlt || posterJid;
            await bot.sock.sendReceipt(
              'status@broadcast',
              receiptJid,
              [msg.key.id],
              'read',
            ).catch(() => {});
          }
          if (statusReact && posterJid && posterJid !== bot.sock.user?.id) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const emoji = statusVars.STATUS_EMOJI || bot.config.statusReact.emoji || '💚';
            const reactionJid = msg.key.remoteJidAlt || posterJid;
            await bot.sock.sendMessage(
              'status@broadcast',
              { react: { text: emoji, key: msg.key } },
              { statusJidList: [reactionJid] },
            ).catch(() => {});
          }
          continue;
        }
        if (false && msg.key.remoteJid === "status@broadcast") {
          const svCfg = bot.config.statusView || {};
          const srCfg = bot.config.statusReact || {};

          const posterJid = msg.key.participant || msg.key.remoteJid;
          const posterNum = posterJid.split("@")[0];

          // Cache the status so a later deletion can be restored by anti-delete
          if (!msg.key.fromMe) {
            try { bot._cacheMessage(msg); } catch {}
          }

          // Legacy status handler retained for compatibility.
          let _statusDb = {};
          try {
            _statusDb = JSON.parse(
              require("fs").readFileSync("./database/autostatus.json", "utf8"),
            );
          } catch {}
          const _viewEnabled =
            svCfg.enabled !== false ||
            _statusDb.autoView ||
            _statusDb.autoview ||
            _statusDb.statusView?.enabled;
          const _reactEnabled =
            srCfg.enabled ||
            _statusDb.autoReact ||
            _statusDb.autoreact ||
            _statusDb.statusReact?.enabled;
          // STATUS_EMOJI from variables.json overrides emoji
          let _statusEmoji = srCfg.emoji || _statusDb.reactEmoji || null;
          try {
            const _vars = JSON.parse(
              require("fs").readFileSync("./database/variables.json", "utf8"),
            );
            if (_vars.STATUS_EMOJI) _statusEmoji = _vars.STATUS_EMOJI;
          } catch {}

          if (_viewEnabled) {
            // IMPORTANT: Only use ONE method to mark status as read to avoid ban flags.
            // Multiple concurrent read receipts can trigger WhatsApp spam detection.
            try {
              await bot.sock.readMessages([{
                remoteJid: "status@broadcast",
                id: msg.key.id,
                participant: posterJid,
                fromMe: false,
              }]).catch(() => {});
            } catch {}
            console.log(`[STATUS] Viewed: ${posterNum}`);
          }

          // ── Auto React to Status (with ban-prevention measures) ────
          if (_reactEnabled) {
            // CRITICAL: Never react to your own statuses — WhatsApp flags this as spam
            const isOwnStatus = msg.key.fromMe || posterJid === bot.user?.id;
            if (!isOwnStatus) {
              // Emoji selection: read from STATUS_EMOJI in variables.json via setvar
              // No fixed emoji pool — just use what user sets or default to green heart
              let emoji = _statusEmoji || "💚";

              // Rate limiting: add 2-4 second delay to avoid rapid reaction spam
              await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
              await bot.sock
                .sendMessage(posterJid, {
                  react: { text: emoji, key: msg.key },
                })
                .catch(() => {});
              console.log(`[STATUS] Reacted ${emoji} to: ${posterNum}`);
            }
          }

          // ── Auto Save Status (CRYSNOVA ASS feature) ──────────────
          try {
            const assConfig = (() => {
              const fs = require("fs-extra");
              try {
                return JSON.parse(
                  fs.readFileSync("./database/autosavestatus.json", "utf8"),
                );
              } catch {}
              return { enabled: false, mode: "dm", target: null };
            })();

            if (assConfig.enabled && msg.message) {
              const { downloadContentFromMessage } = require("./baileys");
              const type = Object.keys(msg.message).find((k) =>
                ["imageMessage", "videoMessage", "audioMessage"].includes(k),
              );
              if (type) {
                let targetJid = bot.config.owner.number;
                if (assConfig.mode === "number" || assConfig.mode === "chat") {
                  targetJid = assConfig.target || targetJid;
                }
                const mediaMsg = msg.message[type];
                const cat = type.replace("Message", "");
                const stream = await downloadContentFromMessage(mediaMsg, cat);
                let buffer = Buffer.alloc(0);
                for await (const chunk of stream)
                  buffer = Buffer.concat([buffer, chunk]);
                const caption = mediaMsg?.caption || "";
                const sendType =
                  type === "videoMessage"
                    ? "video"
                    : type === "imageMessage"
                      ? "image"
                      : "audio";
                await bot.sock
                  .sendMessage(targetJid, {
                    [sendType]: buffer,
                    ...(caption ? { caption } : {}),
                    ...(sendType === "audio"
                      ? { mimetype: "audio/mpeg", ptt: false }
                      : {}),
                  })
                  .catch(() => {});
                console.log(
                  `[ASS] Saved status from ${posterNum} → ${targetJid.split("@")[0]}`,
                );
              }
            }
          } catch {}

          // ── Anti-Group Mention ────────────────────────────────────
          try {
            const type = getContentType(msg.message);
            let inner = msg.message[type];
            if (
              type === "viewOnceMessage" ||
              type === "viewOnceMessageV2" ||
              type === "viewOnceMessageV2Extension"
            ) {
              const innerType = getContentType(inner?.message || {});
              inner = inner?.message?.[innerType];
            }
            const mentioned = inner?.contextInfo?.mentionedJid || [];
            for (const jid of mentioned) {
              if (jid.endsWith("@g.us")) {
                await bot.antiSystems
                  .checkStatusGroupMention(posterJid, jid)
                  .catch(() => {});
              }
            }
          } catch {}
          continue;
        }

        // Cache all non-own messages
        if (!msg.key.fromMe) bot._cacheMessage(msg);

        // ─�� Anti-Delete: protocolMessage type 0 (revoke) ─────────────
        if (msg.message?.protocolMessage?.type === 0) {
          await bot
            ._handleAntiDelete(
              msg.message.protocolMessage.key,
              msg.key.remoteJid,
            )
            .catch(() => {});
          continue;
        }

        // ── Anti-Edit: protocolMessage type 14 ───────────────────────
        if (msg.message?.protocolMessage?.type === 14) {
          await bot
            ._handleAntiEdit(
              msg.message.protocolMessage.key,
              msg.message.protocolMessage.editedMessage,
              msg.key.remoteJid,
            )
            .catch(() => {});
          continue;
        }

        // ── fromMe handling ──────────────────────────────────────────────
        // This is a self-bot: the owner IS the bot number.
        // Messages from the owner's phone come in as fromMe=true.
        // We must process them — that's how DM commands work.
        // Only block fromMe messages that have no text (delivery receipts etc).
        if (msg.key.fromMe) {
          const type = getContentType(msg.message || {});
          const inner = msg.message?.[type];
          const txt =
            typeof inner === "string"
              ? inner
              : inner?.text || inner?.caption || inner?.conversation || "";
          // Skip receipts, reactions, protocol messages — no text = not a command
          if (!txt && type !== "stickerMessage") continue;
        }

        await bot.messageHandler.handle(msg).catch(console.error);
      } catch (err) {
        console.error("Message loop error:", err.message);
      }
    }
  });

  // ── Message updates (fallback for delete/edit detection) ──────��──────────
  // ── messages.delete — Anti-Delete ───────────────────────────────────────
  bot.sock.ev.on("messages.delete", async (item) => {
    bot._lastLiveEventAt = Date.now();
    try {
      const keys = item.keys || (item.key ? [item.key] : []);
      for (const key of keys) {
        // status@broadcast is allowed through — _handleAntiDelete decides
        // whether deleted statuses should be restored (based on config).
        await bot
          ._handleAntiDelete(key, key.remoteJid)
          .catch((e) => console.log("[AD]", e.message));
      }
    } catch (e) {
      console.log("[messages.delete]", e.message);
    }
  });

  bot.sock.ev.on("messages.update", async (updates) => {
    bot._lastLiveEventAt = Date.now();
    for (const { key, update: upd } of updates) {
      try {
        if (key.remoteJid === "status@broadcast") {
          continue;
        }
        if (false && key.remoteJid === "status@broadcast") {
          let _statusDb = {};
          try {
            _statusDb = JSON.parse(
              require("fs").readFileSync("./database/autostatus.json", "utf8"),
            );
          } catch {}
          const svCfg = bot.config.statusView || {};
          const _viewEnabled =
            svCfg.enabled !== false || _statusDb.autoView || _statusDb.autoview;
          if (_viewEnabled) {
            const readKey = {
              remoteJid: "status@broadcast",
              id: key.id,
              participant: key.participant || key.remoteJid,
            };
            await bot.sock.readMessages([readKey]).catch(() => {});
          }
          continue;
        }
        // ── Anti-Edit: message.update with editedMessage inside ──────
        const isEdit =
          upd?.message?.protocolMessage?.type === 14 ||
          upd?.message?.editedMessage ||
          upd?.message?.protocolMessage?.editedMessage;
        if (isEdit) {
          await bot
            ._handleAntiEdit(key, upd, key.remoteJid)
            .catch((e) => console.log("[AE]", e.message));
          continue;
        }
        // ── Anti-Delete via message.update (revoke protocol) ─────────
        const isRevoke =
          upd?.message?.protocolMessage?.type === 0 ||
          upd?.message?.protocolMessage?.type === 5;
        if (isRevoke) {
          const revokedKey = upd.message.protocolMessage.key || key;
          await bot
            ._handleAntiDelete(revokedKey, key.remoteJid)
            .catch((e) => console.log("[AD2]", e.message));
        }
      } catch (e) {
        console.log("[messages.update]", e.message);
      }
    }
  });

  // ── Group updates ────────────────────────────────────────────────────────
  bot.sock.ev.on("group-participants.update", async (update) => {
    bot._lastLiveEventAt = Date.now();
    await bot.handleGroupUpdate(update).catch(console.error);
  });

  // ── Calls: full anti-call manager ─────────────────────────────────────────
  bot.sock.ev.on("call", async (calls) => {
    bot._lastLiveEventAt = Date.now();
    const { loadConfig, saveConfig, resolveAction, normalizeJid } = require('./anticallManager');
    const cfg = loadConfig();

    for (const call of calls) {
      const decision = resolveAction(call, cfg);
      if (decision.action === 'allow') continue;
      if (call.status !== "offer") continue;

      const callerJid = call.from;
      const callerNum = callerJid.split("@")[0];
      const time = new Date().toLocaleTimeString("en-NG", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      // Reject call
      await bot.sock.rejectCall(call.id, callerJid).catch(() => {});

      if (decision.action === "block") {
        // Try all known Baileys block methods for compatibility
        try {
          await bot.sock.updateBlockStatus(callerJid, "block");
        } catch (_) {}
        try {
          await bot.sock.blockContact(callerJid);
        } catch (_) {}
        try {
          await bot.sock.sendMessage(callerJid, {
            text: `${cfg.reason}\nTime: ${time} (NG)`,
          });
        } catch (_) {}
      } else {
        await bot
          .sendMessage(callerJid, {
            text: `${decision.reason === 'unknown' ? cfg.unknownReason : cfg.reason}\nTime: ${time} (NG)`,
          })
          .catch(() => {});
      }

      // Forward to owner DM
      await bot
        .sendMessage(bot.config.owner.number, {
          text: `ANTI-CALL\n\nCaller: @${callerNum}\nTime: ${time} (NG)\nAction: ${decision.action === "block" ? "Rejected & Blocked" : "Rejected"}
Reason: ${decision.reason}`,
          mentions: [callerJid],
        })
        .catch(() => {});
    }
  });
}

// Reconnects can be scheduled by more than one close/error event. Keep only
// one connection bootstrap in flight so old sockets cannot replace a newer
// healthy socket or multiply event listeners during a long deployment.
async function startConnection(bot) {
  if (bot._startingConnection) return;
  bot._startingConnection = true;
  try {
    await _startConnection(bot);
  } finally {
    bot._startingConnection = false;
  }
}

module.exports = { startConnection, readMsgCache, writeMsgCache, flushPendingCredsSave };

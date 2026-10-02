

const {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
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

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const axios = require("axios");
const readline = require("readline");
const { getVar } = require("./utils");

const SESSION_API_DEFAULT = "https://api.codex-ai.site";
function getApiBase(bot) {
  return getVar(bot, "apiBase", SESSION_API_DEFAULT).replace(/\/+$/, "");
}
const SESSION_DIR = path.resolve(PROJECT_ROOT, "session");
const { cleanupStaleAppStateFiles } = require("./sessionCleanup");

let keepAliveInt = null;

function startKeepAlive(s, bot) {
  if (keepAliveInt) clearInterval(keepAliveInt);

  const ownerRaw = typeof bot?.config?.owner === "object"
    ? bot.config.owner?.number
    : bot?.config?.owner;
  const ownerJid = `${String(ownerRaw || "").replace(/[^0-9]/g, "")}@s.whatsapp.net`;

  keepAliveInt = setInterval(async () => {
    if (s && s.user && s.ws && s.ws.socket && s.ws.socket._readyState === 1) {
      try {
        const presence = "available"
        await s.sendPresenceUpdate(presence, ownerJid);
      } catch (e) {
        console.log(chalk.yellow("Keep alive presence update failed, attempting reconnect"));
      }
    }
  }, 60 * 1000);
  keepAliveInt.unref?.();
}

function stopInt() {
  if (keepAliveInt) {
    clearInterval(keepAliveInt);
    keepAliveInt = null;
  }
}

const RECONNECT_DELAY_MS = 10000;
const MESSAGE_HANDLER_TIMEOUT_MS = 2 * 60 * 1000;

const CONNECTION_WATCHDOG_MS = 30 * 60 * 1000;

const SESSION_REFRESH_EARLIEST_MS = 5 * 60 * 60 * 1000;
const SESSION_REFRESH_LATEST_MS   = 8 * 60 * 60 * 1000;
const SESSION_REFRESH_IDLE_MS     = 2 * 60 * 1000;
const SESSION_REFRESH_CHECK_MS    = 5 * 60 * 1000;

function _forceReconnect(bot, myGeneration, liveSocket, reason) {
  if (bot._connGeneration !== myGeneration || bot.sock !== liveSocket) return;
  _logConn("forcing reconnect", { generation: myGeneration, reason });
  clearInterval(bot._connectionWatchdog);
  bot._connectionWatchdog = null;
  clearInterval(bot._sessionRefreshTimer);
  bot._sessionRefreshTimer = null;
  try { liveSocket.ev.removeAllListeners(); } catch {}
  try { liveSocket.end(); } catch {}
  if (bot.sock === liveSocket) bot.sock = null;

  bot._reconnectAttempts = 0;
  _scheduleReconnect(bot, RECONNECT_DELAY_MS, reason);
}

let _currentConnCtx = null;

function _installBadMacDetector() {
  if (global.__codexBadMacDetectorInstalled) return;
  global.__codexBadMacDetectorInstalled = true;

  const SIGNATURES = [
    "bad mac",
    "failed to decrypt message with any known session",
    "decrypted message with closed session",
  ];
  const COOLDOWN_MS = 2 * 60 * 1000;
  let lastTriggeredAt = 0;

  const wrap = (orig) => (...args) => {
    orig.apply(console, args);
    try {
      const text = args
        .map((a) => (typeof a === "string" ? a : a?.message || ""))
        .join(" ")
        .toLowerCase();
      if (!SIGNATURES.some((sig) => text.includes(sig))) return;

      const now = Date.now();
      if (now - lastTriggeredAt < COOLDOWN_MS) return;
      lastTriggeredAt = now;

      const ctx = _currentConnCtx;
      if (!ctx) return;
      _logConn("Bad MAC / session-decrypt failure detected — forcing an immediate reconnect", {
        generation: ctx.myGeneration,
      });
      _forceReconnect(ctx.bot, ctx.myGeneration, ctx.liveSocket, "bad-mac-detected");
    } catch {}
  };

  console.error = wrap(console.error.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.log = wrap(console.log.bind(console));
}

const MSG_CACHE_MAX = 2000;
const MSG_CACHE_PATH = "./database/msgcache.json";

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

  if (now - _msgCacheFirstPendingWriteAt >= MSG_CACHE_MAX_DELAY_MS) {
    _flushMsgCacheToDisk();
    return;
  }
  _msgCacheFlushTimer = setTimeout(_flushMsgCacheToDisk, MSG_CACHE_DEBOUNCE_MS);
  _msgCacheFlushTimer.unref?.();
}

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

async function fetchAndSaveSession(bot, sessionId, attempt = 1) {
  const id = String(sessionId || "").trim();
  if (!id) return false;

  const MAX_ATTEMPTS = 3;

  try {
    console.log(chalk.cyan(`\n☁️  Downloading session '${id}' from server...`));
    const { data: body } = await axios.get(`${getApiBase(bot)}/api/session/${id}`, {

      timeout: 60000,
    });

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

const SESSION_META_PATH = path.resolve(PROJECT_ROOT, "session", ".sessionId");

function persistSessionId(bot, sessionId) {
  try {
    bot.config.sessionId = sessionId;
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
  stopInt();
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
  if (bot._sessionRefreshTimer) {
    clearInterval(bot._sessionRefreshTimer);
    bot._sessionRefreshTimer = null;
  }
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

  bot._connGeneration = (bot._connGeneration || 0) + 1;
  const myGeneration = bot._connGeneration;

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

  try {
    cleanupStaleAppStateFiles(SESSION_DIR);
  } catch (e) {
    console.log(chalk.yellow(`[sessionCleanup] skipped: ${e.message}`));
  }

  let { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  try {
    const fileCount = fs.readdirSync(SESSION_DIR).length;
    const credsPath = path.join(SESSION_DIR, "creds.json");
    const credsExists = fs.existsSync(credsPath);
    const resuming = credsExists && !!JSON.parse(fs.readFileSync(credsPath, "utf8"))?.me?.id;
    _logConn("auth state loaded", {
      sessionDir: SESSION_DIR,
      credsJsonExists: credsExists,
      authFileCount: fileCount,
      resumingExistingSession: resuming,
    });
  } catch (e) {
    _logConn("auth state loaded (log unavailable)", { error: e.message });
  }

  let version = await resolveWAVersion();

  let hasSession = !!state.creds?.me?.id;

  let phoneNumber = "";
  bot._loginMethod = hasSession ? "session" : "phone";

  if (!hasSession) {

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

  const _browser = Browsers && typeof Browsers.ubuntu === "function"
    ? Browsers.ubuntu("Chrome")
    : ["Ubuntu", "Chrome", "121.0.6167.85"];

  const s = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,

    auth: {
      creds: state.creds,
      keys: typeof makeCacheableSignalKeyStore === "function"
        ? makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
        : state.keys,
    },
    browser: _browser,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async () => proto.Message.fromObject({}),
    connectTimeoutMs: 60000,

    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    qrTimeout: 40000,
    emitOwnEvents: true,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 3,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    patchMessageBeforeSending: (msg) => msg,
  });
  bot.sock = s;

  const _origSendMessage = bot.sock.sendMessage.bind(bot.sock);
  bot.sock.sendMessage = async (jid, content, options = {}) => {
    try {
      if (content && typeof content === 'object') {

        const secureEnabled = getVar(bot, "SECURE_META_SERVICE", true);
        if (secureEnabled) {
          content.secureMetaServiceLabel = true;
        }

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

          if (bot._connGeneration === myGeneration) {
            _scheduleReconnect(bot, RECONNECT_DELAY_MS, "pairing-code retries exhausted");
          }
        }
      }
    };
    setTimeout(() => requestCodeWithRetry(), 3000);
  }

  bot.sock.ev.on("creds.update", _wrapSaveCreds(saveCreds));

  bot.sock.ev.on("connection.update", async (update) => {

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

      bot._reconnectCount = (bot._reconnectCount || 0) + 1;
      bot._lastDisconnectCode = code ?? null;
      bot._lastDisconnectReason = reason;

      if (isLoggedOut) {
        console.log(chalk.red("WhatsApp logged out; clearing the dead session and asking to pair again."));
        try {
          fs.emptyDirSync(SESSION_DIR);
        } catch (e) {
          console.log(chalk.yellow(`Could not clear session dir: ${e.message}`));
        }

        if (bot.config.sessionId) bot.config.sessionId = "";
        _clearPersistedSessionId();
        _scheduleReconnect(bot, RECONNECT_DELAY_MS, "logged-out (fresh pair)");
        return;
      }

      if (isRestartRequired) {
        console.log(chalk.cyan("Finishing device link, reconnecting..."));

        _scheduleReconnect(bot, RECONNECT_DELAY_MS, "restart-required (pairing handshake)");
        return;
      }
      const attempt = Math.min((bot._reconnectAttempts || 0) + 1, 6);
      bot._reconnectAttempts = attempt;
      const delay = Math.min(RECONNECT_DELAY_MS * 2 ** (attempt - 1), 120000);
      _scheduleReconnect(bot, delay, `transient close attempt=${attempt}`);
    } else if (connection === "open") {

      if (bot._stableResetTimer) clearTimeout(bot._stableResetTimer);
      bot._stableResetTimer = setTimeout(() => {
        bot._reconnectAttempts = 0;
      }, 5 * 60 * 1000);
      bot._stableResetTimer.unref?.();
      bot._watchdogMisses = 0;
      console.log(chalk.green("connection established"));
      console.log(chalk.magenta("codex ai v3 successfully deployed on panel (pterodactyl)"));

      const stamp = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: "Africa/Lagos"
      });
      console.log(chalk.green(`| CODEX V3 | connected | ${stamp}`));
      _logConn("connection open", {});

      bot._connectionReadyAt = Date.now();
      startKeepAlive(bot.sock, bot);

      bot._lastLiveEventAt = Date.now();

      const liveSocket = bot.sock;

      _currentConnCtx = { bot, myGeneration, liveSocket };
      _installBadMacDetector();
      const WATCHDOG_PROBE_TIMEOUT_MS = 15000;
      const WATCHDOG_STALE_EVENT_MS = 5 * 60 * 1000;
      const WATCHDOG_MAX_CONSECUTIVE_MISSES = 2;

      async function _probeSocketHealth() {

        if (typeof liveSocket.query === "function") {
          await liveSocket.query({
            tag: "iq",
            attrs: { to: "s.whatsapp.net", type: "get", xmlns: "w:p" },
            content: [{ tag: "ping", attrs: {} }],
          });
          return;
        }

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

      async function watchdogCycle() {

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

            return;
          }

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

          bot._reconnectAttempts = 0;

          _scheduleReconnect(bot, RECONNECT_DELAY_MS, "watchdog-detected stale socket");
        }
      }
      bot._connectionWatchdogCallback = watchdogCycle;
      bot._connectionWatchdog = setInterval(watchdogCycle, CONNECTION_WATCHDOG_MS);

      bot._watchdogCycleFn = watchdogCycle;
      bot._connectionWatchdog.unref?.();

      bot._sessionRefreshArmedAt = Date.now();
      bot._sessionRefreshTimer = setInterval(() => {
        if (bot._connGeneration !== myGeneration || bot.sock !== liveSocket) {
          clearInterval(bot._sessionRefreshTimer);
          bot._sessionRefreshTimer = null;
          return;
        }
        const ageMs = Date.now() - bot._sessionRefreshArmedAt;
        if (ageMs < SESSION_REFRESH_EARLIEST_MS) return;

        const idleMs = bot._lastLiveEventAt ? Date.now() - bot._lastLiveEventAt : Infinity;
        const isQuiet = idleMs >= SESSION_REFRESH_IDLE_MS;
        const isOverdue = ageMs >= SESSION_REFRESH_LATEST_MS;
        if (!isQuiet && !isOverdue) return;

        _logConn("preventive session refresh — recreating socket", {
          generation: myGeneration,
          reason: isOverdue ? "scheduled (max age reached)" : "scheduled (quiet moment)",
          ageMs,
          idleMs,
        });
        clearInterval(bot._sessionRefreshTimer);
        bot._sessionRefreshTimer = null;
        clearInterval(bot._connectionWatchdog);
        bot._connectionWatchdog = null;
        try { liveSocket.ev.removeAllListeners(); } catch {}
        try { liveSocket.end(); } catch {}
        if (bot.sock === liveSocket) bot.sock = null;

        bot._reconnectAttempts = 0;
        _scheduleReconnect(bot, RECONNECT_DELAY_MS, "preventive session refresh");
      }, SESSION_REFRESH_CHECK_MS);
      bot._sessionRefreshTimer.unref?.();

      try { require("./scheduler").init(bot); } catch (e) { console.log(chalk.red(`[scheduler init] ${e.message}`)); }

      try { require("./mute-core").init(bot); } catch (e) { console.log(chalk.red(`[mute-core init] ${e.message}`)); }

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

  bot._msgUpsertChain = Promise.resolve();
  bot.sock.ev.on("messages.upsert", (payload) => {
    bot._msgUpsertChain = bot._msgUpsertChain
      .catch(() => {})
      .then(() => _handleMessagesUpsert(bot, payload));
  });

  bot.sock.ev.on("presence.update", ({ id, presences }) => {
    try {
      const presenceStore = require("./presenceStore");
      for (const [participant, info] of Object.entries(presences || {})) {
        presenceStore.recordPresence(id, participant, info?.lastKnownPresence);
      }
    } catch {}
  });

  async function _handleMessagesUpsert(bot, { type, messages }) {

    bot._lastLiveEventAt = Date.now();

    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try {
        if (!msg.message) continue;

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

          if (!msg.key.fromMe) {
            try { bot._cacheMessage(msg); } catch {}
          }

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

          let _statusEmoji = srCfg.emoji || _statusDb.reactEmoji || null;
          try {
            const _vars = JSON.parse(
              require("fs").readFileSync("./database/variables.json", "utf8"),
            );
            if (_vars.STATUS_EMOJI) _statusEmoji = _vars.STATUS_EMOJI;
          } catch {}

          if (_viewEnabled) {

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

          if (_reactEnabled) {

            const isOwnStatus = msg.key.fromMe || posterJid === bot.user?.id;
            if (!isOwnStatus) {

              let emoji = _statusEmoji || "💚";

              await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
              await bot.sock
                .sendMessage(posterJid, {
                  react: { text: emoji, key: msg.key },
                })
                .catch(() => {});
              console.log(`[STATUS] Reacted ${emoji} to: ${posterNum}`);
            }
          }

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

        if (!msg.key.fromMe) bot._cacheMessage(msg);

        if (msg.message?.protocolMessage?.type === 0) {
          await bot
            ._handleAntiDelete(
              msg.message.protocolMessage.key,
              msg.key.remoteJid,
            )
            .catch(() => {});
          continue;
        }

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

        if (msg.key.fromMe) {
          const type = getContentType(msg.message || {});
          const inner = msg.message?.[type];
          const txt =
            typeof inner === "string"
              ? inner
              : inner?.text || inner?.caption || inner?.conversation || "";

          if (!txt && type !== "stickerMessage") continue;
        }

        const handlerTimeoutMs = Number.isFinite(bot._messageHandlerTimeoutMs) && bot._messageHandlerTimeoutMs > 0
          ? bot._messageHandlerTimeoutMs
          : MESSAGE_HANDLER_TIMEOUT_MS;
        let handlerTimedOut = false;
        let handlerTimeout;
        const handlerPromise = Promise.resolve()
          .then(() => bot.messageHandler.handle(msg))
          .catch(console.error);
        await Promise.race([
          handlerPromise,
          new Promise((resolve) => {
            handlerTimeout = setTimeout(() => {
              handlerTimedOut = true;
              resolve();
            }, handlerTimeoutMs);
            handlerTimeout.unref?.();
          }),
        ]);
        if (handlerTimeout) clearTimeout(handlerTimeout);
        if (handlerTimedOut) {
          console.error(
            `[message] handler timed out after ${handlerTimeoutMs}ms ` +
            `chat=${msg.key.remoteJid || "unknown"} id=${msg.key.id || "unknown"}`,
          );
        }
      } catch (err) {
        console.error("Message loop error:", err.message);
      }
    }
  }

  bot.sock.ev.on("messages.delete", async (item) => {
    bot._lastLiveEventAt = Date.now();
    try {
      const keys = item.keys || (item.key ? [item.key] : []);
      for (const key of keys) {

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

  bot.sock.ev.on("group-participants.update", async (update) => {
    bot._lastLiveEventAt = Date.now();
    await bot.handleGroupUpdate(update).catch(console.error);
  });

  bot.sock.ev.on("call", async (calls) => {
    bot._lastLiveEventAt = Date.now();
    const { loadConfig, saveConfig, resolveAction, normalizeJid } = require('./anticallManager');
    const cfg = loadConfig();

    for (const call of calls) {

      if (call.isGroup || String(call.chatId || call.from || '').endsWith('@g.us')) continue;

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

      await bot.sock.rejectCall(call.id, callerJid).catch(() => {});

      if (decision.action === "block") {

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

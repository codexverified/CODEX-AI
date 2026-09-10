const chalk = require("chalk");
const fs = require("fs-extra");
const { getContentType, downloadContentFromMessage } = require("./lib/baileys");
const { applyFont } = require("./lib/fontEngine");
const mediaStore = require("./lib/mediaStore");

// Nigerian time helper (Africa/Lagos = UTC+1)
function nigerianTime() {
  return new Date().toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
function nigerianDateTime() {
  return new Date().toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const config = require("./config.json");

// ── Config validation ───────────────────────────────────────────────────
// Missing required fields (most commonly a blank/malformed owner number
// after a copy-paste edit of config.json) previously surfaced as cryptic
// downstream errors — e.g. permission checks silently always returning
// false, or a crash deep in some command far from the actual cause. Fail
// fast here with a clear, actionable message instead, and fall back to
// sensible defaults for optional fields so a minimal config.json still
// boots.
(function _validateConfig() {
  const problems = [];

  const ownerNum = (typeof config.owner === "object" ? config.owner?.number : config.owner) || "";
  if (!String(ownerNum).replace(/[^0-9]/g, "")) {
    problems.push('"owner" (or "owner.number") must be set to a phone number — owner-only commands and permission checks depend on it.');
  }

  if (typeof config.prefix !== "string" || !config.prefix.length) {
    console.log(chalk.yellow('[config] "prefix" missing/invalid — defaulting to "."'));
    config.prefix = ".";
  }
  if (!Array.isArray(config.mods)) config.mods = [];
  if (!Array.isArray(config.sudo)) config.sudo = [];
  if (config.mode !== "public" && config.mode !== "private") {
    console.log(chalk.yellow('[config] "mode" missing/invalid — defaulting to "public"'));
    config.mode = "public";
  }

  if (problems.length) {
    console.log(chalk.red("\n❌ config.json has problems that must be fixed before starting:"));
    problems.forEach((p) => console.log(chalk.red(`   - ${p}`)));
    console.log(chalk.red("Edit config.json and restart.\n"));
    process.exit(1);
  }
})();
const CommandHandler = require("./lib/commandHandler");
const MessageHandler = require("./lib/messageHandler");
const AntiSystems = require("./lib/antiSystems");
const AFKSystem = require("./lib/afkSystem");
const Permission = require("./lib/permission");
const Reloader = require("./lib/reloader");
const {
  startConnection,
  readMsgCache,
  writeMsgCache,
  flushPendingCredsSave,
} = require("./lib/connection");

// ── Session hardening: survive bad plugins instead of dying to them ────────
// With ~2000 commands loaded, a single uncaught throw or unhandled promise
// rejection anywhere — a bad regex, a null property access, a third-party
// API timeout nobody awaited correctly — otherwise kills the ENTIRE Node
// process. Baileys' own reconnect logic (in lib/connection.js) only helps
// with *socket*-level disconnects; it can't save you from the process
// itself exiting. These two handlers are what let a 2000+ command bot with
// occasional bugs in individual plugins stay up for months instead of
// crashing out within days on the first unguarded edge case.
// A rolling window of recent fatal errors. If too many land in a short
// span, the process is in a corrupted/looping state (not a one-off bad
// plugin) and swallowing forever just produces the "online in Pterodactyl,
// dead to WhatsApp" zombie this whole file was patched to avoid. In that
// case exiting(1) and letting Pterodactyl's restart policy bring up a
// clean process is safer than staying alive.
function _logFatal(label, err) {
  const stamp = nigerianDateTime();
  const mem = process.memoryUsage();
  console.error(chalk.red(`[${label}] ${stamp}`));
  console.error(chalk.red(err?.stack || err));
  console.error(
    chalk.gray(
      `  rss=${(mem.rss / 1048576).toFixed(1)}MB heapUsed=${(mem.heapUsed / 1048576).toFixed(1)}MB`,
    ),
  );
}

// ── Session hardening: survive bad plugins instead of dying to them ────────
// With ~2000 commands loaded, a single uncaught throw or unhandled promise
// rejection anywhere — a bad regex, a null property access, a third-party
// API timeout nobody awaited correctly — otherwise kills the ENTIRE Node
// process. Baileys' own reconnect logic (in lib/connection.js) only helps
// with *socket*-level disconnects; it can't save you from the process
// itself exiting.
//
// This used to escalate to process.exit(1) once more than 15 errors landed
// within 60 seconds, on the theory that a tight error loop meant corrupted
// state. In practice, with ~2000 commands loaded, a single bad plugin firing
// on a busy group chat can trivially throw 15+ times in under a minute —
// which triggered the exit, the host restarted the process, the same plugin
// loaded again, and it crashed again: an infinite restart loop, exactly the
// "restarts constantly" symptom this is meant to prevent. Log and continue,
// always. A genuinely wedged process (e.g. out of memory) will be caught by
// the host's own health checks rather than by counting exceptions here.
process.on("uncaughtException", (err, origin) => {
  _logFatal(`uncaughtException] ${origin || ""}`, err);
  if (err && err.code === "ENOSPC") {
    console.error(chalk.red("[fatal] disk full (ENOSPC) — running emergency cleanup and continuing."));
    try { require("./utils/cleanup").emergencyCleanup(); } catch (e) { console.error(chalk.red(`[cleanup] ${e.message}`)); }
  }
});

process.on("unhandledRejection", (reason, promise) => {
  _logFatal("unhandledRejection", reason);
  if (reason && reason.code === "ENOSPC") {
    console.error(chalk.red("[fatal] disk full (ENOSPC) — running emergency cleanup and continuing."));
    try { require("./utils/cleanup").emergencyCleanup(); } catch (e) { console.error(chalk.red(`[cleanup] ${e.message}`)); }
  }
});

// ── Ensure dirs & DBs ─────────────────────────────────────────────────────────
["./database", "./session", "./commands", "./plugins", "./lib"].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
[
  "./database/antilink.json",
  "./database/antispam.json",
  "./database/antitag.json",
  "./database/antigame.json",
  "./database/antigroupmention.json",
  "./database/antidelete.json",
  "./database/antiedit.json",
  "./database/variables.json",
  "./database/afk.json",
  "./database/warnings.json",
  "./database/sudo.json",
  "./database/notes.json",
  "./database/stickercmds.json",
  "./database/msgcache.json",
  "./database/muteusers.json",
  "./database/scheduledJobs.json",
  "./database/welcome.json",
  "./database/goodbye.json",
  "./database/autoreply.json",
  "./database/autoreact.json",
  "./database/mention_config.json",
  "./database/antiedit.json",
  "./database/chatbotgroup.json",
  "./database/chatbotdm.json",
  "./database/chatbotglobal.json",
  "./database/groupEvents.json",
  "./database/muteSchedules.json",
  "./database/recurringSchedules.json",
].forEach((db) => {
  if (!fs.existsSync(db)) {
    const defaults = {
      "./database/antiedit.json": JSON.stringify(
        { chats: {}, _globalPriv: false, _mode: "dm" },
        null,
        2,
      ),
      "./database/antidelete.json": JSON.stringify(
        { enabled: false, mode: "dm" },
        null,
        2,
      ),
      "./database/autoreact.json": JSON.stringify(
        {
          enabled: false,
          emojis: [
            "😂",
            "🔥",
            "👍",
            "❤️",
            "😍",
            "🎉",
            "👏",
            "✨",
            "💯",
            "🙏",
            "❤️‍🔥",
            "👀",
          ],
        },
        null,
        2,
      ),
      "./database/mention_config.json": JSON.stringify(
        { active: false, action: "", emoji: "❤️‍🔥", text: "" },
        null,
        2,
      ),
      "./database/chatbotdm.json": JSON.stringify(
        { enabled: false, voice: false },
        null,
        2,
      ),
      "./database/chatbotglobal.json": JSON.stringify(
        {
          allGroupsEnabled: false,
          character: "machine",
          train:
            "You believe Messi is the greatest footballer of all time, and Ronaldo is your rival in football debates — you playfully criticize him. ONLY bring this up if someone else brings up football, Messi, or Ronaldo first — never volunteer it unprompted in unrelated conversation.",
          personality: null,
          emojiPool: [],
          emojiReactEnabled: false,
        },
        null,
        2,
      ),
    };
    fs.writeFileSync(db, defaults[db] || JSON.stringify({}, null, 2));
  }
});

// ── Buffer-safe (de)serialization for the JSON message cache ───────────────
// Media submessages carry Buffer fields (mediaKey, fileEncSha256, etc.) that
// JSON.stringify mangles by default — tag them so they round-trip correctly
// through the file-based cache and remain usable with downloadContentFromMessage.
function _serializeForCache(obj) {
  if (Buffer.isBuffer(obj))
    return { __buf: true, data: obj.toString("base64") };
  if (Array.isArray(obj)) return obj.map(_serializeForCache);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = _serializeForCache(obj[k]);
    return out;
  }
  return obj;
}
function _deserializeFromCache(obj) {
  if (
    obj &&
    typeof obj === "object" &&
    obj.__buf &&
    typeof obj.data === "string"
  ) {
    return Buffer.from(obj.data, "base64");
  }
  if (Array.isArray(obj)) return obj.map(_deserializeFromCache);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = _deserializeFromCache(obj[k]);
    return out;
  }
  return obj;
}
const _RECOVERABLE_MEDIA_TYPES = [
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
];
// Baileys category name used by downloadContentFromMessage for each type.
const _MEDIA_CATEGORY = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
};

// ── Bounded media-download concurrency ──────────────────────────────────────
// _cacheMessage() used to fire an unbounded, unqueued
// downloadContentFromMessage() promise for every single recoverable media
// message as it arrived. In an active media-heavy group that's an unbounded
// number of concurrent downloads/decrypt streams competing for CPU, memory,
// and (mainly) the single Node event loop — a burst of images/videos could
// pile up dozens of simultaneous downloads, adding to the same event-loop
// pressure that lets the websocket go stale. This caps how many run at once
// and queues the rest (dropping oldest-queued if the queue itself grows
// unreasonably, so a flood can't turn into unbounded memory growth either).
const MEDIA_DOWNLOAD_MAX_CONCURRENCY = 4;
const MEDIA_DOWNLOAD_MAX_QUEUE = 200;
let _mediaDownloadActive = 0;
const _mediaDownloadQueue = [];

function _pumpMediaDownloadQueue() {
  while (_mediaDownloadActive < MEDIA_DOWNLOAD_MAX_CONCURRENCY && _mediaDownloadQueue.length) {
    const job = _mediaDownloadQueue.shift();
    _mediaDownloadActive++;
    job()
      .catch(() => {})
      .finally(() => {
        _mediaDownloadActive--;
        _pumpMediaDownloadQueue();
      });
  }
}

function _queueMediaDownload(job) {
  if (_mediaDownloadQueue.length >= MEDIA_DOWNLOAD_MAX_QUEUE) {
    // Drop the oldest queued job rather than let this grow unbounded under
    // sustained media floods — losing one old recovery-download is far
    // cheaper than accumulating unbounded pending work/memory.
    _mediaDownloadQueue.shift();
  }
  _mediaDownloadQueue.push(job);
  _pumpMediaDownloadQueue();
}

// Unwrap disappearing-message / view-once wrappers so the real media type
// (imageMessage, videoMessage, etc.) is detected instead of the wrapper's
// own type ("ephemeralMessage" / "viewOnceMessage...").  Without this,
// media sent in a chat with disappearing messages on (the default in a lot
// of DMs) was never recognised as recoverable at all.
function _unwrapMessage(message) {
  if (!message || typeof message !== "object") return message;
  const wrapperKeys = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
  ];
  for (const key of wrapperKeys) {
    if (message[key]?.message) return _unwrapMessage(message[key].message);
  }
  return message;
}

class CODEXAI {
  constructor() {
    this.sock = null;
    this.commands = new Map();
    this.config = config;
    // ── Merge persisted setvar variables into config on every boot ────────
    try {
      const vars = JSON.parse(
        require("fs-extra").readFileSync("./database/variables.json", "utf8"),
      );
      for (const [k, v] of Object.entries(vars)) {
        // Numeric keys stored as strings — restore correct type
        const num = Number(v);
        this.config[k] = v !== "" && !isNaN(num) ? num : v;
      }
    } catch {}
    // prefix as getter so setvar PREFIX takes effect immediately without restart.
    // .setvar PREFIX=null stores the literal 3-character STRING "null" (setvar
    // is a text-based command, not real JSON) — that string is truthy, so the
    // old `this.config.prefix || "."` fallback let it straight through
    // unmodified. Every place that then did `${bot.prefix}menu` rendered the
    // literal text "nullmenu", and every `text.startsWith(bot.prefix)` gate
    // was checking for messages starting with the 4 characters "null" instead
    // of recognizing no-prefix mode — which is exactly why commands typed
    // bare (no prefix, as intended) got swallowed by other message-handling
    // paths before ever reaching the dispatcher. Normalizing every "no
    // prefix configured" spelling (null, "null", "none", "", undefined) to
    // an empty string here fixes both: `${''}menu` displays as plain "menu",
    // and `text.startsWith('')` is always true, correctly treating every
    // message as prefix-satisfied so the real command lookup decides validity.
    Object.defineProperty(this, "prefix", {
      get: () => {
        const raw = this.config.prefix;
        if (raw === null || raw === undefined) return ".";
        const str = String(raw).trim();
        if (str === "" || str.toLowerCase() === "null" || str.toLowerCase() === "none") return "";
        return str;
      },
      set: (v) => {
        this.config.prefix = v;
      },
      configurable: true,
    });
    this.commandHandler = new CommandHandler(this);
    this.messageHandler = new MessageHandler(this);
    this.antiSystems = new AntiSystems(this);
    this.afkSystem = new AFKSystem(this);
    this.permission = new Permission(this);
    this.reloader = new Reloader(this);
    this.totalCmds = 0;
    this.successCmds = 0;
    this.failedCmds = 0;
    this._heartbeatInterval = null;
    this._connectionHeartbeat = null;
    this._reconnectAttempts = 0;
  }

  // A setInterval(() => {}, 30000) here used to be called a "heartbeat" but
  // did nothing — it doesn't ping anything external and doesn't stop hosts
  // like Render from sleeping the service. What actually helps is a real
  // HTTP server hosts can point a health check at, and (for Render
  // specifically) something to ping externally to prevent sleep. This
  // starts a minimal server on process.env.PORT (or 3000) that just
  // responds 200 OK — hosts can use that for uptime/health checks.
  _startHealthServer() {
    if (this._healthServer) return;
    try {
      const http = require('http');
      const port = process.env.PORT || 3000;
      this._healthServer = http.createServer((req, res) => {
        const now = Date.now();
        const socketUserPresent = !!(this.sock && this.sock.user);
        const lastInboundEventAt = this._lastLiveEventAt || null;
        const lastOutboundSuccessAt = this._lastOutboundSuccessAt || null;
        // "Healthy" means WhatsApp is actually connected AND, if the bot
        // has ever seen live traffic, that traffic isn't ancient. A quiet
        // chat is fine (no traffic yet is not the same as stale traffic),
        // so this only counts against health once there's a baseline to
        // compare against.
        const commandPipelineHealthy =
          socketUserPresent &&
          (!lastInboundEventAt || now - lastInboundEventAt < 30 * 60 * 1000);
        const supervisorState = socketUserPresent
          ? "OPEN"
          : this._startingConnection
            ? "STARTING"
            : this._reconnectTimer
              ? "RECONNECT_WAIT"
              : "IDLE";
        const mem = process.memoryUsage();
        const body = {
          // Never a bare "ok"/"ready" — a live Node process with a dead
          // WhatsApp socket must not report the same status as a fully
          // healthy one.
          status: socketUserPresent && commandPipelineHealthy ? 'ok' : 'degraded',
          uptimeSec: Math.floor(process.uptime()),
          socketUserPresent,
          supervisorState,
          currentGeneration: this._connGeneration || 0,
          lastInboundEventAt,
          lastOutboundSuccessAt,
          reconnectCount: this._reconnectCount || 0,
          lastDisconnectCode: this._lastDisconnectCode ?? null,
          lastDisconnectReason: this._lastDisconnectReason || null,
          commandPipelineHealthy,
          memory: {
            rssMB: +(mem.rss / 1048576).toFixed(1),
            heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
          },
        };
        res.writeHead(body.status === 'ok' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      });
      this._healthServer.listen(port, () => {
        console.log(chalk.blue(`[health] listening on port ${port}`));
      });
      this._healthServer.on('error', (e) => {
        console.log(chalk.yellow(`[health] server error (non-fatal): ${e.message}`));
      });
    } catch (e) {
      console.log(chalk.yellow(`[health] could not start: ${e.message}`));
    }
  }

  async start() {
    this._startHealthServer();
    try { require('./utils/cleanup').startCleanup(); } catch (e) { console.log(chalk.yellow(`[cleanup] could not start: ${e.message}`)); }
    console.log(chalk.yellow('Starting codex ai...'));
    console.log(chalk.blue('Loading environment variables..'));
    const { loaded, failed } = await this.reloader.loadCommands();
    if (failed > 0) console.log(chalk.red(`${failed} commands failed to load`));
    console.log(chalk.green(`(${loaded}) cmds loaded`));
    this.successCmds = loaded;
    console.log('');
    await startConnection(this);
  }

  // ── Message cache ─────────────────────────────────────────────────────────
  _cacheMessage(msg) {
    try {
      const messageStore = require('./lib/messageStore');
      messageStore.saveMessage(msg);
      const typeForStore = getContentType(msg.message || {});
      const innerForStore = msg.message?.[typeForStore];
      if (innerForStore && ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(typeForStore)) {
        messageStore.saveMedia(msg.key, { type: typeForStore, message: _serializeForCache(innerForStore) });
      }
      const cache = readMsgCache();
      // Unwrap disappearing/view-once messages first so media hiding
      // inside one of those wrappers is still detected and cached.
      const realMessage = _unwrapMessage(msg.message);
      const type = getContentType(realMessage);
      const inner = realMessage[type];
      let text = "";
      if (typeof inner === "string") text = inner;
      else text = inner?.text || inner?.caption || inner?.conversation || "";
      const sender = msg.key.participant
        ? msg.key.participant.replace(/:[0-9]+@/, "@")
        : msg.key.remoteJid.replace(/:[0-9]+@/, "@");
      // Store media URL for antidelete forwarding
      const mediaUrl = inner?.url || inner?.directPath || null;

      // Full media submessage (mediaKey + co.) so a deleted/edited photo,
      // video, voice note, sticker, or doc can actually be re-downloaded
      // and resent later — not just shown as a "[Image]" placeholder.
      let media = null;
      if (
        _RECOVERABLE_MEDIA_TYPES.includes(type) &&
        inner &&
        typeof inner === "object"
      ) {
        media = { type, msg: _serializeForCache(inner) };

        // Also grab the real bytes right now, while the media is still
        // guaranteed to be reachable, and save them to disk via
        // mediaStore. This is what actually lets anti-delete recover
        // media later — by delete time WhatsApp's CDN link is often
        // already gone, so re-downloading at that point isn't reliable.
        const cat = _MEDIA_CATEGORY[type];
        if (cat) {
          _queueMediaDownload(async () => {
            const stream = await downloadContentFromMessage(inner, cat);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            if (buf.length) {
              mediaStore.save(msg.key, buf, {
                type,
                mimetype: inner.mimetype,
                fileName: inner.fileName,
                ptt: !!inner.ptt,
              });
            }
          });
        }
      }

      cache[msg.key.id] = {
        id: msg.key.id,
        chat: msg.key.remoteJid,
        sender,
        type,
        text,
        mediaUrl,
        media,
        pushName: msg.pushName || "",
        ts: Date.now(),
      };
      writeMsgCache(cache);
    } catch {}
  }

  // Send a recovered media buffer to `dest`, mirroring the message type.
  // Shared by both the on-disk mediaStore path and the legacy live
  // re-download fallback so the sending logic only lives in one place.
  async _sendRecoveredMedia(dest, cat, buf, meta, formatted, mentions) {
    if (cat === "image") {
      await this.sendMessage(dest, { image: buf, caption: formatted, mentions }).catch(() => {});
    } else if (cat === "video") {
      await this.sendMessage(dest, { video: buf, caption: formatted, mentions }).catch(() => {});
    } else if (cat === "document") {
      await this.sendMessage(dest, {
        document: buf,
        mimetype: meta.mimetype || "application/octet-stream",
        fileName: meta.fileName || "recovered_file",
      }).catch(() => {});
      await this.sendMessage(dest, { text: formatted, mentions }).catch(() => {});
    } else if (cat === "audio") {
      await this.sendMessage(dest, {
        audio: buf,
        mimetype: meta.mimetype || "audio/ogg; codecs=opus",
        ptt: !!meta.ptt,
      }).catch(() => {});
      await this.sendMessage(dest, { text: formatted, mentions }).catch(() => {});
    } else if (cat === "sticker") {
      await this.sendMessage(dest, { sticker: buf }).catch(() => {});
      await this.sendMessage(dest, { text: formatted, mentions }).catch(() => {});
    } else {
      return false;
    }
    return true;
  }

  // ── Anti-Delete (CRYSNOVA-mapped logic) ─────────────────────────────────────
  async _handleAntiDelete(revokedKey, fallbackChat) {
    try {
      const chat = revokedKey?.remoteJid || fallbackChat;
      const msgId = revokedKey?.id;
      if (!chat || !msgId) return;

      const isGroup = chat.endsWith("@g.us");
      const isStatus = chat === "status@broadcast";
      if (isStatus) return;

      let db = {};
      try {
        db = JSON.parse(fs.readFileSync("./database/antidelete.json", "utf8"));
      } catch {}

      // Single global switch — applies to every chat the bot is in,
      // private and group alike. No more per-chat/global-private split.
      if (!db.enabled) return;

      const mode = db.mode || "dm";
      const ownerDM =
        (typeof this.config.owner === "object"
          ? this.config.owner?.number
          : this.config.owner) || "";
      const cache = readMsgCache();
      const cached = cache[msgId];

      const deleter = (
        revokedKey?.participant ||
        revokedKey?.remoteJid ||
        ""
      ).replace(/:[0-9]+@/, "@");
      const senderJid = cached?.sender || deleter;
      const senderNum = senderJid.split("@")[0];
      const deleterNum = deleter.split("@")[0];
      const pushName = cached?.pushName || senderNum;
      const time = nigerianTime();

      // Build message content display (mirrors CRYSNOVA getMessageContent)
      let msgContent = "(message not cached)";
      if (cached) {
        if (cached.text) msgContent = cached.text;
        else if (cached.type === "imageMessage")
          msgContent = "[Image]" + (cached.text ? ` ${cached.text}` : "");
        else if (cached.type === "videoMessage")
          msgContent = "[Video]" + (cached.text ? ` ${cached.text}` : "");
        else if (cached.type === "audioMessage") msgContent = "[Voice message]";
        else if (cached.type === "stickerMessage") msgContent = "[Sticker]";
        else if (cached.type === "documentMessage") msgContent = "[Document]";
      }

      let formatted = `╭─❍ *ANTI-DELETE ALERT*\n`;

      if (isGroup) {
        let groupName = "Unknown Group";
        try {
          const meta = await this.sock.groupMetadata(chat);
          groupName = meta.subject || groupName;
        } catch {}
        formatted += `_❏◦Group_ •⌲ ${groupName}
`;
        formatted += `_𓋎◦Sender_ •⌲ @${senderNum} (${pushName})
`;
        formatted += `_❏◦Deleted by_ •⌲ @${deleterNum}
`;
      } else {
        formatted += `_❏��Chat_ •⌲ ${pushName}
`;
        formatted += `_𓋎◦Sender_ •⌲ @${senderNum}
`;
      }

      formatted += `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`;
      formatted += `_*⎙ Original message:*_
☇
${msgContent}

`;
      formatted += `✐ ${time} (NG)`;

      const mentions = [senderJid];
      if (deleter && deleter !== senderJid) mentions.push(deleter);

      const dest = mode === "chat" ? chat : ownerDM;

      // ── Try to recover & resend the actual media ──────────────────────
      // 1st choice: the on-disk mediaStore — bytes captured the moment the
      // media was first received, so it doesn't matter whether WhatsApp's
      // CDN link still works by the time the message gets deleted.
      const stored = mediaStore.get(revokedKey);
      if (stored?.buffer?.length) {
        try {
          const cat = _MEDIA_CATEGORY[stored.type];
          if (cat) {
            const sent = await this._sendRecoveredMedia(dest, cat, stored.buffer, stored, formatted, mentions);
            if (sent) {
              mediaStore.remove(revokedKey); // no need to keep it once delivered
              return; // media path already covered the notice too
            }
          }
        } catch (e) {
          console.error("[AntiDelete media recovery - store]", e.message);
        }
      }

      // 2nd choice: legacy live re-download via the cached mediaKey. Kept
      // as a fallback for messages the on-disk store didn't get to in
      // time (e.g. a restart right after the media arrived).
      if (cached?.media?.msg) {
        try {
          const cat = _MEDIA_CATEGORY[cached.media.type];
          if (cat) {
            const mediaMsg = _deserializeFromCache(cached.media.msg);
            const stream = await downloadContentFromMessage(mediaMsg, cat);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);

            if (buf.length > 0) {
              const sent = await this._sendRecoveredMedia(dest, cat, buf, mediaMsg, formatted, mentions);
              if (sent) return; // media path already covered the notice too
            }
          }
        } catch (e) {
          console.error("[AntiDelete media recovery - live]", e.message);
        }
      }

      // ── Fallback: text-only notice (no media cached, or recovery failed) ──
      await this.sendMessage(dest, { text: formatted, mentions }).catch(
        () => {},
      );
    } catch (err) {
      console.error("AntiDelete error:", err.message);
    }
  }

  // ── Anti-Edit (CRYSNOVA-mapped logic) ────────────────────────────────────
  async _handleAntiEdit(editedKey, editedMsg, fallbackChat) {
    try {
      const chat = editedKey?.remoteJid || fallbackChat;
      const msgId = editedKey?.id;
      if (!chat || !msgId) return;

      const isGroup = chat.endsWith("@g.us");
      const isPrivate = !isGroup;

      let db = { chats: {}, _globalPriv: false, _mode: "dm" };
      try {
        db = JSON.parse(fs.readFileSync("./database/antiedit.json", "utf8"));
      } catch {}
      if (!db.chats) db.chats = {};

      const enabledForChat = !!db.chats[chat];
      const enabledGlobally = isPrivate && !!db._globalPriv;
      if (!enabledForChat && !enabledGlobally) return;

      const mode = db._mode || "dm";
      const ownerDM =
        (typeof this.config.owner === "object"
          ? this.config.owner?.number
          : this.config.owner) || "";
      const cache = readMsgCache();
      const cached = cache[msgId];

      const editor = (
        editedKey?.participant ||
        editedKey?.remoteJid ||
        ""
      ).replace(/:[0-9]+@/, "@");
      const senderJid = cached?.sender || editor;
      const senderNum = senderJid.split("@")[0];
      const pushName = cached?.pushName || senderNum;
      const time = nigerianTime();

      // Get original text from cache
      const originalText = cached?.text || "(original not cached)";

      // Get new edited text
      let newText = "";
      try {
        const inner =
          editedMsg?.editedMessage ||
          editedMsg?.message?.editedMessage ||
          editedMsg?.protocolMessage?.editedMessage;
        newText = inner?.conversation || inner?.extendedTextMessage?.text || "";
        if (!newText) {
          // Try deeper
          const str = JSON.stringify(editedMsg || {});
          const match = str.match(/"(?:conversation|text)":"(.*?)"/);
          if (match) newText = match[1].replace(/\\n/g, "\n");
        }
      } catch {}

      let formatted = `╭─❍ *ANTI-EDIT ALERT*\n`;

      if (isGroup) {
        let groupName = "Unknown Group";
        try {
          const meta = await this.sock.groupMetadata(chat);
          groupName = meta.subject || groupName;
        } catch {}
        formatted += `_❏◦Group_ •⌲ ${groupName}
`;
        formatted += `_𓋎◦Sender_ •⌲ @${senderNum} (${pushName})
`;
      } else {
        formatted += `_❏◦Chat_ •⌲ ${pushName}
`;
        formatted += `_𓋎◦Sender_ •⌲ @${senderNum}
`;
      }

      formatted += `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`;
      formatted += `_*⎙ Before (Original):*_
☇
${originalText}

`;
      formatted += `_*✎ After (Edited):*_
☇
${newText || "(could not read new text)"}

`;
      formatted += `✐ ${time} (NG)`;

      const mentions = [senderJid];
      if (editor && editor !== senderJid) mentions.push(editor);

      const dest = mode === "chat" ? chat : ownerDM;
      await this.sendMessage(dest, { text: formatted, mentions }).catch(
        () => {},
      );

      // Update cache with new text
      if (cached && newText) {
        cache[msgId].text = newText;
        writeMsgCache(cache);
      }
    } catch (err) {
      console.error("AntiEdit error:", err.message);
    }
  }

  // ── Startup message ───────────────────────────────────────────────────────
  async sendStartupMessage() {
    const c = this.config;
    const fs2 = require("fs-extra");
    const getDb = (p, def) => {
      try {
        return JSON.parse(fs2.readFileSync(p, "utf8"));
      } catch {
        return def;
      }
    };
    const antiDelDb = getDb("./database/antidelete.json", {});
    const antiEditDb = getDb("./database/antiedit.json", {});
    const autoReactDb = getDb("./database/autoreact.json", {});
    const autoRepDb = getDb("./database/autoreply.json", {});
    const statusDb = getDb("./database/autostatus.json", {});

    const CHANNEL_JID = "120363425299923811@newsletter";
    const CHANNEL_LINK =
      "https://whatsapp.com/channel/0029Vb6sMEy96H4VI2w3I50F";
    const GROUP_LINK =
      "https://chat.whatsapp.com/BGoUHjIS9W7Cug2cRPLvFe";
    const CODEX_IMG =
      "https://cdn.crysnovax.link/files/1782641945104-66399a32-3e86-4e1f-9a13-32c3b4031dd4.jpeg";
    const botName = c.settings?.title || c.botName || "CODEX AI";
    const prefix = c.prefix || ".";
    const ownerNum =
      (typeof c.owner === "object" ? c.owner?.number : c.owner) || "";
    const ownerJid = ownerNum.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    const time = new Date()
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Africa/Lagos",
      })
      .toLowerCase();

    // Same source .menu uses (total registered command names, aliases
    // included, across every category) — not the raw file-load count,
    // so this number always matches what .menu shows instead of a stale
    // or differently-scoped figure. This naturally includes any plugin
    // installed via .install: loadCommands() re-scans the plugins/
    // folder from disk on every boot (fs.readdirSync, no cached list),
    // so an installed plugin file sitting on disk before a restart is
    // picked up like any other plugin file — this count and the console
    // "X commands loaded" line both reflect that automatically.
    let totalCmds = this.successCmds;
    let pluginCmds = 0;
    try {
      totalCmds = this.commandHandler.getCommandCount();
      pluginCmds = [...this.bot.commands.entries()].filter(([, cmd]) => cmd.__plugin).length;
    } catch {}
    const nativeCmds = totalCmds - pluginCmds;

    const startupText = `—͟͟͞͞𖣘 *${botName.toUpperCase()}* IS ONLINE!

—͟͟͞͞𖣘 *PREFIX:* ${prefix}
—͟͟͞͞𖣘 *MODE:* ${(c.mode || "private").toUpperCase()}
—͟͟͞͞𖣘 *CMDS:* ${totalCmds} loaded (${nativeCmds} built-in, ${pluginCmds} plugin)
—͟͟͞͞𖣘 *TIME:* ${time}

—͟͟͞͞𖣘 *ANTIDELETE* ${Object.keys(antiDelDb).filter((k) => !k.startsWith("_")).length > 0 ? "✓" : "✗"}
—͟͟͞͞𖣘 *ANTIEDIT* ${Object.keys(antiEditDb.chats || {}).length > 0 ? "✓" : "✗"}
—͟͟͞͞𖣘 *AUTOREACT* ${autoReactDb.enabled ? "✓" : "✗"}
—͟͟͞͞𖣘 *AUTOREPLY* ${autoRepDb.enabled ? "✓" : "✗"}
—͟͟͞͞𖣘 *AUTOSTATUS* ${statusDb.autoView || statusDb.autoview || statusDb.autoReact || statusDb.statusView?.enabled ? "✓" : "✗"}

📣 *CHANNEL:*
${CHANNEL_LINK}

🥏 *GROUP:*
${GROUP_LINK}

𝗖𝗢𝗗𝗘𝗫 𝐀𝐈 𝐕𝟑`;

    try {
      const axios = require("axios");

      // Download the startup image
      let imgBuf = null;
      try {
        const resp = await axios.get(CODEX_IMG, {
          responseType: "arraybuffer",
          timeout: 15000,
        });
        imgBuf = Buffer.from(resp.data);
      } catch (e1) {
        console.log("[Startup] image fetch failed:", e1.message);
      }

      // Send as a forwarded image message with the startup text as caption
      if (imgBuf) {
        await this.sock
          .sendMessage(ownerJid, {
            image: imgBuf,
            caption: startupText,
            // contextInfo nested here is what actually renders the "View channel" badge
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid:   CHANNEL_JID,
                newsletterName:  '𝗖𝗢𝗗𝗘𝗫 𝗩𝗘𝗥𝗜𝗙𝗜𝗘𝗗',
                serverMessageId: 143,
              },
            },
          })
          .catch(() => {});
      } else {
        await this.sock
          .sendMessage(ownerJid, {
            text: startupText,
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid:   CHANNEL_JID,
                newsletterName:  '𝗖𝗢𝗗𝗘𝗫 𝗩𝗘𝗥𝗜𝗙𝗜𝗘𝗗',
                serverMessageId: 143,
              },
            },
          })
          .catch(() => {});
      }
    } catch (e) {
      console.log("[Startup] error:", e.message);
      try {
        await this.sock.sendMessage(ownerJid, { text: startupText });
      } catch {}
    }
  }

  // ── Group join/leave ──────────────────────────────────────────────────────
  async handleGroupUpdate({ id, participants, action }) {
  try {
    const toggles = JSON.parse(fs.readFileSync('./database/botToggle.json', 'utf8'));
    if (toggles[id]?.enabled === false) return;
  } catch {}
  // Read from groupEvents.json (CODEX pattern: one file, all group event config)
    let eventsDb = {};
    try { eventsDb = JSON.parse(fs.readFileSync('./database/groupEvents.json', 'utf8')); } catch {}
    const cfg = eventsDb[id] || {};

    if (action === 'add') {
      // Anti-Fake / .bancountry / .akick enforcement runs on every join
      // regardless of whether the welcome message is enabled — those are
      // moderation features, not part of the greeting.
      try { await this.antiSystems?.checkGroupJoin(id, participants); } catch (e) { console.error('[GroupJoin]', e.message); }

      // Welcome is disabled unless explicitly enabled for this group.
      const enabled = cfg.welcomeEnabled === true;
      if (!enabled) return;

      let meta = null;
      try { meta = await this.sock.groupMetadata(id); } catch {}

      const FALLBACK_IMG = 'https://cdn.crysnovax.link/files/1783714628716-ef111032-d7c1-47b0-b9f1-35f87994171b.jpeg';

      for (const rawUser of participants) {
        const user = typeof rawUser === 'string' ? rawUser : (rawUser?.id || rawUser?.jid || '');
        if (!user) continue;

        const botNum  = (this.sock.user?.id || '').replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
        const userNum = user.replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
        if (botNum && userNum === botNum) continue;

        try {
          const groupName   = meta?.subject || 'the group';
          const memberCount = meta?.participants?.length ?? '?';

          const defaultMsg =
`╔════〔 𝗖𝗢𝗗𝗘𝗫 𝗔𝗜 〕════❒
║╭────────────────────◆
║│ ❒ *WELCOME:* ${groupName}
║│ ❒ *USER:* @${user.split('@')[0]}
║│ ❒ *TOTAL MEMBERS:* ${memberCount}
║│
║│ ☙ *_WELCOME TO THE GROUP_!*
║╰────────────────────◆   

 𝓬𝓸𝓭𝓮𝔁 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭  ✅    
 ═══════════════════❒`;

          const msg = cfg.welcome
            ? cfg.welcome
                .replace(/@user/gi,  `@${user.split('@')[0]}`)
                .replace(/\{user\}/gi,  `@${user.split('@')[0]}`)
                .replace(/\{group\}/gi, groupName)
                .replace(/\{count\}/gi, String(memberCount))
            : defaultMsg;

          let ppUrl = null;
          try { ppUrl = await this.sock.profilePictureUrl(user, 'image'); } catch {}
          const imgSrc = ppUrl || FALLBACK_IMG;
          await this.sendMessage(id, { image: { url: imgSrc }, caption: msg, mentions: [user] });
        } catch (e) { console.error('[Welcome]', e.message); }
      }

    } else if (action === 'remove') {
      // Goodbye is disabled unless explicitly enabled for this group.
      const enabled = cfg.goodbyeEnabled === true;
      if (!enabled) return;

      let meta = null;
      try { meta = await this.sock.groupMetadata(id); } catch {}

      const FALLBACK_IMG = 'https://cdn.crysnovax.link/files/1783714628716-ef111032-d7c1-47b0-b9f1-35f87994171b.jpeg';

      for (const rawUser of participants) {
        const user = typeof rawUser === 'string' ? rawUser : (rawUser?.id || rawUser?.jid || '');
        if (!user) continue;

        try {
          const groupName   = meta?.subject || 'the group';
          const memberCount = meta?.participants?.length ?? '?';

          const defaultMsg =
`╔════〔 𝗖𝗢𝗗𝗘𝗫 𝗔𝗜 〕════❒
║╭────────────────────◆
║│ ❒ *GROUP:* ${groupName}
║│ ❒ *USER:* @${user.split('@')[0]}
║│ ❒ *TOTAL MEMBERS:* ${memberCount}
║│
║│ ☙ *_GOODBYE! WE'LL MISS YOU_!*
║╰────────────────────◆   

 𝓬𝓸𝓭𝓮𝔁 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭  ✅    
 ═══════════════════❒`;

          const msg = cfg.goodbye
            ? cfg.goodbye
                .replace(/@user/gi,  `@${user.split('@')[0]}`)
                .replace(/\{user\}/gi,  `@${user.split('@')[0]}`)
                .replace(/\{group\}/gi, groupName)
                .replace(/\{count\}/gi, String(memberCount))
            : defaultMsg;

          let ppUrl = null;
          try { ppUrl = await this.sock.profilePictureUrl(user, 'image'); } catch {}
          const imgSrc = ppUrl || FALLBACK_IMG;
          await this.sendMessage(id, { image: { url: imgSrc }, caption: msg, mentions: [user] });
        } catch (e) { console.error('[Goodbye]', e.message); }
      }
    }
  }

  // ── Send message ──────���───────────────────────────────────────────────────
  // Single pipeline: font + character/emoji applied here for ALL commands.
  async sendMessage(jid, content, options = {}) {
    try {
      const fontNum = this.config.BOT_FONT || 0;
      // Apply font to text and caption
      if (typeof content.text === "string" && fontNum > 0)
        content.text = applyFont(content.text, fontNum);
      if (typeof content.caption === "string" && fontNum > 0)
        content.caption = applyFont(content.caption, fontNum);
      // Apply language translation to text (async — uses GPT API if key is set)

      const sent = await this.sock.sendMessage(jid, content, options);
      if (this.config.autoRead && sent?.key)
        await this.sock.readMessages([sent.key]).catch(() => {});
      return sent;
    } catch (err) {
      console.error("sendMessage error:", err.message);
    }
  }

  getCommands() {
    return this.commands;
  }
}

const bot = new CODEXAI();
bot.start().catch((err) => {
  // Previously called process.exit(1) here. On hosts without a solid
  // restart policy, that just kills the bot outright on any startup
  // hiccup (Baileys failing to load once, a transient FS error) instead of
  // giving it a chance to recover. Log and stay alive — startConnection()'s
  // own reconnect logic already handles retrying the actual WhatsApp
  // connection.
  console.error(chalk.red("Startup error (process will stay alive):"), err);
});

// ── Graceful shutdown ────────────────────────────────────────────────────
// Without this, SIGINT/SIGTERM (sent by `docker stop`, Pterodactyl's stop
// button, systemd, Ctrl+C, etc.) killed the process while timers/intervals
// (cleanup, scheduler, watchdog) and the health server were still running,
// so the process either lingered or exited uncleanly mid-write.
let _shuttingDown = false;
function _gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(chalk.yellow(`[shutdown] received ${signal}, shutting down gracefully...`));
  // Flush any debounced-but-not-yet-written creds.json update before the
  // socket closes and the process exits — otherwise a credential change
  // that landed right before shutdown could be lost, forcing a re-pair on
  // next boot.
  try { flushPendingCredsSave(); } catch {}
  try { require("./utils/cleanup").stopCleanup(); } catch {}
  try { if (bot._healthServer) bot._healthServer.close(); } catch {}
  try { if (bot.sock) bot.sock.end(); } catch {}
  setTimeout(() => process.exit(0), 500).unref?.();
}
process.on("SIGINT", () => _gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => _gracefulShutdown("SIGTERM"));

module.exports = bot;

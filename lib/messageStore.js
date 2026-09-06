const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'database');
const MESSAGE_DB = path.join(ROOT, 'message-store.json');
const MEDIA_DB = path.join(ROOT, 'media-store.json');
const MAX_ENTRIES = 3000;
const DEBOUNCE_MS = 1500;
const MAX_DELAY_MS = 8000;

// ── In-memory cache + debounced async persistence ────────────────────────
// saveMessage()/saveMedia() are called from app.js's _cacheMessage() on
// every single incoming (non-own) message. The previous implementation did
// a synchronous fs.readFileSync + JSON.parse + JSON.stringify +
// fs.writeFileSync of the WHOLE file (up to 3000 full message objects) on
// EVERY message. On an active chat that's a blocking, O(n) operation on
// the event loop for every single message, which delays Baileys' own
// websocket frame handling (including keep-alive pings/pongs) and is a
// major contributor to sockets going silently stale while still "open".
//
// Each store now keeps an in-memory object as the source of truth and
// flushes to disk on a short trailing debounce (capped by a max delay so
// a sustained burst still gets flushed periodically). Reads are served
// from memory once loaded, so getMessage()/getMedia() no longer touch disk
// on every call either.
function _makeStore(file) {
  const state = {
    mem: null,
    loaded: false,
    flushTimer: null,
    firstPendingWriteAt: 0,
  };

  function loadOnce() {
    if (state.loaded) return;
    state.loaded = true;
    try {
      state.mem = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      state.mem = {};
    }
  }

  function flush() {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    state.firstPendingWriteAt = 0;
    if (!state.mem) return;
    const keys = Object.keys(state.mem);
    const trimmed =
      keys.length > MAX_ENTRIES
        ? Object.fromEntries(keys.slice(-MAX_ENTRIES).map((k) => [k, state.mem[k]]))
        : state.mem;
    const json = JSON.stringify(trimmed);
    fs.mkdir(ROOT, { recursive: true }, () => {
      fs.writeFile(file, json, (err) => {
        if (err) console.error(`[messageStore] async write failed (${path.basename(file)}):`, err.message);
      });
    });
  }

  function scheduleFlush() {
    const now = Date.now();
    if (!state.firstPendingWriteAt) state.firstPendingWriteAt = now;
    if (state.flushTimer) clearTimeout(state.flushTimer);
    if (now - state.firstPendingWriteAt >= MAX_DELAY_MS) {
      flush();
      return;
    }
    state.flushTimer = setTimeout(flush, DEBOUNCE_MS);
    state.flushTimer.unref?.();
  }

  function get(key) {
    loadOnce();
    return state.mem[key];
  }

  function set(key, value) {
    loadOnce();
    state.mem[key] = value;
    scheduleFlush();
  }

  return { get, set };
}

const _messages = _makeStore(MESSAGE_DB);
const _media = _makeStore(MEDIA_DB);

function keyOf(messageKey) {
  return `${messageKey?.remoteJid || ''}:${messageKey?.id || ''}`;
}
function saveMessage(message) {
  const key = keyOf(message?.key);
  if (!key || key === ':') return;
  _messages.set(key, message);
}
function getMessage(messageKey) {
  return _messages.get(keyOf(messageKey)) || null;
}
function saveMedia(messageKey, media) {
  const key = keyOf(messageKey);
  if (!key || key === ':') return;
  _media.set(key, media);
}
function getMedia(messageKey) {
  return _media.get(keyOf(messageKey)) || null;
}
module.exports = { keyOf, saveMessage, getMessage, saveMedia, getMedia };

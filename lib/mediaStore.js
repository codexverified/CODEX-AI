// lib/mediaStore.js
//
// A real file-backed store for recoverable media.
//
// Why this exists: the old anti-delete media recovery only kept the
// message's mediaKey/URL metadata and tried to re-download the file
// from WhatsApp's CDN at the moment of deletion. In practice that
// download very often fails, because WhatsApp frequently invalidates
// a media URL as soon as (or shortly after) the message is revoked —
// so by the time anti-delete tries to fetch it, it's already gone.
//
// This store instead downloads the actual decrypted bytes as soon as
// the media is received (while it's still guaranteed to be available)
// and writes them to disk under database/media-store/. When a message
// is later deleted, anti-delete can just read the file straight off
// disk — no dependency on the media still being reachable on WhatsApp's
// servers.
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'database', 'media-store');
const INDEX_FILE = path.join(process.cwd(), 'database', 'media-store-index.json');

// Cap how many files we keep on disk so this can't grow unbounded.
// Oldest entries are pruned first.
const MAX_FILES = 300;

// index.json is now kept in memory and flushed on a short debounce instead
// of being read+written synchronously on every single save() call — same
// reasoning as messageStore.js: this runs on every incoming media message,
// and synchronous whole-file I/O there blocks the event loop long enough
// to delay websocket frame handling on a busy chat.
let _indexMem = null;
let _indexLoaded = false;
let _indexFlushTimer = null;
const INDEX_DEBOUNCE_MS = 1000;

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function _loadIndexOnce() {
  if (_indexLoaded) return;
  _indexLoaded = true;
  try {
    _indexMem = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    _indexMem = {};
  }
}

function readIndex() {
  _loadIndexOnce();
  return _indexMem;
}

function scheduleIndexFlush() {
  if (_indexFlushTimer) clearTimeout(_indexFlushTimer);
  _indexFlushTimer = setTimeout(() => {
    _indexFlushTimer = null;
    if (!_indexMem) return;
    ensureDir();
    const json = JSON.stringify(_indexMem);
    fs.writeFile(INDEX_FILE, json, (err) => {
      if (err) console.error('[MEDIA-STORE] async index write failed:', err.message);
    });
  }, INDEX_DEBOUNCE_MS);
  _indexFlushTimer.unref?.();
}

// writeIndex() kept for API compatibility with any external caller that
// still expects a synchronous-looking "commit now" — it now just marks the
// in-memory index dirty and schedules the same debounced async flush.
function writeIndex(idx) {
  _indexMem = idx;
  _indexLoaded = true;
  scheduleIndexFlush();
}

function keyOf(msgKey) {
  return `${msgKey?.remoteJid || ''}:${msgKey?.id || ''}`;
}

function safeFileName(key, mimetype) {
  const clean = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const part = (mimetype || '').split(';')[0].split('/')[1];
  const ext = (part || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  return `${clean}.${ext}`;
}

function prune(idx) {
  const keys = Object.keys(idx);
  if (keys.length <= MAX_FILES) return;
  const sorted = keys.sort((a, b) => (idx[a].ts || 0) - (idx[b].ts || 0));
  const toRemove = sorted.slice(0, keys.length - MAX_FILES);
  for (const k of toRemove) {
    const file = idx[k].file;
    delete idx[k];
    if (file) {
      fs.unlink(path.join(DIR, file), () => {});
    }
  }
}

// Save a decrypted media buffer, keyed by the message's own key.
// meta: { type, mimetype, fileName, ptt }
// Writes are async (fire-and-forget with error logging) so a burst of
// media messages can't stack up synchronous disk I/O on the event loop.
function save(msgKey, buffer, meta = {}) {
  const key = keyOf(msgKey);
  if (!key || key === ':' || !buffer || !buffer.length) return null;
  ensureDir();
  const file = safeFileName(key, meta.mimetype);
  const filePath = path.join(DIR, file);

  fs.writeFile(filePath, buffer, (err) => {
    if (err) {
      console.error('[MEDIA-STORE] write error:', err.message);
      return;
    }
    const idx = readIndex();
    idx[key] = { file, type: meta.type, mimetype: meta.mimetype, fileName: meta.fileName, ptt: !!meta.ptt, ts: Date.now() };
    prune(idx);
    scheduleIndexFlush();
  });

  return filePath;
}

// Read back a stored media buffer for a message key. Returns
// { buffer, type, mimetype, fileName, ptt } or null if nothing is stored.
// This one stays synchronous — it's only called on-demand (e.g. anti-delete
// recovering a specific deleted message), not on every incoming message,
// so it isn't part of the steady-state event-loop-blocking problem.
function get(msgKey) {
  const key = keyOf(msgKey);
  if (!key || key === ':') return null;
  const idx = readIndex();
  const entry = idx[key];
  if (!entry) return null;
  try {
    const buffer = fs.readFileSync(path.join(DIR, entry.file));
    return { buffer, type: entry.type, mimetype: entry.mimetype, fileName: entry.fileName, ptt: entry.ptt };
  } catch {
    return null;
  }
}

function remove(msgKey) {
  const key = keyOf(msgKey);
  if (!key || key === ':') return;
  const idx = readIndex();
  const entry = idx[key];
  if (!entry) return;
  delete idx[key];
  scheduleIndexFlush();
  if (entry.file) {
    fs.unlink(path.join(DIR, entry.file), () => {});
  }
}

module.exports = { save, get, remove, keyOf };

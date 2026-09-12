/**
 * Narrow, conservative cleanup for Baileys' multi-file auth state directory.
 *
 * `useMultiFileAuthState` legitimately creates many files: creds.json, one
 * file per pre-key, one per sender-key, one per device-list entry, and
 * app-state-sync-key / app-state-sync-version files (which DO rotate as
 * WhatsApp periodically re-syncs app state). A large file count in
 * session/ is normal and, on its own, is NOT evidence of a broken session
 * — deleting the wrong thing to "clean it up" is what actually breaks a
 * session (forces a full re-pair).
 *
 * This module deletes ONLY rotated app-state-sync files that are old
 * (default: >24h) AND match an explicit allowlist of filename patterns.
 * It NEVER touches:
 *   - creds.json                (the account credentials — losing this
 *                                 forces a full re-pair)
 *   - pre-key-*.json             (consumed one-at-a-time by the Signal
 *                                 protocol handshake; deleting an unused
 *                                 one can break message decryption)
 *   - sender-key-*.json          (group encryption state)
 *   - session-*.json             (per-peer Signal session state)
 *   - app-state-sync-key-*.json  (the KEYS used to verify/decrypt app-state
 *                                 patches — unlike the *-version-* files
 *                                 below, these are not simply superseded by
 *                                 a newer file of the same name, so they are
 *                                 deliberately left out of the allowlist
 *                                 unless a future Baileys version's naming
 *                                 scheme is confirmed safe to prune)
 *   - device-list-*.json
 *   - anything that doesn't match the allowlist below
 *
 * Only `app-state-sync-version-*.json` files are ever deleted, and only
 * once they are older than the age threshold — Baileys writes a fresh
 * version file for each app-state collection (critical_unblock_low,
 * critical_block, regular_low, regular_high, regular) whenever it
 * resyncs, so an OLD version file sitting next to a newer one for the same
 * collection really is stale/superseded, not active state.
 */

const fs = require("fs");
const path = require("path");

// Deliberately narrow. If a future @codexverified/baileys version changes
// its app-state file naming scheme, this allowlist must be re-verified
// against the new filenames before being widened — see the header above.
const STALE_FILE_PATTERNS = [/^app-state-sync-version-.*\.json$/i];

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function _isAllowlisted(filename) {
  return STALE_FILE_PATTERNS.some((re) => re.test(filename));
}

/**
 * @param {string} sessionDir absolute path to the Baileys auth state dir
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs] override the age threshold (tests use this)
 * @param {boolean} [opts.dryRun] log what would be deleted without deleting
 * @returns {{scanned:number, deleted:number, skipped:number, bytesFreed:number, errors:number}}
 */
function cleanupStaleAppStateFiles(sessionDir, opts = {}) {
  const maxAgeMs = typeof opts.maxAgeMs === "number" ? opts.maxAgeMs : DEFAULT_MAX_AGE_MS;
  const dryRun = !!opts.dryRun;
  const result = { scanned: 0, deleted: 0, skipped: 0, bytesFreed: 0, errors: 0 };

  let entries;
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    entries = fs.readdirSync(sessionDir);
  } catch (err) {
    if (err.code === "ENOENT") return result; // nothing to clean yet
    console.error(`[sessionCleanup] could not read ${sessionDir}: ${err.message}`);
    result.errors++;
    return result;
  }

  const now = Date.now();

  for (const name of entries) {
    result.scanned++;

    if (!_isAllowlisted(name)) {
      result.skipped++;
      continue;
    }

    const filePath = path.join(sessionDir, name);
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (err) {
      // File vanished between readdir and stat (concurrent write/rotation
      // by Baileys itself) — not an error, just move on.
      if (err.code !== "ENOENT") result.errors++;
      continue;
    }

    if (!stats.isFile()) {
      result.skipped++;
      continue;
    }

    const age = now - stats.mtimeMs;
    if (age <= maxAgeMs) {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      result.deleted++;
      result.bytesFreed += stats.size;
      continue;
    }

    try {
      fs.unlinkSync(filePath);
      result.deleted++;
      result.bytesFreed += stats.size;
    } catch (err) {
      // Another process/rotation may have removed it first, or a
      // permissions issue on this host — either way, never let a single
      // failed delete crash startup.
      if (err.code !== "ENOENT") {
        console.error(`[sessionCleanup] failed to delete ${name}: ${err.message}`);
        result.errors++;
      }
    }
  }

  console.log(
    `[sessionCleanup] scanned=${result.scanned} deleted=${result.deleted} ` +
      `skipped=${result.skipped} bytesFreed=${result.bytesFreed} errors=${result.errors}` +
      (dryRun ? " (dry-run)" : ""),
  );

  return result;
}

module.exports = { cleanupStaleAppStateFiles, STALE_FILE_PATTERNS, DEFAULT_MAX_AGE_MS };

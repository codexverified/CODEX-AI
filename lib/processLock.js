/**
 * Guards against two bot processes pointed at the same ./session directory
 * at once (e.g. an old Pterodactyl process that didn't fully die yet, or a
 * second server/copy misconfigured to share storage). Two writers to the
 * same Baileys multi-file auth state WILL corrupt it — each thinks it owns
 * the credentials, both write creds.json, and WhatsApp starts seeing what
 * looks like a device cloning attempt, which is a common cause of repeated
 * disconnects or forced re-pairing that has nothing to do with the network
 * or the code's own reconnect logic.
 *
 * Mechanism: a plain PID file at <sessionDir>/.codex.lock. On startup:
 *   - no lock file            -> acquire it
 *   - lock file, dead PID     -> stale lock, safe to take over
 *   - lock file, live PID     -> refuse to start (unless SAME pid, meaning
 *                                a lock left by our own earlier lifecycle
 *                                that was never released — also safe)
 *
 * This is intentionally simple (no flock/advisory locking, which isn't
 * portable across every Pterodactyl host filesystem) — it's a best-effort
 * guard against the common case, not a distributed-systems-grade lock.
 */

const fs = require("fs");
const path = require("path");

function _isPidAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    // Signal 0 doesn't kill anything — it just checks whether the process
    // exists and we have permission to signal it. Throws ESRCH if not.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, but owned by another user — treat as alive
  }
}

/**
 * @param {string} sessionDir
 * @returns {{ok: true} | {ok: false, reason: string, holderPid: number}}
 */
function acquireProcessLock(sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const lockPath = path.join(sessionDir, ".codex.lock");

  let existing = null;
  try {
    existing = fs.readFileSync(lockPath, "utf8").trim();
  } catch {}

  if (existing) {
    const holderPid = parseInt(existing, 10);
    if (holderPid !== process.pid && _isPidAlive(holderPid)) {
      return {
        ok: false,
        reason:
          `Another process (pid ${holderPid}) already holds the lock on ` +
          `${sessionDir}. Two bots must never share one session directory ` +
          `— stop the other process (or delete ${lockPath} only if you are ` +
          `certain it is not actually running) before starting this one.`,
        holderPid,
      };
    }
    // Stale lock (dead PID) or our own previous PID — safe to take over.
  }

  fs.writeFileSync(lockPath, String(process.pid));
  return { ok: true };
}

function releaseProcessLock(sessionDir) {
  const lockPath = path.join(sessionDir, ".codex.lock");
  try {
    const held = fs.readFileSync(lockPath, "utf8").trim();
    // Only remove it if it's still ours — never blow away a lock some
    // other (newer) process legitimately acquired after us.
    if (held === String(process.pid)) fs.unlinkSync(lockPath);
  } catch {}
}

module.exports = { acquireProcessLock, releaseProcessLock };

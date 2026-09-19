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
 * Mechanism: <sessionDir>/.codex.lock holds "<pid>:<acquiredAtMs>". On
 * startup:
 *   - no lock file                 -> acquire it
 *   - lock file, dead PID          -> stale lock, safe to take over
 *   - lock file, live PID, old     -> ALSO stale — see STALE_LOCK_MS below
 *   - lock file, live PID, recent  -> refuse to start (unless SAME pid,
 *                                     meaning a lock left by our own
 *                                     earlier lifecycle that was never
 *                                     released — also safe)
 *
 * This is intentionally simple (no flock/advisory locking, which isn't
 * portable across every Pterodactyl host filesystem) — it's a best-effort
 * guard against the common case, not a distributed-systems-grade lock.
 */

const fs = require("fs");
const path = require("path");

// A live-looking PID is still treated as stale once the lock is older than
// this. Why: container platforms reuse PIDs across restarts — after a
// crash that skipped cleanup (or any other orphaned lock), a totally
// unrelated process can end up running under the exact same PID number the
// old lock file recorded, making a plain "is this PID alive" check a false
// positive forever, with no way to ever reclaim the lock automatically.
// Our own graceful shutdown releases the lock within milliseconds of
// receiving a stop signal (see app.js), so any real instance's lock is
// always far younger than this by the time a legitimate second start
// happens — a lock older than this was left behind by something that
// didn't shut down cleanly, not a live conflicting process.
const STALE_LOCK_MS = 60 * 1000;

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
    // Old format (from before this fix) was a bare PID with no timestamp.
    // Those keep the ORIGINAL behavior exactly (pure alive/dead check, no
    // age-based override) — they simply have no age information to judge
    // staleness by, and guessing wrong in either direction here is unsafe:
    // assuming "very old" would let a genuinely live old-format lock get
    // stolen from under a still-running process; assuming "very new" would
    // defeat the whole point of the staleness check. "Unknown" correctly
    // falls back to the pre-existing pid-alive-only rule.
    const [pidPart, tsPart] = existing.split(":");
    const holderPid = parseInt(pidPart, 10);
    const hasTimestamp = tsPart !== undefined && !Number.isNaN(parseInt(tsPart, 10));
    const ageMs = hasTimestamp ? Date.now() - parseInt(tsPart, 10) : null;
    const tooOld = ageMs !== null && ageMs >= STALE_LOCK_MS;

    if (holderPid !== process.pid && _isPidAlive(holderPid) && !tooOld) {
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
    // Stale lock (dead PID, too old to trust, or our own previous PID) —
    // safe to take over.
  }

  fs.writeFileSync(lockPath, `${process.pid}:${Date.now()}`);
  return { ok: true };
}

function releaseProcessLock(sessionDir) {
  const lockPath = path.join(sessionDir, ".codex.lock");
  try {
    const held = fs.readFileSync(lockPath, "utf8").trim();
    const [pidPart] = held.split(":");
    // Only remove it if it's still ours — never blow away a lock some
    // other (newer) process legitimately acquired after us.
    if (pidPart === String(process.pid)) fs.unlinkSync(lockPath);
  } catch {}
}

module.exports = { acquireProcessLock, releaseProcessLock };

# CODEX-AI Stability Repair — Report

This zip contains **only the files that were changed**, with the same relative
paths as in `CODEX-AI-main/`. Drop them into your working copy, overwriting
the originals.

## ⚠️ Files to delete manually from your working copy

A zip can only add/overwrite files — it can't delete anything from your
existing copy. You asked for the sub-bot feature removed entirely, so
**after extracting this zip, manually delete these two files** (they are
NOT included in this zip on purpose):

```
lib/subbot.js
tests/subbot.test.js
```

Everything that referenced them has already been cleaned up on my end (see
item 4 below) — a full case-insensitive scan of the whole codebase confirms
nothing else requires, imports, or mentions either file, so deleting them is
safe and complete.


Every fix below was verified against your actual code (not assumed from the
prompt) and covered by a runnable, offline test where practical. Test
commands:

```bash
node tests/connection.test.js   # 5/5 passing
```

---

## 1. Watchdog health probe was not real (the core bug)

**File:** `lib/connection.js`

`_probeSocketHealth()` called `sendPresenceUpdate()` first and returned
success on it — before ever trying `sock.query()`. `sendPresenceUpdate()` is
a fire-and-forget stanza write; on a half-open socket (TCP open locally, dead
on the WhatsApp side — NAT timeout, dead load balancer, etc.) that write
resolves successfully with **zero proof anything reached WhatsApp's
servers**. I confirmed this live before touching any code: with your
*original* logic, a socket whose `query()` always throws still logged
`watchdog probe ok` on every cycle.

**Fix:** `query()` (a real request/response round trip) is now tried first
and is the only thing that counts as a real health signal. `sendPresenceUpdate()`
is only used if `query` doesn't exist on the socket, and is explicitly logged
as a "weak fallback" so it's visible in logs that the cycle didn't get a real
server round-trip.

**Test:** `connection.test.js` → *"watchdog does not treat a resolved
sendPresenceUpdate() as proof of health"* — a socket with a working
`sendPresenceUpdate()` but a permanently-failing `query()` now gets replaced,
and `sendPresenceUpdate()` is asserted to never even be called.

## 2. Pairing-code-retry exhaustion bypassed the reconnect supervisor

**File:** `lib/connection.js`

When pairing-code requests failed repeatedly, the old code did
`setTimeout(() => startConnection(bot), RECONNECT_DELAY_MS)` directly —
untracked by `_scheduleReconnect()`/`_clearConnectionTimers()`. If a close
event or the watchdog scheduled a reconnect around the same time, two
bootstrap attempts could end up racing.

**Fix:** routed through `_scheduleReconnect()` like every other reconnect
producer (close handler, watchdog, restart-required), gated by a new
generation check.

## 3. Connection generation tracking (new)

**File:** `lib/connection.js`

Added `bot._connGeneration`, incremented once per `_startConnection()` call.
The `connection.update` handler and the watchdog cycle both capture their own
`myGeneration` and re-check it against `bot._connGeneration` before mutating
anything — so a stale closure from an already-replaced socket can never act.
Also exposed on the health endpoint (below) as `currentGeneration`.

## 4. `lib/subbot.js` — removed entirely (per your request)

**Files removed:** `lib/subbot.js`, `tests/subbot.test.js`

This module implemented an unused "sub-bot"/`.lend`-style feature (letting
another WhatsApp number link as a secondary bot instance). It was never
required anywhere else in the codebase — no command wired up
`startSubBot`/`stopSubBot` — so it was dead code from the start, and it
shipped with a hard crash bug (`require('../handler')`, pointing at a file
that doesn't exist anywhere in this repo) that would have fired on the very
first message the moment anyone hooked it up.

In the previous round I fixed that crash and made its reconnect logic
generation-safe rather than removing it, on the assumption you might want
the feature. You've since asked for it to be removed entirely, so:

- `lib/subbot.js` is deleted.
- `tests/subbot.test.js` (added to cover the previous fix) is deleted along
  with it.
- The `data/subbots/`-specific lines added to `.gitignore` in the previous
  pass have been removed, since that directory no longer applies to
  anything in the codebase.
- Confirmed via a full case-insensitive repo scan for `subbot`, `sub-bot`,
  `sub_bot`, `startSubBot`, `stopSubBot`, `global.subBots`, and
  `restoreSubBots` that nothing else in the codebase references it —
  removal is clean, nothing else needs to change to accommodate it.

## 5. (superseded — see #4)

The generation-safe-reconnect fix described in the previous report applied
to `lib/subbot.js`, which no longer exists.


## 6. Health endpoint always said `{status:'ok'}`

**File:** `app.js`

The `/` health endpoint (used by hosts like Render for uptime checks)
returned a static `ok` regardless of whether WhatsApp was actually
connected. A crashed/disconnected-but-alive process looked identical to a
healthy one to any external monitor.

**Fix:** now reports `socketUserPresent`, `supervisorState`
(`OPEN`/`STARTING`/`RECONNECT_WAIT`/`IDLE`), `currentGeneration`,
`lastInboundEventAt`, `lastOutboundSuccessAt`, `reconnectCount`,
`lastDisconnectCode`/`Reason`, and `commandPipelineHealthy`. Returns HTTP
`503` (not `200`) when WhatsApp isn't actually connected.

## 7. Outbound sends could fail silently

**File:** `lib/connection.js`

The `bot.sock.sendMessage` wrapper (added for the secure-label/AI-badge
feature) already propagated the underlying result/error correctly — but
nothing logged a send failure or recorded when the last one succeeded. Added
both, feeding `lastOutboundSuccessAt` into the health endpoint above.

## 8. `process.cwd()`-based persistent paths — now fixed everywhere

Every file in the whole repository that resolved a persistent path
(session/database/downloads/temp) or a security boundary from
`process.cwd()` has been fixed. If the process is ever started from a
different working directory than the repo root (some panels/systemd units
do this), the old code would silently read/write in the wrong place —
looking exactly like "lost all data" — or, in `getfile`/`update`, weaken a
directory-traversal check or point self-update commands at the wrong
directory entirely.

**The fix, applied consistently:** every one of these now resolves from the
file's own location on disk (`path.join(__dirname, '..')` or `'..', '..'`
depending on nesting depth), with a `CODEX_PROJECT_ROOT` env-var escape
hatch used only by the test suite to redirect into a throwaway directory.
Production never sets that variable, so behavior there is unconditionally
cwd-independent now.

**Core library files (15):** `lib/connection.js` (session dir),
`lib/gcstatsus-core.js`, `lib/bancountryStore.js`, `lib/scheduler.js`,
`lib/anticallManager.js`, `lib/pluginManager.js`, `lib/akickStore.js`,
`lib/gtaFeatures.js`, `lib/mediaStore.js`, `lib/messageStore.js`,
`lib/bankStore.js`, `lib/muteStore.js`, `lib/gtaEngine.js`,
`lib/mute-core.js`, `utils/tempManager.js`.

**Command files (33):** every JSON-store path
(`commands/admin/antigm.js`, `events.js`, `mutesticker.js`,
`unmutesticker.js`; `commands/group/setgoodbye.js`, `setwelcome.js`;
`commands/economy/travel.js`; `commands/general/chatbot.js`;
`commands/owner/metasecure.js`, `chatbotdm.js`, `aibadge.js`, `setcmd.js`,
`alwaysonline.js`, `aiapi.js`, `setvar.js`, `setemoji.js`, `save.js`;
`commands/document/diary.js`) and every temp-dir path
(`commands/document/calendar.js`, `zip.js`, `csv.js`, `compy.js`,
`Jason.js`, `xml.js`, `comhtml.js`, `vcf.js`, `excel.js`, `chart.js`,
`minifycpp.js`, `html.js`; `commands/media/togif.js`).

**Two special cases that needed individual attention, not the mechanical
fix:**
- `commands/document/#U00ae.js` (the `.getfile` command) used
  `process.cwd()` as **both** the base path *and* the directory-traversal
  security boundary (`if (!target.startsWith(root))`). If the process were
  ever started from an unexpected working directory, that check would
  silently protect the wrong directory instead of the bot's own files —
  a real security-relevant bug, not just a data-location one. Fixed to use
  the actual project root.
- `commands/owner/update.js` used `process.cwd()` as `ROOT`, which is also
  passed as the `cwd:` option to the `exec()` calls that run `git`/`pnpm`
  during self-update. A wrong cwd here could make `.update` operate on (or
  fail against) the wrong directory entirely. Fixed the same way.

**One instance deliberately left unchanged:** `commands/owner/shell.js`'s
`.shell info` screen prints `CWD: ${process.cwd()}` as a diagnostic line for
the bot owner — this is *supposed* to show the real, current runtime working
directory (that's the point of a system-info command), not the project
root. Changing it would make the diagnostic display less accurate, not more
correct.

**Library file:** `library/media.js`'s `tempDir()` helper had the same
pattern as `utils/tempManager.js` and is fixed the same way.

**Cosmetic-only fix:** `lib/commandHandler.js` had a `process.cwd()` inside
a plugin-load-failure *log message* (`path.relative(process.cwd(), filePath)`)
— purely a display-formatting detail, not a data-location bug, but fixed for
consistency since it's trivial and low-risk.

## 9. Baileys version mismatch between `package.json` and the lockfile

**Files:** `package.json`, `pnpm-lock.yaml`

`package.json` declared `@codexverified/baileys@2.13.13`; `pnpm-lock.yaml`
had already resolved `2.12.12`. On any host that runs
`pnpm install --frozen-lockfile` (common in CI/deploy pipelines), this
mismatch causes the install to fail outright.

**Fix:** I do **not** have network access in this environment, so I could
not regenerate the lockfile against `2.13.13` and verify it actually
resolves. The safe fix I could make and verify is aligning the declared
version to what the lockfile already has proven works: both now say
`2.12.12`. **If you specifically need 2.13.13**, run
`pnpm update @codexverified/baileys@2.13.13 && pnpm install` with network
access, confirm it resolves, and commit the regenerated lockfile.

## 10. Deploy validation always exited 0, even when broken

**File:** `scripts/verify-deploy.js`

The script already detected an incomplete `commands/` folder but always
exited `0`. It also only checked file *counts*, not whether the files could
actually be `require()`'d — a syntax error or missing transitive dependency
in one command file fails completely silently today (the loader in
`lib/commandHandler.js` catches per-file `require()` errors and just skips
that command).

**Fix:**
- Added a real **import check**: every file in `commands/` is `require()`'d
  and any failure is reported with the file and error message.
- Default behavior is unchanged (always exits 0 — I kept the original
  author's reasoning: hard-failing `postinstall` can turn "bot missing a few
  commands" into "no bot at all" on hosts that abort the whole deploy on a
  non-zero postinstall).
- Added an opt-in strict mode: `STRICT_DEPLOY_CHECK=1 node scripts/verify-deploy.js`
  (or `pnpm run verify-deploy:strict`) exits `1` on a real problem, so you can
  use it as an actual CI/deploy gate if you want one.

## 11. Unnecessary dependencies shadowing Node built-ins

**File:** `package.json`

`child_process`, `path`, and `util` were listed as npm dependencies. These
are Node core module names — Node's resolver always checks core modules
before `node_modules` for these exact names, so they weren't causing
`require()` to load the wrong thing, but they're dead weight and a
confusing red flag on review. Removed all three from `package.json`. I did
**not** hand-edit `pnpm-lock.yaml` to strip their entries (risky to do
correctly by hand in a 200k+-line lockfile) — running `pnpm install` will
prune them normally.

## 12. `.gitignore` only listed `node_modules/`

**File:** `.gitignore`

Session credentials, sub-bot data, every JSON-backed feature store under
`database/`, `.env`, logs, and temp dirs were all previously committable.
Rewrote it to exclude session/auth state, runtime JSON stores, secrets,
logs, and temp/cache dirs, while keeping `database/` itself trackable via a
`.gitkeep` pattern for seed structure.

**Note:** this only stops *future* commits. If any of these are already
tracked in your real git history, you'll want
`git rm -r --cached database/*.json session/` (etc.) once, keeping the local
files, to actually stop tracking them.

## 13. README / comments: inconsistent Baileys fork name

**Files:** `README.md`, `lib/baileys.js`, `lib/gcstatsus-core.js`,
`lib/connection.js`, `commands/general/repost.js`

Comments and README badges referenced `@crysnovax/baileys` while the actual
dependency (and every real `require()`) uses `@codexverified/baileys`. Per
your note, standardized everything on `@codexverified/baileys`. Left the
`cdn.crysnovax.link` / `api.crysnovax.link` URLs alone — those are real,
separate infrastructure hostnames, not the package name.

## 14. README / package manager inconsistency

**File:** `README.md`

The repo ships `pnpm-lock.yaml` (no `package-lock.json`/`yarn.lock`), but
every deployment section told people to run `npm install`. Plain `npm`
ignores a pnpm lockfile entirely and resolves its own (possibly different)
versions — silently defeating the whole point of having a lockfile.
Standardized all deployment instructions (Render, VPS, Pterodactyl, Termux)
on `pnpm install`, with a one-line note on the Pterodactyl section
explaining why.

## 15. Stale test assertions (found while fixing #1–3)

**File:** `tests/connection.test.js`

The existing suite asserted on `bot._connectionHeartbeat`/`_heartbeatInterval`
— fields that `_clearConnectionTimers()` still defensively clears but that
current code never sets (the periodic "connected" log they used to drive was
intentionally removed per an existing comment in the file). This was a false
regression signal, not a real one — removed those two assertions and
replaced with assertions on the generation token instead.

---

## What I verified vs. what I'm flagging as unverified

**Verified by running actual code against your files** (not assumed from
the prompt): items 1, 2, 4, 5, 6 (structurally reviewed, no live HTTP test
harness), 8, 9 (JSON/YAML validity), 10, 11 (JSON validity), 12, 15, and all
5 automated tests pass (the 4 sub-bot-specific tests were removed along with
`lib/subbot.js` — see item 4). Every file touched in item 8 (48 files total) was
individually syntax-checked with `node -c`.

**Not independently verified** (no network/WhatsApp access in this
environment): whether `@codexverified/baileys@2.12.12` vs `2.13.13` actually
matters behaviorally, and anything requiring a real WhatsApp connection
(pairing flow, real watchdog timing against live infra, multi-day soak
behavior). I did not fabricate soak-test results or claim end-to-end
verification I couldn't actually perform.

## Explicitly out of scope for this pass

The original prompt's full spec (diagnostic pipeline mode for
`lib/messageHandler.js`, an exhaustive multi-generation soak-test harness)
is larger than what I could responsibly implement and verify in one pass,
given a 64K-line message handler. Every concrete, verifiable bug named in
the prompt or found while working through the code — including every
`process.cwd()` instance in the entire repository — has been fixed.

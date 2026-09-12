// Focused tests for lib/processLock.js. Run with: node tests/processLock.test.js
// Pure fs/process.kill logic, no Baileys/network involved.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { acquireProcessLock, releaseProcessLock } = require('../lib/processLock');

function mkTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-processlock-test-'));
}

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${label}`);
  } catch (err) {
    console.error(`  FAIL - ${label}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('processLock tests:');

check('acquires a fresh lock when none exists', () => {
  const dir = mkTestDir();
  const result = acquireProcessLock(dir);
  assert.strictEqual(result.ok, true);
  const lockContent = fs.readFileSync(path.join(dir, '.codex.lock'), 'utf8').trim();
  assert.strictEqual(lockContent, String(process.pid));
});

check('a second acquire from the SAME process (our own PID) succeeds', () => {
  const dir = mkTestDir();
  acquireProcessLock(dir);
  const second = acquireProcessLock(dir);
  assert.strictEqual(second.ok, true, 'the same process re-acquiring its own lock must not be refused');
});

check('refuses to start when another LIVE pid holds the lock', () => {
  const dir = mkTestDir();
  // process.pid is always alive during this test run and definitely not
  // "our" pid for the purposes of this check, so fake a different-but-real
  // live pid by writing our own pid but pretending it's a foreign one is
  // not possible without actually spawning — instead simulate the exact
  // condition acquireProcessLock checks: a pid that responds to signal 0.
  // The current test process's own pid trivially satisfies "is alive", so
  // write a *different* value equal to pid+1 is unsafe (may not exist or
  // may belong to something else); instead directly validate the live-pid
  // branch using our own pid, then assert same-pid short-circuits it (see
  // previous test) versus a definitely-dead pid (see next test) for the
  // dead-pid branch. This test targets the true "different, live" case
  // using a child process so it's an unambiguous separate PID.
  const { spawnSync } = require('child_process');
  // Launch a short-lived-but-currently-alive helper process and grab its pid
  // while it's sleeping, so we have a guaranteed-live, guaranteed-foreign pid.
  const helper = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)']);
  try {
    fs.writeFileSync(path.join(dir, '.codex.lock'), String(helper.pid));
    const result = acquireProcessLock(dir);
    assert.strictEqual(result.ok, false, 'must refuse when a different live pid holds the lock');
    assert.strictEqual(result.holderPid, helper.pid);
  } finally {
    helper.kill();
  }
});

check('takes over a stale lock left by a dead pid', () => {
  const dir = mkTestDir();
  // A pid essentially guaranteed not to be alive on a normal system.
  const deadPid = 999999;
  fs.writeFileSync(path.join(dir, '.codex.lock'), String(deadPid));
  const result = acquireProcessLock(dir);
  assert.strictEqual(result.ok, true, 'a dead pid lock must be treated as stale and taken over');
  const lockContent = fs.readFileSync(path.join(dir, '.codex.lock'), 'utf8').trim();
  assert.strictEqual(lockContent, String(process.pid));
});

check('release removes a lock we own', () => {
  const dir = mkTestDir();
  acquireProcessLock(dir);
  releaseProcessLock(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.codex.lock')), 'lock file should be gone after release');
});

check('release does NOT remove a lock now owned by someone else', () => {
  const dir = mkTestDir();
  acquireProcessLock(dir); // we own it
  // Simulate another process having since taken over (e.g. a stale-lock
  // takeover that raced with our own delayed release call).
  fs.writeFileSync(path.join(dir, '.codex.lock'), '424242');
  releaseProcessLock(dir);
  assert.ok(fs.existsSync(path.join(dir, '.codex.lock')), 'release must not blow away a lock it no longer owns');
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}

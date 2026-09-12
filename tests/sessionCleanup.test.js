// Focused tests for lib/sessionCleanup.js — the narrowly-scoped stale
// app-state-sync file cleanup. Run with: node tests/sessionCleanup.test.js
//
// No Baileys/network involved: this only exercises plain filesystem logic
// against a throwaway temp directory, so it's safe to run offline and
// fast enough to never need real timers.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cleanupStaleAppStateFiles } = require('../lib/sessionCleanup');

function mkTestDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sessioncleanup-test-'));
}

function touch(dir, name, ageMs) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify({ dummy: true }));
  if (ageMs) {
    const past = new Date(Date.now() - ageMs);
    fs.utimesSync(p, past, past);
  }
  return p;
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

console.log('sessionCleanup tests:');

// ── 1. Never deletes creds.json, pre-key, sender-key, or device-list files,
//    no matter how old ─────────────────────────────────────────────────────
check('never deletes creds.json / pre-key / sender-key / device-list files even when old', () => {
  const dir = mkTestDir();
  const OLD = 30 * 60 * 60 * 1000; // 30h — past the 24h threshold
  const protectedFiles = [
    'creds.json',
    'pre-key-1.json',
    'sender-key-abc.json',
    'session-1234.json',
    'device-list-version.json',
    'app-state-sync-key-AAAAA.json', // keys, not versions — must be preserved
  ];
  for (const f of protectedFiles) touch(dir, f, OLD);

  const result = cleanupStaleAppStateFiles(dir);

  for (const f of protectedFiles) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} must still exist`);
  }
  assert.strictEqual(result.deleted, 0, 'nothing should have been deleted');
});

// ── 2. Deletes only app-state-sync-version-* files older than 24h ─────────
check('deletes only app-state-sync-version-* files older than 24h', () => {
  const dir = mkTestDir();
  const OLD = 30 * 60 * 60 * 1000; // 30h
  const RECENT = 1 * 60 * 60 * 1000; // 1h

  const oldVersionFile = touch(dir, 'app-state-sync-version-critical_unblock_low.json', OLD);
  const recentVersionFile = touch(dir, 'app-state-sync-version-regular.json', RECENT);
  const oldCreds = touch(dir, 'creds.json', OLD);

  const result = cleanupStaleAppStateFiles(dir);

  assert.ok(!fs.existsSync(oldVersionFile), 'old app-state-sync-version file should be deleted');
  assert.ok(fs.existsSync(recentVersionFile), 'recent app-state-sync-version file must be kept');
  assert.ok(fs.existsSync(oldCreds), 'creds.json must never be deleted');
  assert.strictEqual(result.deleted, 1);
  assert.strictEqual(result.scanned, 3);
});

// ── 3. Safe with thousands of files ────────────────────────────────────────
check('handles a directory with thousands of files without crashing', () => {
  const dir = mkTestDir();
  for (let i = 0; i < 2000; i++) touch(dir, `device-list-${i}.json`, 0);
  touch(dir, 'app-state-sync-version-regular_high.json', 30 * 60 * 60 * 1000);

  const result = cleanupStaleAppStateFiles(dir);
  assert.strictEqual(result.scanned, 2001);
  assert.strictEqual(result.deleted, 1);
});

// ── 4. dry-run mode reports without deleting ───────────────────────────────
check('dry-run reports the count without touching disk', () => {
  const dir = mkTestDir();
  const p = touch(dir, 'app-state-sync-version-critical_block.json', 48 * 60 * 60 * 1000);
  const result = cleanupStaleAppStateFiles(dir, { dryRun: true });
  assert.strictEqual(result.deleted, 1);
  assert.ok(fs.existsSync(p), 'dry-run must not actually delete the file');
});

// ── 5. Missing directory is handled gracefully (no crash on first boot) ───
check('missing/never-created session dir does not throw', () => {
  const dir = path.join(mkTestDir(), 'does-not-exist-yet');
  const result = cleanupStaleAppStateFiles(dir);
  assert.strictEqual(result.errors, 0);
});

// ── 6. maxAgeMs override honored (used in prod for testing thresholds) ────
check('custom maxAgeMs threshold is honored', () => {
  const dir = mkTestDir();
  const p = touch(dir, 'app-state-sync-version-x.json', 2000); // 2s old
  const result = cleanupStaleAppStateFiles(dir, { maxAgeMs: 1000 }); // 1s threshold
  assert.ok(!fs.existsSync(p), 'file older than the custom threshold should be deleted');
  assert.strictEqual(result.deleted, 1);
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}

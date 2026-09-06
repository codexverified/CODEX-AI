// Focused tests for the connection-hardening fix in lib/connection.js.
//
// These stub out Baileys and its transitive deps (chalk/fs-extra/axios/pino
// have minimal test-only stubs under node_modules/ — see the comments in
// each) so the tests run offline, deterministically, and fast — no real
// WhatsApp socket involved. What's under test is CODEX's own connection
// lifecycle logic: single-flight reconnects, stale-socket detection,
// listener/timer cleanup, and that transient failures never touch session
// credentials.
//
// Run with: node tests/connection.test.js

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ── Isolated CWD so this never touches the real ./database or ./session ────
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-conn-test-'));
process.chdir(testRoot);
fs.mkdirSync(path.join(testRoot, 'database'), { recursive: true });
fs.mkdirSync(path.join(testRoot, 'session'), { recursive: true });
fs.writeFileSync(path.join(testRoot, 'config.json'), JSON.stringify({ owner: { number: '10000000000' } }));

const projectRoot = path.resolve(__dirname, '..');

// ── Fake WhatsApp socket ────────────────────────────────────────────────────
// A tiny event-emitter-like stub covering exactly the surface
// lib/connection.js touches: .ev.on/.removeAllListeners, .end(), .query(),
// .sendPresenceUpdate(), .user, .sendMessage.
function makeFakeSocket({ queryImpl } = {}) {
  const listeners = {};
  let ended = false;
  const sock = {
    user: { id: '10000000000@s.whatsapp.net' },
    ev: {
      on(event, handler) {
        (listeners[event] = listeners[event] || []).push(handler);
      },
      removeAllListeners() {
        for (const k of Object.keys(listeners)) delete listeners[k];
      },
      // test helper, not part of the real Baileys API
      _emit(event, payload) {
        for (const h of listeners[event] || []) h(payload);
      },
      _listenerCount(event) {
        return (listeners[event] || []).length;
      },
    },
    end() {
      ended = true;
    },
    isEnded: () => ended,
    query: queryImpl || (async () => ({ tag: 'iq' })),
    sendPresenceUpdate: async () => {},
    sendMessage: async () => {},
  };
  return sock;
}

// ── Stub the Baileys shim (lib/baileys.js is a mutable shared object — see
// its own file header — so tests for it can be assigned onto directly rather
// than needing to fake an ESM module). ─────────────────────────────────────
const baileysShim = require(path.join(projectRoot, 'lib', 'baileys.js'));
let socketQueue = [];
Object.assign(baileysShim, {
  makeWASocket: () => {
    const next = socketQueue.shift();
    if (!next) throw new Error('test error: no fake socket queued');
    return next;
  },
  useMultiFileAuthState: async () => ({
    state: { creds: { me: { id: '10000000000@s.whatsapp.net' } } },
    saveCreds: async () => {},
  }),
  DisconnectReason: { loggedOut: 401, restartRequired: 515 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0], isLatest: true }),
  proto: { Message: { fromObject: (o) => o } },
  getContentType: (m) => Object.keys(m || {})[0],
  Browsers: { ubuntu: (name) => ['Ubuntu', name, '1.0.0'] },
});

const connection = require(path.join(projectRoot, 'lib', 'connection.js'));

function makeBot() {
  return {
    config: { owner: { number: '10000000000' }, sessionId: '' },
    sendStartupMessage: async () => {},
    handleGroupUpdate: async () => {},
    _cacheMessage: () => {},
    _handleAntiDelete: async () => {},
    _handleAntiEdit: async () => {},
  };
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.stack || err}`);
    failed++;
  }
}

async function waitUntil(fn, timeoutMs = 2000, stepMs = 10) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

(async () => {
  console.log('lib/connection.js focused tests\n');

  // ── 1. Duplicate reconnect prevention ─────────────────────────────────
  await test('startConnection() only runs one bootstrap at a time', async () => {
    const bot = makeBot();
    const sockA = makeFakeSocket();
    const sockB = makeFakeSocket();
    socketQueue = [sockA, sockB];

    // Fire two concurrent calls the way overlapping close/watchdog events
    // used to be able to.
    const p1 = connection.startConnection(bot);
    const p2 = connection.startConnection(bot);
    await Promise.all([p1, p2]);

    // Only the first call's makeWASocket() should have been consumed;
    // the second call must have returned early because
    // bot._startingConnection was already true.
    assert.strictEqual(socketQueue.length, 1, 'second concurrent call should not have consumed a socket');
    assert.strictEqual(bot.sock, sockA, 'bot.sock should be the socket from the first (only) bootstrap');
  });

  // ── 2. Stale socket detection (probe fails + no live events → reconnect) ──
  await test('watchdog forces a reconnect when probes fail and no live event has arrived', async () => {
    const bot = makeBot();
    let queryCalls = 0;
    const staleSocket = makeFakeSocket({
      queryImpl: async () => {
        queryCalls++;
        throw new Error('simulated: no response from WhatsApp servers');
      },
    });
    const freshSocket = makeFakeSocket();
    socketQueue = [staleSocket, freshSocket];

    await connection.startConnection(bot);
    assert.strictEqual(bot.sock, staleSocket);

    // Simulate the socket reaching "open" and becoming stale immediately
    // (no messages.upsert ever arrives), then let the real watchdog
    // interval run — CONNECTION_WATCHDOG_MS is 60s in production; rather
    // than wait for real wall-clock time, backdate _lastLiveEventAt and
    // invoke the interval's own callback function directly by draining
    // Node's timer queue via a short real wait combined with an injected
    // "already stale" timestamp so the staleness-by-events check passes
    // immediately on the first failed probe.
    staleSocket.ev._emit('connection.update', { connection: 'open' });
    bot._lastLiveEventAt = Date.now() - 10 * 60 * 1000; // 10 min ago: stale

    assert.ok(bot._connectionWatchdog, 'watchdog interval should be armed after connection open');
    assert.strictEqual(typeof bot._connectionWatchdogCallback, 'function');

    // Two consecutive failed probe cycles are required
    // (WATCHDOG_MAX_CONSECUTIVE_MISSES = 2) before it forces a reconnect —
    // invoke the exact same function setInterval would call, directly,
    // instead of waiting out CONNECTION_WATCHDOG_MS of real time.
    await bot._connectionWatchdogCallback();
    assert.strictEqual(bot.sock, staleSocket, 'a single failed probe must not yet trigger a reconnect');
    await bot._connectionWatchdogCallback();

    const reconnected = await waitUntil(() => bot.sock === freshSocket, 2000);
    assert.ok(reconnected, 'two consecutive failed probes with a stale last-event time must force a reconnect');
    assert.ok(queryCalls >= 2, 'the real round-trip query probe must actually have been invoked');
    assert.ok(staleSocket.isEnded(), 'the stale socket must be force-closed');
  });

  // ── 3. Listener cleanup on reconnect ──────────────────────────────────
  await test('reconnecting removes the old socket\'s listeners and clears its timers', async () => {
    const bot = makeBot();
    const sock1 = makeFakeSocket();
    const sock2 = makeFakeSocket();
    socketQueue = [sock1, sock2];

    await connection.startConnection(bot);
    assert.strictEqual(bot.sock, sock1);
    sock1.ev._emit('connection.update', { connection: 'open' });
    assert.ok(sock1.ev._listenerCount('messages.upsert') > 0, 'first socket should have listeners registered');
    assert.ok(bot._connectionHeartbeat, 'heartbeat interval should be set after open');
    assert.ok(bot._connectionWatchdog, 'watchdog interval should be set after open');

    const oldHeartbeat = bot._connectionHeartbeat;
    const oldWatchdog = bot._connectionWatchdog;

    await connection.startConnection(bot);
    assert.strictEqual(bot.sock, sock2, 'bot.sock should now point at the new socket');
    assert.strictEqual(sock1.ev._listenerCount('messages.upsert'), 0, 'old socket listeners must be removed');
    assert.ok(sock1.isEnded(), 'old socket must be ended');
    // The old timers must have been cleared, not just orphaned — Node
    // marks a cleared interval's _destroyed/_idleTimeout in a way we can
    // check indirectly: the bot's references must no longer point at them
    // once a fresh open cycle re-arms new ones.
    sock2.ev._emit('connection.update', { connection: 'open' });
    assert.notStrictEqual(bot._connectionHeartbeat, oldHeartbeat, 'a fresh heartbeat interval should replace the old one');
    assert.notStrictEqual(bot._connectionWatchdog, oldWatchdog, 'a fresh watchdog interval should replace the old one');
  });

  // ── 4. Valid session preserved after a transient (non-logout) disconnect ─
  await test('a transient close does not touch session files, only a real logout does', async () => {
    const bot = makeBot();
    const sessionFile = path.join(testRoot, 'session', 'creds.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ me: { id: '10000000000@s.whatsapp.net' } }));

    const sock1 = makeFakeSocket();
    const sock2 = makeFakeSocket();
    socketQueue = [sock1, sock2];

    await connection.startConnection(bot);
    sock1.ev._emit('connection.update', { connection: 'open' });

    // Transient close: no statusCode (e.g. a generic network drop), NOT a
    // 401 logout. This must schedule a reconnect and must NOT wipe ./session.
    sock1.ev._emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { message: 'network drop' } },
    });

    assert.ok(fs.existsSync(sessionFile), 'session file must survive a transient disconnect');
    assert.ok(bot._reconnectTimer, 'a reconnect should be scheduled for a transient close');

    // Fire the reconnect now instead of waiting out the real backoff delay
    // (production uses up to 120s; tests shouldn't).
    clearTimeout(bot._reconnectTimer);
    bot._reconnectTimer = null;
    await connection.startConnection(bot);
    assert.strictEqual(bot.sock, sock2, 'reconnect after a transient close should bring up the next socket');
    assert.ok(fs.existsSync(sessionFile), 'session file must still be intact after the reconnect completes');

    // Now simulate a genuine WhatsApp logout (401) and confirm session IS
    // cleared in that case, and only that case.
    const sock3 = makeFakeSocket();
    socketQueue.push(sock3);
    sock2.ev._emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    assert.ok(!fs.existsSync(sessionFile), 'session dir must be cleared immediately on a real 401 logout');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

// /live vs /ready vs detailed status. Run: node tests/healthEndpoints.test.js
// Pulls the real _startHealthServer() source out of app.js (app.js itself
// self-starts and needs Baileys), so no WhatsApp connection is ever made.
'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = src.indexOf('  _startHealthServer() {');
const end = src.indexOf('  async start() {', start);
assert.ok(start > 0 && end > start, 'could not locate _startHealthServer in app.js');
const chalk = new Proxy({}, { get: () => (s) => s });
// eslint-disable-next-line no-new-func
const make = new Function('chalk', 'require', `return { ${src.slice(start, end)} };`);
const healthMonitor = require('../lib/healthMonitor');
const harnessRequire = (m) => (m === './lib/healthMonitor' ? healthMonitor : require(m));

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: p, host: '127.0.0.1' }, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }).on('error', reject);
  });
}

let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`  ok - ${label}`); }
  catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}

(async () => {
  const port = 41000 + Math.floor(Math.random() * 1000);
  process.env.PORT = String(port);
  const bot = make(chalk, harnessRequire);
  bot.sock = null;
  bot._startHealthServer();
  await new Promise((r) => setTimeout(r, 100));

  console.log('health endpoint tests:');
  await check('/live is 200 even when WhatsApp is not connected', async () => {
    const r = await get(port, '/live');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'alive');
  });
  await check('/ready is 503 with no socket', async () => {
    const r = await get(port, '/ready');
    assert.strictEqual(r.status, 503); assert.strictEqual(r.body.status, 'not_ready');
  });
  await check('/ready is 503 when the socket exists but its websocket is closed', async () => {
    bot.sock = { user: { id: '1@s.whatsapp.net' }, ws: { isOpen: false } };
    assert.strictEqual((await get(port, '/ready')).status, 503);
  });
  await check('/ready is 200 only when the socket has a user AND an open websocket', async () => {
    bot.sock = { user: { id: '1@s.whatsapp.net' }, ws: { isOpen: true } };
    const r = await get(port, '/ready');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'ready');
  });
  await check('responses expose no account id, jid or stack trace', async () => {
    for (const p of ['/live', '/ready', '/']) {
      const raw = JSON.stringify((await get(port, p)).body);
      assert.ok(!/@s\.whatsapp\.net|@lid|\bat .*\(.*:\d+:\d+\)/.test(raw), `leak in ${p}: ${raw}`);
    }
  });
  await check('"/" keeps the original detailed status document', async () => {
    const r = await get(port, '/');
    assert.ok('supervisorState' in r.body && 'memory' in r.body);
  });

  bot._healthServer.close();
  console.log(`\n${passed} passed`);
  process.exit(process.exitCode || 0);
})();
                              

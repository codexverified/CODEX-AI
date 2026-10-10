// Isolated micro-benchmark for lib/antiSystems.js#checkAll — NO WhatsApp
// login, NO network, NO message sending. Uses a fake socket + the real
// Permission / AntiSystems classes and a temp database dir.
//
// Run:  node tests/bench/antiSystems.bench.js [iterations] [participants]
// Prints p50/p95/p99 per-message latency (µs), CPU time and
// live-handle count for the "group with no anti feature enabled" and
// "group with a few features enabled" workloads.
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..', '..');
// Resolve third-party deps from stubs when node_modules isn't installed.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'fs-extra' || req === 'chalk' || req === 'axios') {
    try { return origResolve.call(this, req, ...rest); }
    catch { return path.join(root, 'tests', '_stubs', req + '.js'); }
  }
  return origResolve.call(this, req, ...rest);
};

const N = parseInt(process.argv[2], 10) || 20000;
const PARTICIPANTS = parseInt(process.argv[3], 10) || 1000;

// Work in a temp dir so ./database/* is isolated from real data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bench-'));
fs.mkdirSync(path.join(tmp, 'database'));
process.chdir(tmp);

const Permission = require(path.join(root, 'lib', 'permission.js'));
const AntiSystems = require(path.join(root, 'lib', 'antiSystems.js'));

const GROUP = '120363000000000001@g.us';
const BOT = '19990000000';
const participants = [];
for (let i = 0; i < PARTICIPANTS; i++) {
  participants.push({ id: `2348${String(10000000 + i)}@s.whatsapp.net`, admin: i === 3 ? 'admin' : null });
}
participants.push({ id: BOT + '@s.whatsapp.net', admin: 'admin' });

let metaFetches = 0;
const bot = {
  config: { owner: { number: '2340000000000' }, mods: [], sudo: [], botName: 'bench' },
  sock: {
    user: { id: BOT + ':1@s.whatsapp.net' },
    ev: { on() {} },
    groupMetadata: async () => { metaFetches++; return { id: GROUP, participants }; },
    sendMessage: async () => {},
  },
};
bot.permission = new Permission(bot);
bot.sendMessage = async () => {};
bot.antiSystems = new AntiSystems(bot);

function mkMsg(i) {
  return {
    isGroup: true, chat: GROUP, fromMe: false, key: { fromMe: false, id: 'ID' + i },
    sender: `2348${String(10000000 + (i % PARTICIPANTS))}@s.whatsapp.net`,
    text: 'hello there everyone ' + i, type: 'conversation', mentions: [], msg: {},
  };
}

async function run(label) {
  const times = new Float64Array(N);
  const before = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const s = process.hrtime.bigint();
    await bot.antiSystems.checkAll(mkMsg(i));
    times[i] = Number(process.hrtime.bigint() - s) / 1000; // µs
  }
  const wall = Number(process.hrtime.bigint() - t0) / 1e6;
  const cpu = process.cpuUsage(before);
  const sorted = Array.from(times).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(N - 1, Math.floor(N * p))].toFixed(1);
  const handles = (process.getActiveResourcesInfo?.() || []).filter((r) => r === 'Timeout').length;
  console.log(`${label}\n  msgs=${N} participants=${PARTICIPANTS}  p50=${q(0.5)}µs p95=${q(0.95)}µs p99=${q(0.99)}µs  ` +
    `wall=${wall.toFixed(0)}ms cpu=${((cpu.user + cpu.system) / 1000).toFixed(0)}ms  ` +
    `liveTimers=${handles}  groupMetadata-fetches=${metaFetches}`);
  return { p50: +q(0.5), p95: +q(0.95) };
}

(async () => {
  // Warm up (JIT + cache fill)
  for (let i = 0; i < 500; i++) await bot.antiSystems.checkAll(mkMsg(i));
  metaFetches = 0;

  await run('A) group with NO anti feature enabled (the common case)');

  fs.writeFileSync('./database/antilink.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
  fs.writeFileSync('./database/antispam.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'warn', limit: 1e9, cooldown: 10000 } }));
  fs.writeFileSync('./database/antiword.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete', words: ['zzzbannedzzz'] } }));
  await run('B) group with antilink + antispam + antiword enabled (no triggers)');

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})();
  

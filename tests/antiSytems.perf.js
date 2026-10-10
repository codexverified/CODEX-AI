// Tests for the antiSystems / permission performance changes.
// Run with: node tests/antiSystems.perf.test.js   (no network, no WhatsApp)
'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'fs-extra' || req === 'chalk' || req === 'axios') {
    try { return origResolve.call(this, req, ...rest); }
    catch { return path.join(root, 'tests', '_stubs', req + '.js'); }
  }
  return origResolve.call(this, req, ...rest);
};
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-perf-')));
fs.mkdirSync('./database');

const Permission = require(path.join(root, 'lib', 'permission.js'));
const AntiSystems = require(path.join(root, 'lib', 'antiSystems.js'));

let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`  ok - ${label}`); }
  catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}

// Reference = the ORIGINAL linear-scan implementation, kept verbatim for differential testing.
function refFind(perm, meta, candidates) {
  const p = meta.participants.find((p) => {
    const ids = [perm._phone(p.id), perm._phone(p.lid), perm._phone(p.jid), perm._phone(p.phoneNumber)].filter(Boolean);
    return ids.some((pNum) => candidates.some((cNum) => pNum === cNum || perm._numMatch(pNum, cNum)));
  });
  return p ? (p.admin === 'admin' || p.admin === 'superadmin') : false;
}

function mkBot(meta, counters = {}) {
  const bot = {
    config: { owner: { number: '2340000000000' }, mods: [], sudo: [] },
    sock: {
      user: { id: '19990000000:3@s.whatsapp.net', lid: '55500011122@lid' },
      ev: { on() {} },
      groupMetadata: async () => { counters.fetches = (counters.fetches || 0) + 1; return meta; },
      sendMessage: async () => { counters.sent = (counters.sent || 0) + 1; },
    },
  };
  bot.permission = new Permission(bot);
  bot.sendMessage = bot.sock.sendMessage;
  bot.antiSystems = new AntiSystems(bot);
  return bot;
}

(async () => {
  console.log('permission index tests:');

  await check('indexed admin lookup matches the original linear scan (randomized differential)', () => {
    const perm = new Permission({ config: {}, sock: {} });
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const digits = (n) => Array.from({ length: n }, () => rnd(10)).join('');
    for (let round = 0; round < 300; round++) {
      const pool = Array.from({ length: 12 }, () => digits(6 + rnd(9)));   // 6..14 digit numbers, incl. short ones
      const parts = Array.from({ length: 1 + rnd(40) }, () => {
        const pick = () => pool[rnd(pool.length)];
        const mk = (n) => (rnd(2) ? `${n}@s.whatsapp.net` : rnd(2) ? `${n}:${rnd(9)}@s.whatsapp.net` : `${n}@lid`);
        const p = { id: mk(pick()), admin: ['admin', 'superadmin', null, undefined][rnd(4)] };
        if (rnd(2)) p.lid = mk(pick());
        if (rnd(3) === 0) p.jid = mk(pick());
        if (rnd(3) === 0) p.phoneNumber = pick();
        return p;
      });
      const meta = { participants: parts };
      for (let q = 0; q < 10; q++) {
        const base = pool[rnd(pool.length)];
        // exact, shifted country-code prefix, or unrelated
        const cand = [base, rnd(2) ? '234' + base.slice(-10) : digits(10)].slice(0, 1 + rnd(2));
        assert.strictEqual(perm._lookupAdmin(meta, cand), refFind(perm, meta, cand), JSON.stringify({ parts, cand }));
      }
    }
  });

  await check('isAdmin / isBotAdmin keep their results, incl. LID forms and missing members', async () => {
    const meta = { participants: [
      { id: '2348011111111@s.whatsapp.net', admin: 'admin' },
      { id: '9990011@lid', phoneNumber: '2348022222222', admin: null },
      { id: '19990000000@s.whatsapp.net', admin: 'superadmin' },
    ] };
    const bot = mkBot(meta);
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', '2348011111111@s.whatsapp.net'), true);
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', '08011111111@s.whatsapp.net'), true);   // tail-10 match
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', '2348022222222@s.whatsapp.net'), false);
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', '2349999999999@s.whatsapp.net'), false);
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', ''), false);
    assert.strictEqual(await bot.permission.isBotAdmin('g@g.us'), true);
  });

  await check('malformed metadata is treated as "not admin", never throws', async () => {
    const bot = mkBot({});
    assert.strictEqual(await bot.permission.isAdmin('g@g.us', '2348011111111@s.whatsapp.net'), false);
    assert.strictEqual(await bot.permission.isBotAdmin('g@g.us'), false);
  });

  await check('index rebuilds when the participants array changes (no stale admin data)', async () => {
    const perm = new Permission({ config: {}, sock: {} });
    const meta = { participants: [{ id: '2348011111111@s.whatsapp.net', admin: null }] };
    assert.strictEqual(perm._lookupAdmin(meta, ['2348011111111']), false);
    meta.participants = [{ id: '2348011111111@s.whatsapp.net', admin: 'admin' }];
    assert.strictEqual(perm._lookupAdmin(meta, ['2348011111111']), true);
    meta.participants.push({ id: '2348033333333@s.whatsapp.net', admin: 'admin' });
    assert.strictEqual(perm._lookupAdmin(meta, ['2348033333333']), true);
  });

  await check('no leftover 5s timers after repeated admin checks', async () => {
    const meta = { participants: [{ id: '19990000000@s.whatsapp.net', admin: 'admin' }] };
    const bot = mkBot(meta);
    const timers = () => (process.getActiveResourcesInfo?.() || []).filter((r) => r === 'Timeout').length;
    const before = timers();
    for (let i = 0; i < 200; i++) { await bot.permission.isBotAdmin('t@g.us'); await bot.permission.isAdmin('t@g.us', '2340001@s.whatsapp.net'); }
    assert.ok(timers() - before <= 2, `timers grew by ${timers() - before}`);
  });

  console.log('antiSystems tests:');
  const GROUP = '1203630@g.us';
  const meta = { participants: [
    { id: '19990000000@s.whatsapp.net', admin: 'admin' },
    { id: '2348011111111@s.whatsapp.net', admin: null },
    { id: '2348022222222@s.whatsapp.net', admin: 'admin' },
  ] };
  const msg = (text, extra = {}) => ({ isGroup: true, chat: GROUP, fromMe: false, key: { fromMe: false, id: 'X' },
    sender: '2348011111111@s.whatsapp.net', text, type: 'conversation', mentions: [], msg: {}, ...extra });

  await check('group with no feature enabled: returns false without any admin lookup or metadata fetch', async () => {
    const c = {}; const bot = mkBot(meta, c);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('http://spam.example')), false);
    assert.strictEqual(c.fetches || 0, 0);
  });

  await check('antilink still deletes a link message when enabled and bot is admin', async () => {
    fs.writeFileSync('./database/antilink.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
    const c = {}; const bot = mkBot(meta, c);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('visit http://spam.example now')), true);
    assert.ok(c.sent >= 1, 'expected a delete/notify send');
  });

  await check('enabled feature but bot NOT admin: no action', async () => {
    const c = {};
    const bot = mkBot({ participants: [{ id: '19990000000@s.whatsapp.net', admin: null }] }, c);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('visit http://spam.example now')), false);
    assert.ok(!c.sent);
  });

  await check('group admin sender is still exempt', async () => {
    const c = {}; const bot = mkBot(meta, c);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('http://x.example', { sender: '2348022222222@s.whatsapp.net' })), false);
  });

  await check('toggling a feature off/on in the DB file is picked up on the next message', async () => {
    const bot = mkBot(meta, {});
    fs.writeFileSync('./database/antilink.json', JSON.stringify({ [GROUP]: { enabled: false } }));
    assert.strictEqual(bot.antiSystems._hasActiveFeature(msg('x')), false);
    await new Promise((r) => setTimeout(r, 15));   // ensure a different mtime
    fs.writeFileSync('./database/antilink.json', JSON.stringify({ [GROUP]: { enabled: true } }));
    assert.strictEqual(bot.antiSystems._hasActiveFeature(msg('x')), true);
  });

  await check('blocked-sticker list alone keeps checkAll active (feature has no enabled flag)', async () => {
    fs.writeFileSync('./database/antilink.json', '{}');
    fs.writeFileSync('./database/blockedstickers.json', JSON.stringify({ [GROUP]: ['AAAA'] }));
    const bot = mkBot(meta, {});
    const st = msg('', { type: 'stickerMessage', msg: { fileSha256: Buffer.from('AAAA', 'base64') } });
    assert.strictEqual(bot.antiSystems._hasActiveFeature(st), true);
    assert.strictEqual(bot.antiSystems._hasActiveFeature(msg('hello')), false);
  });

  await check('antivideo deletes videos/video notes only when enabled; admins exempt', async () => {
    fs.writeFileSync('./database/antilink.json', '{}');
    fs.writeFileSync('./database/antivideo.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
    const bot = mkBot(meta, {});
    const vid = msg('', { type: 'videoMessage', msg: { seconds: 5 } });
    assert.strictEqual(bot.antiSystems._hasActiveFeature(vid), true);
    assert.strictEqual(await bot.antiSystems.checkAll(vid), true);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'ptvMessage' })), true);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('hello')), false);               // text untouched
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'imageMessage' })), false);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'videoMessage', sender: '2348022222222@s.whatsapp.net' })), false); // admin
    fs.writeFileSync('./database/antivideo.json', JSON.stringify({ [GROUP]: { enabled: false, action: 'delete' } }));
    await new Promise((r) => setTimeout(r, 15));
    fs.writeFileSync('./database/antivideo.json', JSON.stringify({ [GROUP]: { enabled: false, action: 'delete', x: 1 } }));
    assert.strictEqual(await bot.antiSystems.checkAll(vid), false);
  });

  await check('antisticker deletes every sticker when enabled; other messages untouched', async () => {
    fs.writeFileSync('./database/antivideo.json', '{}');
    fs.writeFileSync('./database/antisticker.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
    const bot = mkBot(meta, {});
    const st = msg('', { type: 'stickerMessage', msg: { fileSha256: Buffer.from('ZZZZ', 'base64') } });
    assert.strictEqual(await bot.antiSystems.checkAll(st), true);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('hi')), false);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'videoMessage' })), false);
    assert.strictEqual(await bot.antiSystems.checkAll({ ...st, sender: '2348022222222@s.whatsapp.net' }), false); // admin
    fs.writeFileSync('./database/antisticker.json', '{}');
  });

  await check('antivv deletes view-once (all variants) only when enabled; antivn deletes voice notes only', async () => {
    fs.writeFileSync('./database/antisticker.json', '{}');
    fs.writeFileSync('./database/antivv.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
    let bot = mkBot(meta, {});
    const vv = (type, extra = {}) => msg('', { type, viewOnce: true, viewOnceType: 'imageMessage', msg: {}, ...extra });
    for (const t of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
      assert.strictEqual(await bot.antiSystems.checkAll(vv(t)), true, t);
    }
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'imageMessage', msg: { viewOnce: true } })), true); // newer flag form
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'imageMessage', msg: {} })), false);               // normal photo
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'audioMessage', msg: { ptt: true } })), false);    // voice note untouched by antivv
    assert.strictEqual(await bot.antiSystems.checkAll(vv('viewOnceMessage', { sender: '2348022222222@s.whatsapp.net' })), false); // admin
    fs.writeFileSync('./database/antivv.json', '{}');

    fs.writeFileSync('./database/antivn.json', JSON.stringify({ [GROUP]: { enabled: true, action: 'delete' } }));
    bot = mkBot(meta, {});
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'audioMessage', msg: { ptt: true } })), true);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'audioMessage', msg: { ptt: false } })), false);   // normal audio file/music
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'viewOnceMessageV2', viewOnce: true, viewOnceType: 'audioMessage', msg: { ptt: true } })), true);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('', { type: 'audioMessage', msg: { ptt: true }, sender: '2348022222222@s.whatsapp.net' })), false);
    fs.writeFileSync('./database/antivn.json', '{}');
  });

  await check('antivv / antivn honour warn and kick actions', async () => {
    for (const [file, mk] of [['antivv', () => msg('', { type: 'viewOnceMessage', viewOnce: true, msg: {} })], ['antivn', () => msg('', { type: 'audioMessage', msg: { ptt: true } })]]) {
      for (const action of ['warn', 'kick']) {
        fs.writeFileSync(`./database/${file}.json`, JSON.stringify({ [GROUP]: { enabled: true, action, maxWarns: 3 } }));
        const calls = []; const c = {};
        const bot = mkBot(meta, c);
        bot.sock.groupParticipantsUpdate = async (...a) => { calls.push(a); };
        assert.strictEqual(await bot.antiSystems.checkAll(mk()), true, `${file}/${action}`);
        if (action === 'kick') assert.ok(calls.some((a) => a[2] === 'remove'), 'expected a removal call');
        assert.ok(c.sent >= 1, `${file}/${action}: expected a notice`);
      }
      fs.writeFileSync(`./database/${file}.json`, '{}');
    }
  });

  await check('DMs are ignored', async () => {
    const bot = mkBot(meta, {});
    assert.strictEqual(await bot.antiSystems.checkAll({ isGroup: false }), false);
  });

  console.log(`\n${passed} passed`);
  process.exit(process.exitCode || 0);
})();
                       

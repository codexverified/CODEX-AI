// mention -sticker: saving the chosen sticker and the reply the handler sends.
// Run: node tests/mentionSticker.test.js   (no WhatsApp, no network)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Fake lib/baileys so no Baileys install / network is needed.
const baileysPath = require.resolve('../lib/baileys.js', { paths: [__dirname] });
const FAKE = Buffer.from('RIFF....WEBPfake-sticker-bytes');
let downloadArgs = null;
require.cache[baileysPath] = { id: baileysPath, filename: baileysPath, loaded: true, exports: {
  downloadMediaMessage: async (msg) => { downloadArgs = msg; return FAKE; },
} };

const mention = require('../commands/owner/mention.js');
const { mentionConfig, STICKER_FILE } = mention;
const CFG = path.join(__dirname, '..', 'database', 'mention_config.json');
const backups = [CFG, STICKER_FILE].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);

let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`  ok - ${label}`); }
  catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}
const run = async (args, m) => {
  const out = []; await mention.execute({}, m, { args, reply: async (t) => out.push(t), prefix: '.' }); return out.join('\n');
};

(async () => {
  console.log('mention -sticker tests:');
  const stickerMsg = { chat: 'g@g.us', key: { remoteJid: 'g@g.us' }, contextInfo: {
    stanzaId: 'QID', participant: '2348011111111@s.whatsapp.net',
    quotedMessage: { stickerMessage: { url: 'x', mediaKey: 'k', fileSha256: 'h' } } } };

  await check('without a quoted sticker it asks for one and changes nothing', async () => {
    mentionConfig.active = false; mentionConfig.action = '';
    const out = await run(['-sticker'], { chat: 'g@g.us', key: {}, contextInfo: {} });
    assert.ok(/Reply to a sticker/.test(out));
    assert.strictEqual(mentionConfig.active, false);
  });

  await check('replying to a sticker downloads it, saves it and turns mention-sticker on', async () => {
    const out = await run(['-sticker'], stickerMsg);
    assert.ok(/Sticker saved/.test(out), out);
    assert.deepStrictEqual(fs.readFileSync(STICKER_FILE), FAKE);
    assert.strictEqual(mentionConfig.active, true);
    assert.strictEqual(mentionConfig.action, 'sticker');
    assert.strictEqual(downloadArgs.key.id, 'QID');
  });

  await check('setting persists in mention_config.json', () => {
    const saved = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    assert.strictEqual(saved.action, 'sticker');
  });

  await check('-sticker off disables it; -sticker on re-enables the saved sticker', async () => {
    await run(['-sticker', 'off'], { chat: 'g@g.us', key: {}, contextInfo: {} });
    assert.strictEqual(mentionConfig.active, false);
    await run(['-sticker', 'on'], { chat: 'g@g.us', key: {}, contextInfo: {} });
    assert.strictEqual(mentionConfig.active, true);
    assert.strictEqual(mentionConfig.action, 'sticker');
  });

  await check('a failed download keeps the previous config and reports an error', async () => {
    require.cache[baileysPath].exports.downloadMediaMessage = async () => { throw new Error('boom'); };
    mentionConfig.active = false; mentionConfig.action = '';
    const out = await run(['-sticker'], stickerMsg);
    assert.ok(/Could not save/.test(out));
    assert.strictEqual(mentionConfig.active, false);
  });

  await check('handler sends the saved sticker, quoting the mention (source wired in messageHandler)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'messageHandler.js'), 'utf8');
    assert.ok(/mentionCfg\.action === "sticker"/.test(src) && /\{ sticker: stickerBuf \}, \{ quoted: msg \}/.test(src));
  });

  // restore any pre-existing user files
  for (const [f, buf] of backups) { if (buf) fs.writeFileSync(f, buf); else fs.rmSync(f, { force: true }); }
  console.log(`\n${passed} passed`);
  process.exit(process.exitCode || 0);
})();
  

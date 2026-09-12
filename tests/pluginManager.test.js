// Focused tests for the plugin registry bug fix (lib/pluginManager.js
// listPlugins() + lib/commandHandler.js loadPlugins()/loadPluginFile()).
//
// Reproduces exactly the reported bug: a plugin installed and loaded from
// plugins/ must show up in listPlugins() even when it has no embedded
// "// @source: <url>" comment (older installs, manually-dropped files,
// restored backups) — and must still be present after a full reload from
// disk (simulating a bot restart), until the owner deletes it themselves.
//
// Run with: node tests/pluginManager.test.js
//
// This stubs fs-extra/chalk/axios (see tests/connection.test.js for the
// same pattern) so it runs offline without needing real dependencies
// installed.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pluginmgr-test-'));
process.env.CODEX_PROJECT_ROOT = testRoot;
fs.mkdirSync(path.join(testRoot, 'plugins'), { recursive: true });

const projectRoot = path.resolve(__dirname, '..');

const fsx = require('fs');
fsx.mkdirSync(path.join(__dirname, '_stubs'), { recursive: true });
fsx.writeFileSync(
  path.join(__dirname, '_stubs', 'chalk.js'),
  'const id = s => s; module.exports = new Proxy(id, { get: () => module.exports });',
);
fsx.writeFileSync(
  path.join(__dirname, '_stubs', 'axios.js'),
  'module.exports = { get: async () => { throw new Error("no network in test"); } };',
);
// lib/commandHandler.js and lib/pluginManager.js only use a handful of
// fs-extra's extra (non-stdlib) methods — cover exactly those on top of
// real `fs` rather than pulling in the whole package.
fsx.writeFileSync(
  path.join(__dirname, '_stubs', 'fs-extra.js'),
  [
    "const fs = require('fs');",
    'function ensureDirSync(p) { fs.mkdirSync(p, { recursive: true }); }',
    'async function ensureDir(p) { ensureDirSync(p); }',
    'async function remove(p) { fs.rmSync(p, { recursive: true, force: true }); }',
    'async function move(src, dst) { fs.renameSync(src, dst); }',
    'async function writeFile(p, c) { fs.writeFileSync(p, c); }',
    'module.exports = Object.assign({}, fs, { ensureDirSync, ensureDir, remove, move, writeFile });',
  ].join('\n'),
);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'fs-extra') return path.join(__dirname, '_stubs', 'fs-extra.js');
  if (request === 'chalk') return path.join(__dirname, '_stubs', 'chalk.js');
  if (request === 'axios') return path.join(__dirname, '_stubs', 'axios.js');
  return originalResolveFilename.call(this, request, ...rest);
};

const CommandHandler = require(path.join(projectRoot, 'lib', 'commandHandler.js'));
const pluginManager = require(path.join(projectRoot, 'lib', 'pluginManager.js'));

function makeBot() {
  const bot = { commands: new Map(), config: {} };
  bot.commandHandler = new CommandHandler(bot);
  return bot;
}

function writePluginFile(name, { withSource } = { withSource: true }) {
  const finalPath = pluginManager.pluginPath(name);
  const body = `module.exports = { name: '${name}', description: 'test plugin', execute: async () => {} };`;
  const content = withSource ? `// @source: https://example.com/${name}.js\n${body}` : body;
  fs.writeFileSync(finalPath, content);
  return finalPath;
}

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${label}`);
  } catch (err) {
    console.error(`  FAIL - ${label}`);
    console.error(`    ${err.stack || err}`);
    process.exitCode = 1;
  }
}

console.log('pluginManager tests:');

check('a plugin WITHOUT a @source marker still appears in listPlugins() (the reported bug)', () => {
  fs.rmSync(pluginManager.PLUGINS_DIR, { recursive: true, force: true });
  fs.mkdirSync(pluginManager.PLUGINS_DIR, { recursive: true });

  const bot = makeBot();
  const filePath = writePluginFile('nosourceplugin', { withSource: false });
  bot.commandHandler.loadPluginFile(filePath);

  assert.ok(bot.commands.has('nosourceplugin'), 'plugin command must be registered and callable');
  const listed = pluginManager.listPlugins(bot);
  assert.ok(
    listed.some((c) => c.name === 'nosourceplugin'),
    'listPlugins() must include a loaded plugin even without a @source comment',
  );
});

check('a plugin WITH a @source marker still shows its source link', () => {
  fs.rmSync(pluginManager.PLUGINS_DIR, { recursive: true, force: true });
  fs.mkdirSync(pluginManager.PLUGINS_DIR, { recursive: true });

  const bot = makeBot();
  const filePath = writePluginFile('withsourceplugin', { withSource: true });
  bot.commandHandler.loadPluginFile(filePath);

  const listed = pluginManager.listPlugins(bot);
  const entry = listed.find((c) => c.name === 'withsourceplugin');
  assert.ok(entry, 'plugin must be listed');
  assert.strictEqual(entry.source, 'https://example.com/withsourceplugin.js');
});

check('an installed plugin survives a full reload from disk (simulated restart)', () => {
  fs.rmSync(pluginManager.PLUGINS_DIR, { recursive: true, force: true });
  fs.mkdirSync(pluginManager.PLUGINS_DIR, { recursive: true });

  // "Install" happens in one bot/process instance...
  const bot1 = makeBot();
  writePluginFile('survivesrestart', { withSource: true });
  bot1.commandHandler.loadPlugins();
  assert.ok(bot1.commands.has('survivesrestart'));
  assert.ok(pluginManager.listPlugins(bot1).some((c) => c.name === 'survivesrestart'));

  // ...a brand-new bot/CommandHandler instance simulates the process
  // restarting and reloading everything from disk, with nothing carried
  // over in memory.
  const bot2 = makeBot();
  const result = bot2.commandHandler.loadPlugins();
  assert.strictEqual(result.loaded, 1);
  assert.ok(bot2.commands.has('survivesrestart'), 'plugin command must still be registered after "restart"');
  assert.ok(
    pluginManager.listPlugins(bot2).some((c) => c.name === 'survivesrestart'),
    'listPlugins() must show the plugin after "restart" without any reinstall',
  );
});

check('uninstalling (removePlugin) is the only thing that makes it disappear', async () => {
  fs.rmSync(pluginManager.PLUGINS_DIR, { recursive: true, force: true });
  fs.mkdirSync(pluginManager.PLUGINS_DIR, { recursive: true });

  const bot = makeBot();
  writePluginFile('removeme', { withSource: true });
  bot.commandHandler.loadPlugins();
  assert.ok(pluginManager.listPlugins(bot).some((c) => c.name === 'removeme'));

  await pluginManager.removePlugin(bot, 'removeme');
  assert.ok(!pluginManager.listPlugins(bot).some((c) => c.name === 'removeme'), 'must be gone only after explicit removal');

  // And it must NOT come back on a subsequent "restart" reload, since the
  // file is actually gone from disk.
  const bot2 = makeBot();
  bot2.commandHandler.loadPlugins();
  assert.ok(!pluginManager.listPlugins(bot2).some((c) => c.name === 'removeme'));
});

console.log(`\n${passed} check(s) passed.`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}

const assert = require('node:assert');
const path = require('node:path');

const modPath = path.join(__dirname, '../commands/media/tomp3.js');

try {
  const mod = require(modPath);
  assert.ok(mod && typeof mod.execute === 'function');
  console.log('tomp3 command loaded successfully');
} catch (err) {
  console.error('Missing tomp3 command:', err.message);
  process.exit(1);
}

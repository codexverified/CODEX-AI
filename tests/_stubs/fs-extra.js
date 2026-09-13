const fs = require('fs');
function ensureDirSync(p) { fs.mkdirSync(p, { recursive: true }); }
async function ensureDir(p) { ensureDirSync(p); }
async function remove(p) { fs.rmSync(p, { recursive: true, force: true }); }
async function move(src, dst) { fs.renameSync(src, dst); }
async function writeFile(p, c) { fs.writeFileSync(p, c); }
module.exports = Object.assign({}, fs, { ensureDirSync, ensureDir, remove, move, writeFile });
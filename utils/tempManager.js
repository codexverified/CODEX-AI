/**
 * Centralized Temp Directory Management
 *
 * Media processing (ffmpeg, canvas/sharp, Baileys media downloads) each
 * default to the system temp dir on their own, scattered across the host's
 * filesystem where nothing ever cleans them up. On shared/panel hosts
 * (Pterodactyl, Render, etc.) that quietly fills the disk over days/weeks
 * until something hits ENOSPC.
 *
 * This forces everything through one project-local ./temp directory, so a
 * single cleanup routine (see ./cleanup.js) can find and prune it all.
 *
 * MUST be required (and initializeTempSystem() called) before any library
 * that reads TMPDIR/TMP/TEMP at load time — see index.js, which loads this
 * first, ahead of the Baileys shim and app.js.
 */

const fs = require('fs');
const path = require('path');
// Anchored to the project root (not process.cwd()) so the temp dir lands
// in the same place regardless of the directory the process was launched
// from (e.g. a host that cds elsewhere before running `node index.js`).
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');

function initializeTempSystem() {
  const tempDirAbsolute = path.resolve(TEMP_DIR);

  process.env.TMPDIR = tempDirAbsolute;
  process.env.TMP = tempDirAbsolute;
  process.env.TEMP = tempDirAbsolute;

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  return TEMP_DIR;
}

function getTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  return TEMP_DIR;
}

function createTempFilePath(prefix = 'temp', extension = 'tmp') {
  const tempDir = getTempDir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  const filename = `${prefix}_${timestamp}_${random}.${extension}`;
  return path.join(tempDir, filename);
}

function deleteTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const resolvedPath = path.resolve(filePath);
      const tempDirResolved = path.resolve(TEMP_DIR);

      if (resolvedPath.startsWith(tempDirResolved)) {
        fs.unlinkSync(filePath);
        return true;
      }
      console.warn(`Attempted to delete file outside temp directory: ${filePath}`);
      return false;
    }
    return false;
  } catch (error) {
    console.error(`Error deleting temp file ${filePath}:`, error.message);
    return false;
  }
}

function deleteTempFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  filePaths.forEach(deleteTempFile);
}

module.exports = {
  initializeTempSystem,
  getTempDir,
  createTempFilePath,
  deleteTempFile,
  deleteTempFiles,
  TEMP_DIR,
};

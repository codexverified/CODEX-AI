/**
 * Global Cleanup System
 * Automatically deletes old files from the centralized temp directory to
 * prevent slow, silent disk fill-ups (ENOSPC) on long-running hosts.
 */

const fs = require('fs');
const path = require('path');
const { getTempDir } = require('./tempManager');

let config = {};
try {
  config = require('../config.json');
} catch {
  config = {};
}

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const FILE_AGE_THRESHOLD_MS = 30 * 60 * 1000; // delete files older than 30 minutes

// Session directory name — must NEVER be touched by cleanup, even if it
// somehow ends up under the temp dir.
const SESSION_DIR_NAME = config.sessionName || 'session';

let cleanupInterval = null;

/**
 * Delete files in the temp dir older than FILE_AGE_THRESHOLD_MS.
 * @param {number} [ageThresholdMs] override the age threshold (used for
 *   emergency cleanup on ENOSPC, where we want to be more aggressive).
 */
function cleanupOldFiles(ageThresholdMs = FILE_AGE_THRESHOLD_MS) {
  try {
    const tempDir = getTempDir();
    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    let deletedCount = 0;
    let totalSizeFreed = 0;

    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          if (file === SESSION_DIR_NAME || filePath.includes(SESSION_DIR_NAME)) continue;
          continue;
        }
        const fileAge = now - stats.mtimeMs;
        if (fileAge > ageThresholdMs) {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
          totalSizeFreed += fileSize;
        }
      } catch (error) {
        if (!error.message.includes('ENOENT') && !error.message.includes('EBUSY')) {
          console.warn(`Error processing file ${filePath}:`, error.message);
        }
      }
    }

    if (deletedCount > 0) {
      const sizeMB = (totalSizeFreed / (1024 * 1024)).toFixed(2);
      console.log(`🧹 Cleanup: Deleted ${deletedCount} old temp file(s), freed ${sizeMB} MB`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

/**
 * Emergency cleanup — called from app.js's ENOSPC handler. Uses a much
 * shorter age threshold (5 minutes) since the goal is freeing space right
 * now, not just routine housekeeping.
 */
function emergencyCleanup() {
  console.log('🚨 Emergency cleanup triggered (disk full) — deleting temp files older than 5 minutes...');
  cleanupOldFiles(5 * 60 * 1000);
}

function startCleanup() {
  console.log('🧹 Starting temp file cleanup system...');
  cleanupOldFiles();
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => cleanupOldFiles(), CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();
  console.log(`✅ Cleanup system started (runs every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes)`);
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Cleanup system stopped');
  }
}

module.exports = {
  cleanupOldFiles,
  emergencyCleanup,
  startCleanup,
  stopCleanup,
};

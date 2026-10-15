/**
 * Vaultly - Atomic File Storage Utility
 * Implements atomic file writes (write-to-temp then rename) to prevent vault corruption
 * during unexpected shutdowns, crashes, or power cuts.
 * Fully compatible with Windows file locking and permission quirks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isWin = process.platform === 'win32';

/**
 * Ensures a directory exists synchronously.
 * @param {string} dirPath
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, ...(isWin ? {} : { mode: 0o700 }) });
  }
}

/**
 * Atomically writes data to a target file by first writing to a temporary file
 * in the same filesystem directory, then renaming it over the destination.
 * Includes robust Windows handling for antivirus / indexer locks and ACL permissions.
 *
 * @param {string} filePath - Target file path
 * @param {string|Buffer} content - Content to write
 * @param {object} [options]
 */
function writeAtomicSync(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  ensureDirSync(dir);

  // If target file exists on Windows, remove any Read-Only flag before write operations
  if (isWin && fs.existsSync(filePath)) {
    try {
      fs.chmodSync(filePath, 0o666);
    } catch (_) {}
  }

  // Use a unique temp file in the same directory to ensure same-volume atomic rename
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${randomSuffix}.tmp`);

  const writeOptions = { flag: 'w' };
  if (typeof content === 'string') {
    writeOptions.encoding = options.encoding || 'utf8';
  }
  if (!isWin) {
    writeOptions.mode = options.mode || 0o600;
  }

  try {
    // Write data to temporary file
    fs.writeFileSync(tempPath, content, writeOptions);

    // Attempt rename with retry for Windows EPERM / EBUSY / EACCES
    let renamed = false;
    let attempts = 0;
    const maxAttempts = 6;

    while (!renamed && attempts < maxAttempts) {
      try {
        fs.renameSync(tempPath, filePath);
        renamed = true;
      } catch (err) {
        attempts++;

        if (isWin) {
          // On Windows, if destination exists, unlinking it first can resolve EPERM / EBUSY on rename
          try {
            if (fs.existsSync(filePath)) {
              try { fs.chmodSync(filePath, 0o666); } catch (_) {}
              fs.unlinkSync(filePath);
            }
            fs.renameSync(tempPath, filePath);
            renamed = true;
            break;
          } catch (_) {}
        }

        if (attempts >= maxAttempts) {
          // Fallback 1: copyFileSync
          try {
            if (isWin && fs.existsSync(filePath)) {
              try { fs.chmodSync(filePath, 0o666); } catch (_) {}
            }
            fs.copyFileSync(tempPath, filePath);
            renamed = true;
          } catch (copyErr) {
            // Fallback 2: direct writeFileSync as ultimate safety valve
            try {
              fs.writeFileSync(filePath, content, writeOptions);
              renamed = true;
            } catch (directErr) {
              throw err;
            }
          }
        } else {
          // Pause briefly (waitMs = 30 * attempts) to allow background scanner / indexer to release handle
          const start = Date.now();
          const waitMs = 30 * attempts;
          while (Date.now() - start < waitMs) {}
        }
      }
    }
  } catch (err) {
    throw new Error(`Atomic write failed for ${filePath}: ${err.message}`);
  } finally {
    // Always clean up temp file if still present
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (_) {}
  }
}

/**
 * Reads a JSON file safely.
 * @param {string} filePath
 * @param {any} [defaultValue=null]
 * @returns {any}
 */
function readJsonSync(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultValue;
  }
}

/**
 * Creates a timestamped backup of a file.
 * @param {string} filePath
 * @returns {string|null} The backup file path, or null if source does not exist
 */
function createBackupSync(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `${base}.backup-${timestamp}${ext}`);

  try {
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (err) {
    return null;
  }
}

module.exports = {
  ensureDirSync,
  writeAtomicSync,
  readJsonSync,
  createBackupSync
};

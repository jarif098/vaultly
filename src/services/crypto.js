/**
 * Vaultly - Cryptography Service
 * Provides secure key derivation via scrypt and authenticated encryption via AES-256-GCM.
 * All operations use Node.js native crypto module.
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_SCRYPT_PARAMS = {
  N: 32768, // CPU/memory cost parameter (2^15)
  r: 8,     // Block size parameter
  p: 1,     // Parallelization parameter
  keylen: 32 // 256-bit derived key
};

const SALT_LENGTH = 32; // 256-bit salt
const IV_LENGTH = 12;   // 96-bit nonce recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const FORMAT_IDENTIFIER = 'vaultly-encrypted-vault';
const CURRENT_VERSION = 1;

/**
 * Derives a 256-bit encryption key from a master password and salt using scrypt.
 * @param {string|Buffer} password - The master password
 * @param {Buffer} salt - Random cryptographic salt
 * @param {object} [params] - Optional custom scrypt parameters
 * @returns {Promise<Buffer>} The derived key buffer
 */
function deriveKey(password, salt, params = {}) {
  const scryptParams = Object.assign({}, DEFAULT_SCRYPT_PARAMS, params);
  const passwordBuffer = Buffer.isBuffer(password) ? password : Buffer.from(password, 'utf8');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      passwordBuffer,
      salt,
      scryptParams.keylen,
      {
        cost: scryptParams.N,
        blockSize: scryptParams.r,
        parallelization: scryptParams.p,
        maxmem: 64 * 1024 * 1024 // 64 MB max memory
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey);
      }
    );
  });
}

/**
 * Synchronous version of deriveKey for situations where sync execution is required.
 * @param {string|Buffer} password
 * @param {Buffer} salt
 * @param {object} [params]
 * @returns {Buffer}
 */
function deriveKeySync(password, salt, params = {}) {
  const scryptParams = Object.assign({}, DEFAULT_SCRYPT_PARAMS, params);
  const passwordBuffer = Buffer.isBuffer(password) ? password : Buffer.from(password, 'utf8');

  return crypto.scryptSync(
    passwordBuffer,
    salt,
    scryptParams.keylen,
    {
      cost: scryptParams.N,
      blockSize: scryptParams.r,
      parallelization: scryptParams.p,
      maxmem: 64 * 1024 * 1024
    }
  );
}

/**
 * Encrypts arbitrary plaintext data using AES-256-GCM.
 * @param {string|object} data - Plaintext string or JSON object to encrypt
 * @param {string|Buffer} password - Master password
 * @param {object} [meta] - Optional unencrypted metadata (e.g., updatedAt, count)
 * @returns {Promise<object>} Versioned encrypted envelope object
 */
async function encryptVault(data, password, meta = {}) {
  if (data === undefined || data === null) {
    throw new Error('Data to encrypt cannot be null or undefined.');
  }
  if (!password || (typeof password === 'string' && password.length === 0)) {
    throw new Error('Master password cannot be empty.');
  }

  const plaintextString = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const plaintextBuffer = Buffer.from(plaintextString, 'utf8');

  // Generate unique random salt and nonce for every encryption operation
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  let key = null;
  try {
    key = await deriveKey(password, salt, DEFAULT_SCRYPT_PARAMS);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });

    // Optional Additional Authenticated Data (AAD) binds format & version
    const aad = Buffer.from(`${FORMAT_IDENTIFIER}:v${CURRENT_VERSION}`, 'utf8');
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(plaintextBuffer),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    const envelope = {
      format: FORMAT_IDENTIFIER,
      version: CURRENT_VERSION,
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      kdfParams: DEFAULT_SCRYPT_PARAMS,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
      meta: Object.assign({}, meta, {
        encryptedAt: new Date().toISOString()
      })
    };

    return envelope;
  } finally {
    // Clear key buffer from memory as soon as encryption completes
    if (key && Buffer.isBuffer(key)) {
      key.fill(0);
    }
  }
}

/**
 * Decrypts a versioned encrypted vault envelope using the master password.
 * @param {object|string} envelopeInput - Serialized JSON or envelope object
 * @param {string|Buffer} password - Master password
 * @returns {Promise<any>} The decrypted data (parsed JSON if valid, else string)
 */
async function decryptVault(envelopeInput, password) {
  if (!envelopeInput) {
    throw new Error('Encrypted vault envelope is missing.');
  }
  if (!password || (typeof password === 'string' && password.length === 0)) {
    throw new Error('Master password is required.');
  }

  let envelope = envelopeInput;
  if (typeof envelopeInput === 'string') {
    try {
      envelope = JSON.parse(envelopeInput);
    } catch (e) {
      throw new Error('Encrypted vault payload is not valid JSON.');
    }
  }

  // Validate format and envelope structure
  if (envelope.format !== FORMAT_IDENTIFIER) {
    throw new Error('Unsupported or invalid vault format identifier.');
  }
  if (envelope.version !== 1) {
    throw new Error(`Unsupported vault version: ${envelope.version}`);
  }
  if (!envelope.salt || !envelope.iv || !envelope.authTag || !envelope.ciphertext) {
    throw new Error('Encrypted vault payload is missing required cryptographic fields.');
  }

  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');
  const ciphertext = Buffer.from(envelope.ciphertext, 'hex');

  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Invalid salt length: expected ${SALT_LENGTH}, got ${salt.length}`);
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const kdfParams = envelope.kdfParams || DEFAULT_SCRYPT_PARAMS;
  let key = null;

  try {
    key = await deriveKey(password, salt, kdfParams);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });

    const aad = Buffer.from(`${FORMAT_IDENTIFIER}:v${envelope.version}`, 'utf8');
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    let decryptedBuffer;
    try {
      decryptedBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
    } catch (err) {
      // Auth tag mismatch or corrupted ciphertext
      const error = new Error('Authentication failed: Incorrect master password or corrupted vault file.');
      error.code = 'INVALID_PASSWORD_OR_CORRUPTED';
      throw error;
    }

    const decryptedString = decryptedBuffer.toString('utf8');

    // Attempt parsing as JSON
    try {
      return JSON.parse(decryptedString);
    } catch (e) {
      return decryptedString;
    }
  } finally {
    if (key && Buffer.isBuffer(key)) {
      key.fill(0);
    }
  }
}

/**
 * Computes a SHA-256 checksum of an object or string for change detection.
 * @param {string|object} content
 * @returns {string} Hex SHA-256 hash
 */
function computeChecksum(content) {
  const str = typeof content === 'object' ? JSON.stringify(content) : String(content);
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Safely overwrites a sensitive Buffer with zeros to minimize memory lifetime.
 * @param {Buffer} buf
 */
function wipeBuffer(buf) {
  if (buf && Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

module.exports = {
  deriveKey,
  deriveKeySync,
  encryptVault,
  decryptVault,
  computeChecksum,
  wipeBuffer,
  DEFAULT_SCRYPT_PARAMS,
  FORMAT_IDENTIFIER,
  CURRENT_VERSION
};

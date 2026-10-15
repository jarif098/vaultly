/**
 * Vaultly - Vault Management Service
 * Manages encrypted vault storage, in-memory lifecycle, entry CRUD, duplicate detection,
 * and conflict-resilient synchronization.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cryptoService = require('./crypto');
const fileStorage = require('../utils/file-storage');
const { validateMasterPassword, validateEntry } = require('../utils/validation');

const VAULT_STATES = {
  NOT_INITIALIZED: 'not_initialized',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked'
};

const PORTABLE_EXPORT_KEY = 'vaultly-portable-backup-open-v1';

class VaultService {
  /**
   * @param {string} userDataDir - Directory to store vault data
   */
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.vaultFilePath = path.join(userDataDir, 'vault.enc.json');

    // In-memory state
    this.state = VAULT_STATES.NOT_INITIALIZED;
    this.entries = [];
    this.metadata = {
      version: 1,
      createdAt: null,
      updatedAt: null,
      revision: 0,
      lastRemoteSha: null,
      lastSyncedAt: null,
      isDirty: false
    };

    // Stored temporarily in-memory while unlocked to enable atomic saves
    this._cachedMasterPassword = null;
    this._syncPromise = null;

    this.checkInitialState();
  }

  /**
   * Checks whether a vault file already exists on disk.
   */
  checkInitialState() {
    if (fs.existsSync(this.vaultFilePath)) {
      this.state = VAULT_STATES.LOCKED;
    } else {
      this.state = VAULT_STATES.NOT_INITIALIZED;
    }
  }

  /**
   * Returns current status of the vault.
   * @returns {{ state: string, entryCount: number, updatedAt: string|null }}
   */
  getStatus() {
    return {
      state: this.state,
      entryCount: this.state === VAULT_STATES.UNLOCKED ? this.entries.length : 0,
      updatedAt: this.metadata.updatedAt
    };
  }

  /**
   * Initializes a brand-new encrypted vault.
   * @param {string} masterPassword
   * @returns {Promise<{ success: boolean }>}
   */
  async createVault(masterPassword) {
    const passCheck = validateMasterPassword(masterPassword);
    if (!passCheck.valid) {
      throw new Error(passCheck.error);
    }

    if (fs.existsSync(this.vaultFilePath)) {
      throw new Error('A vault already exists. Please unlock it instead of creating a new one.');
    }

    const now = new Date().toISOString();
    this.entries = [];
    this.metadata = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      lastRemoteSha: null
    };

    this._cachedMasterPassword = masterPassword;
    this.state = VAULT_STATES.UNLOCKED;

    await this._persistVault();
    return { success: true };
  }

  /**
   * Derives a deterministic 256-bit cryptographic key from GitHub PAT and repository identifier.
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @returns {string|null}
   */
  deriveVaultKey(token, owner, repo) {
    if (!owner || !repo) return null;
    const cleanOwner = String(owner).trim().toLowerCase();
    const cleanRepo = String(repo).trim().toLowerCase();
    return crypto.createHash('sha256')
      .update(`vaultly-profile::${cleanOwner}::${cleanRepo}`)
      .digest('hex');
  }

  /**
   * Legacy token-based key derivation for backward compatibility with historical commits.
   */
  deriveLegacyTokenKey(token, owner, repo) {
    if (!token || !owner || !repo) return null;
    const cleanToken = String(token).trim();
    const cleanTarget = `${String(owner).trim().toLowerCase()}/${String(repo).trim().toLowerCase()}`;
    return crypto.createHash('sha256')
      .update(`${cleanToken}::${cleanTarget}`)
      .digest('hex');
  }

  /**
   * Unlocks local vault file using the derived GitHub key.
   * @param {string} key
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async unlockWithDerivedKey(key) {
    if (!fs.existsSync(this.vaultFilePath)) {
      const err = new Error('No local vault file found on disk.');
      err.code = 'NO_LOCAL_VAULT';
      throw err;
    }

    const rawFile = fs.readFileSync(this.vaultFilePath, 'utf8');
    const decryptedData = await cryptoService.decryptVault(rawFile, key);

    if (!decryptedData || typeof decryptedData !== 'object') {
      throw new Error('Decrypted vault payload is invalid.');
    }

    this.entries = Array.isArray(decryptedData.entries) ? decryptedData.entries : [];
    this.metadata = Object.assign({
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
      lastRemoteSha: null,
      lastSyncedAt: null,
      isDirty: false
    }, decryptedData.metadata);

    this._cachedMasterPassword = key;
    this.state = VAULT_STATES.UNLOCKED;

    return {
      success: true,
      count: this.entries.length
    };
  }

  /**
   * Creates and initializes a fresh encrypted vault with the derived GitHub key.
   * @param {string} key
   * @returns {Promise<{ success: boolean }>}
   */
  async createWithDerivedKey(key) {
    const now = new Date().toISOString();
    this.entries = [];
    this.metadata = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      lastRemoteSha: null,
      lastSyncedAt: null,
      isDirty: false
    };

    this._cachedMasterPassword = key;
    this.state = VAULT_STATES.UNLOCKED;

    await this._persistVault();
    return { success: true };
  }

  /**
   * Unlocks an existing vault using the master password.
   * @param {string} masterPassword
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  async unlockVault(masterPassword) {
    if (!fs.existsSync(this.vaultFilePath)) {
      throw new Error('Vault file does not exist on disk.');
    }

    const rawFile = fs.readFileSync(this.vaultFilePath, 'utf8');
    const decryptedData = await cryptoService.decryptVault(rawFile, masterPassword);

    if (!decryptedData || typeof decryptedData !== 'object') {
      throw new Error('Decrypted vault payload is invalid.');
    }

    this.entries = Array.isArray(decryptedData.entries) ? decryptedData.entries : [];
    this.metadata = Object.assign({
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
      lastRemoteSha: null,
      lastSyncedAt: null,
      isDirty: false
    }, decryptedData.metadata);

    this._cachedMasterPassword = masterPassword;
    this.state = VAULT_STATES.UNLOCKED;

    return {
      success: true,
      count: this.entries.length
    };
  }

  /**
   * Locks the vault immediately and wipes decrypted entries and cached secrets from memory.
   */
  lockVault() {
    if (this.entries && Array.isArray(this.entries)) {
      // Overwrite sensitive strings in memory before discarding
      for (const entry of this.entries) {
        if (entry.password) entry.password = '';
        if (entry.username) entry.username = '';
        if (entry.notes) entry.notes = '';
      }
    }

    this.entries = [];
    this._cachedMasterPassword = null;
    this.checkInitialState();
    return { success: true, state: this.state };
  }

  /**
   * Resets the vault completely by deleting the encrypted file and resetting state.
   * @returns {{ success: boolean }}
   */
  resetVault() {
    this.lockVault();
    if (fs.existsSync(this.vaultFilePath)) {
      try {
        fs.unlinkSync(this.vaultFilePath);
      } catch (e) {
        // If unlink fails, overwrite with empty
        try { fs.writeFileSync(this.vaultFilePath, ''); fs.unlinkSync(this.vaultFilePath); } catch (err) {}
      }
    }
    this.state = VAULT_STATES.NOT_INITIALIZED;
    return { success: true };
  }

  /**
   * Changes the master password, re-encrypting all entries with a new derived key.
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{ success: boolean }>}
   */
  async changeMasterPassword(currentPassword, newPassword) {
    if (this.state !== VAULT_STATES.UNLOCKED) {
      throw new Error('Vault must be unlocked to change master password.');
    }

    if (this._cachedMasterPassword !== currentPassword) {
      throw new Error('Current master password does not match.');
    }

    const check = validateMasterPassword(newPassword);
    if (!check.valid) {
      throw new Error(check.error);
    }

    // Create a backup of existing file before changing key
    fileStorage.createBackupSync(this.vaultFilePath);

    this._cachedMasterPassword = newPassword;
    this.metadata.updatedAt = new Date().toISOString();
    this.metadata.revision = (this.metadata.revision || 0) + 1;

    await this._persistVault();
    return { success: true };
  }

  /**
   * Adds a new password entry to the vault.
   * @param {object} rawEntry
   * @returns {Promise<object>} The created entry
   */
  async addEntry(rawEntry) {
    this._ensureUnlocked();

    const { valid, error, sanitized } = validateEntry(rawEntry);
    if (!valid) {
      throw new Error(error);
    }

    const now = new Date().toISOString();
    const newEntry = Object.assign({}, sanitized, {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    });

    this.entries.push(newEntry);
    this.metadata.updatedAt = now;
    this.metadata.revision = (this.metadata.revision || 0) + 1;
    this.metadata.isDirty = true;

    await this._persistVault();
    return newEntry;
  }

  /**
   * Updates an existing entry by ID.
   * @param {string} id
   * @param {object} updates
   * @returns {Promise<object>}
   */
  async updateEntry(id, updates) {
    this._ensureUnlocked();

    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) {
      throw new Error(`Entry with id "${id}" not found.`);
    }

    const current = this.entries[index];
    const candidate = Object.assign({}, current, updates, { id });

    const { valid, error, sanitized } = validateEntry(candidate);
    if (!valid) {
      throw new Error(error);
    }

    const now = new Date().toISOString();
    const updatedEntry = Object.assign({}, sanitized, {
      id,
      createdAt: current.createdAt || now,
      updatedAt: now
    });

    this.entries[index] = updatedEntry;
    this.metadata.updatedAt = now;
    this.metadata.revision = (this.metadata.revision || 0) + 1;
    this.metadata.isDirty = true;

    await this._persistVault();
    return updatedEntry;
  }

  /**
   * Deletes an entry by ID.
   * @param {string} id
   * @returns {Promise<{ success: boolean }>}
   */
  async deleteEntry(id) {
    this._ensureUnlocked();

    const initialLength = this.entries.length;
    this.entries = this.entries.filter(e => e.id !== id);

    if (this.entries.length === initialLength) {
      throw new Error(`Entry with id "${id}" not found.`);
    }

    this.metadata.updatedAt = new Date().toISOString();
    this.metadata.revision = (this.metadata.revision || 0) + 1;
    this.metadata.isDirty = true;

    await this._persistVault();
    return { success: true };
  }

  /**
   * Toggles the favorite status of an entry.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async toggleFavorite(id) {
    this._ensureUnlocked();
    const entry = this.entries.find(e => e.id === id);
    if (!entry) {
      throw new Error(`Entry with id "${id}" not found.`);
    }
    return this.updateEntry(id, { isFavorite: !entry.isFavorite });
  }

  /**
   * Queries entries by category, search string, or favorite filter.
   * @param {object} [options]
   * @returns {Array<object>}
   */
  getEntries(options = {}) {
    this._ensureUnlocked();

    let result = [...this.entries];

    if (options.category && options.category !== 'all') {
      if (options.category === 'favorites') {
        result = result.filter(e => Boolean(e.isFavorite));
      } else if (options.category === 'recent') {
        // Entries updated or created in the last 14 days
        const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
        result = result.filter(e => new Date(e.createdAt || e.updatedAt).getTime() >= cutoff);
      } else {
        result = result.filter(e => e.category === options.category);
      }
    }

    if (options.search && typeof options.search === 'string') {
      const q = options.search.toLowerCase().trim();
      if (q) {
        result = result.filter(e =>
          (e.service && e.service.toLowerCase().includes(q)) ||
          (e.username && e.username.toLowerCase().includes(q)) ||
          (e.websiteUrl && e.websiteUrl.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (Array.isArray(e.tags) && e.tags.some(t => t.toLowerCase().includes(q)))
        );
      }
    }

    // Sort order: default by service name ascending
    const sortBy = options.sortBy || 'service';
    result.sort((a, b) => {
      if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      return (a.service || '').localeCompare(b.service || '');
    });

    return result;
  }

  /**
   * Checks for duplicate service + username combinations.
   * @param {string} service
   * @param {string} username
   * @param {string|null} [currentId=null]
   * @returns {boolean} True if duplicate exists
   */
  hasDuplicate(service, username, currentId = null) {
    if (this.state !== VAULT_STATES.UNLOCKED) return false;
    const cleanService = (service || '').trim().toLowerCase();
    const cleanUser = (username || '').trim().toLowerCase();

    return this.entries.some(e =>
      e.id !== currentId &&
      (e.service || '').trim().toLowerCase() === cleanService &&
      (e.username || '').trim().toLowerCase() === cleanUser
    );
  }

  /**
   * Exports the encrypted vault envelope suitable for backup files.
   * @param {string} [exportPassword] - Optional custom backup password; defaults to current vault key
   * @param {string|null} [exportPassword=null] - Optional custom backup password; if omitted/blank, exports an open portable backup
   * @returns {Promise<string>} Serialized JSON of encrypted vault
   */
  async exportEncryptedBackup(exportPassword = null) {
    this._ensureUnlocked();
    const hasCustomPass = Boolean(exportPassword && typeof exportPassword === 'string' && exportPassword.trim());
    const pass = hasCustomPass ? exportPassword.trim() : PORTABLE_EXPORT_KEY;

    const payload = {
      entries: this.entries,
      metadata: Object.assign({}, this.metadata, {
        exportedAt: new Date().toISOString(),
        isProtected: hasCustomPass
      })
    };

    const envelope = await cryptoService.encryptVault(payload, pass, {
      format: 'vaultly-backup',
      type: 'backup',
      isProtected: hasCustomPass,
      entryCount: this.entries.length,
      exportedAt: new Date().toISOString()
    });

    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Restores and merges vault entries from an encrypted .vaulty / .vaultly backup file.
   * Auto-decrypts using portable open key, current vault key, fallback keys, or user-supplied password.
   *
   * @param {string} backupContent
   * @param {string|null} [backupPassword=null]
   * @param {string[]} [fallbackKeys=[]]
   * @returns {Promise<{ success: boolean, count: number, added: number, updated: number, message: string }>}
   */
  async restoreEncryptedBackup(backupContent, backupPassword = null, fallbackKeys = []) {
    let decrypted = null;

    // Build candidates list to try
    const candidates = [];
    if (backupPassword && typeof backupPassword === 'string' && backupPassword.trim()) {
      candidates.push(backupPassword.trim());
    }

    // Always attempt portable open key first so un-passworded backups restore instantly anywhere
    candidates.push(PORTABLE_EXPORT_KEY);

    // Try current vault master key if unlocked or cached
    if (this._cachedMasterPassword && !candidates.includes(this._cachedMasterPassword)) {
      candidates.push(this._cachedMasterPassword);
    }

    // Try all fallback keys (local keys, stored passwords, known profile keys)
    if (Array.isArray(fallbackKeys)) {
      for (const key of fallbackKeys) {
        if (key && typeof key === 'string' && !candidates.includes(key)) {
          candidates.push(key);
        }
      }
    }

    for (const key of candidates) {
      try {
        decrypted = await cryptoService.decryptVault(backupContent, key);
        if (decrypted) break;
      } catch (e) {}
    }

    if (!decrypted) {
      const err = new Error('Could not decrypt .vaulty backup. Please enter the password used to protect this file.');
      err.code = 'DECRYPT_FAILED';
      throw err;
    }

    if (!decrypted || !Array.isArray(decrypted.entries)) {
      throw new Error('Invalid .vaulty file structure: entries array not found.');
    }

    // Merge entries avoiding exact duplicate IDs and updating newer entries
    const mergedMap = new Map();
    for (const e of this.entries) {
      mergedMap.set(e.id, e);
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const item of decrypted.entries) {
      const { valid, sanitized } = validateEntry(item);
      if (valid) {
        if (!mergedMap.has(sanitized.id)) {
          mergedMap.set(sanitized.id, sanitized);
          addedCount++;
        } else {
          const existing = mergedMap.get(sanitized.id);
          const existingTime = new Date(existing.updatedAt || 0).getTime();
          const backupTime = new Date(sanitized.updatedAt || 0).getTime();
          if (backupTime > existingTime) {
            mergedMap.set(sanitized.id, sanitized);
            updatedCount++;
          }
        }
      }
    }

    this.entries = Array.from(mergedMap.values());
    this.metadata.updatedAt = new Date().toISOString();
    this.metadata.revision = (this.metadata.revision || 0) + 1;
    this.metadata.isDirty = true;

    await this._persistVault();

    return {
      success: true,
      count: this.entries.length,
      added: addedCount,
      updated: updatedCount,
      message: `Successfully imported ${addedCount} new password(s)${updatedCount > 0 ? ` and updated ${updatedCount}` : ''}! Total in vault: ${this.entries.length}`
    };
  }

  /**
   * Returns the current raw encrypted envelope from disk (for GitHub sync).
   * @returns {object}
   */
  getEncryptedEnvelope() {
    if (!fs.existsSync(this.vaultFilePath)) {
      throw new Error('Vault file does not exist.');
    }
    const raw = fs.readFileSync(this.vaultFilePath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Syncs with a remote GitHub repository.
   * Uses an in-flight promise mutex to prevent concurrent sync races.
   *
   * @param {object} githubService - GitHubSyncService instance
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} [branch='main']
   * @param {boolean} [forceOverwrite=false]
   * @param {string} [cloudPassword=null]
   * @param {string[]} [fallbackKeys=[]]
   * @returns {Promise<object>}
   */
  async syncWithGitHub(githubService, token, owner, repo, branch = 'main', forceOverwrite = false, cloudPassword = null, fallbackKeys = []) {
    this._ensureUnlocked();

    if (this._syncPromise) {
      return this._syncPromise;
    }

    this._syncPromise = (async () => {
      try {
        return await this._doSyncWithGitHub(githubService, token, owner, repo, branch, forceOverwrite, cloudPassword, fallbackKeys);
      } finally {
        this._syncPromise = null;
      }
    })();

    return this._syncPromise;
  }

  async _doSyncWithGitHub(githubService, token, owner, repo, branch = 'main', forceOverwrite = false, cloudPassword = null, fallbackKeys = []) {
    this._ensureUnlocked();

    // 1. Fetch remote file
    let remote = await githubService.fetchRemoteVault(token, owner, repo, branch);

    if (!remote.found) {
      // Remote does not exist yet. Push local vault.
      const localEnvelope = this.getEncryptedEnvelope();
      const pushRes = await githubService.pushRemoteVault(token, owner, repo, localEnvelope, branch, null);
      this.metadata.lastRemoteSha = pushRes.newSha;
      this.metadata.lastSyncedAt = this.metadata.updatedAt;
      this.metadata.isDirty = false;
      await this._persistVault();
      return {
        action: 'uploaded',
        message: 'Encrypted vault successfully uploaded to new remote file on GitHub.',
        sha: pushRes.newSha
      };
    }

    // If explicit forceOverwrite requested, replace remote directly with current vault
    if (forceOverwrite) {
      if (this.entries.length === 0) {
        throw new Error('Safety guard: Cannot overwrite remote backup with an empty local vault.');
      }
      const localEnvelope = this.getEncryptedEnvelope();
      let pushRes;
      try {
        pushRes = await githubService.pushRemoteVault(token, owner, repo, localEnvelope, branch, remote.sha);
      } catch (err) {
        if (err.code === 'SYNC_CONFLICT' || (err.message && err.message.includes('409'))) {
          const fresh = await githubService.fetchRemoteVault(token, owner, repo, branch);
          pushRes = await githubService.pushRemoteVault(token, owner, repo, localEnvelope, branch, fresh.sha);
        } else {
          throw err;
        }
      }
      this.metadata.lastRemoteSha = pushRes.newSha;
      this.metadata.lastSyncedAt = this.metadata.updatedAt;
      this.metadata.isDirty = false;
      await this._persistVault();
      return {
        action: 'overwritten',
        message: 'Remote backup on GitHub successfully updated with your current vault!',
        sha: pushRes.newSha
      };
    }

    // Remote exists. If SHA matches our last known SHA, nothing changed remotely.
    if (!cloudPassword && this.metadata.lastRemoteSha && this.metadata.lastRemoteSha === remote.sha) {
      if (!this.metadata.isDirty && this.metadata.lastSyncedAt && this.metadata.updatedAt <= this.metadata.lastSyncedAt) {
        return {
          action: 'in_sync',
          message: 'Encrypted vault is up to date with GitHub.',
          sha: remote.sha
        };
      }
      // Local changes exist; push local to remote
      const localEnvelope = this.getEncryptedEnvelope();
      let pushRes;
      try {
        pushRes = await githubService.pushRemoteVault(token, owner, repo, localEnvelope, branch, remote.sha);
      } catch (err) {
        if (err.code === 'SYNC_CONFLICT' || (err.message && err.message.includes('409'))) {
          remote = await githubService.fetchRemoteVault(token, owner, repo, branch);
        } else {
          throw err;
        }
      }
      if (pushRes) {
        this.metadata.lastRemoteSha = pushRes.newSha;
        this.metadata.lastSyncedAt = this.metadata.updatedAt;
        this.metadata.isDirty = false;
        await this._persistVault();
        return {
          action: 'updated_remote',
          message: 'Local changes pushed to GitHub successfully.',
          sha: pushRes.newSha
        };
      }
    }

    // Remote is different from our last known SHA or cloudPassword supplied.
    const candidates = [];
    const currentTokenKey = this.deriveVaultKey(token, owner, repo);
    if (currentTokenKey && !candidates.includes(currentTokenKey)) candidates.push(currentTokenKey);
    const legacyKey = this.deriveLegacyTokenKey(token, owner, repo);
    if (legacyKey && !candidates.includes(legacyKey)) candidates.push(legacyKey);

    if (this._cachedMasterPassword && !candidates.includes(this._cachedMasterPassword)) {
      candidates.push(this._cachedMasterPassword);
    }
    if (cloudPassword && typeof cloudPassword === 'string' && cloudPassword.trim()) {
      const cleanInput = cloudPassword.trim();
      const derivedFromInput = this.deriveVaultKey(cleanInput, owner, repo);
      if (derivedFromInput && !candidates.includes(derivedFromInput)) candidates.push(derivedFromInput);
      const legacyFromInput = this.deriveLegacyTokenKey(cleanInput, owner, repo);
      if (legacyFromInput && !candidates.includes(legacyFromInput)) candidates.push(legacyFromInput);
      if (!candidates.includes(cleanInput)) candidates.push(cleanInput);
    }
    if (Array.isArray(fallbackKeys)) {
      for (const fk of fallbackKeys) {
        if (!fk) continue;
        if (typeof fk === 'string') {
          const derivedFk = this.deriveVaultKey(fk, owner, repo);
          if (derivedFk && !candidates.includes(derivedFk)) candidates.push(derivedFk);
          const legacyFk = this.deriveLegacyTokenKey(fk, owner, repo);
          if (legacyFk && !candidates.includes(legacyFk)) candidates.push(legacyFk);
          if (!candidates.includes(fk)) candidates.push(fk);
        }
      }
    }

    let remoteDecrypted = null;
    let effectiveKey = null;
    for (const keyCandidate of candidates) {
      try {
        remoteDecrypted = await cryptoService.decryptVault(remote.envelope, keyCandidate);
        if (remoteDecrypted) {
          effectiveKey = keyCandidate;
          break;
        }
      } catch (e) {}
    }

    if (!remoteDecrypted) {
      const err = new Error(
        'Remote vault on GitHub could not be decrypted with your current GitHub key. ' +
        'It was likely encrypted with a different key.'
      );
      err.code = 'REMOTE_KEY_MISMATCH';
      throw err;
    }

    if (currentTokenKey) {
      this._cachedMasterPassword = currentTokenKey;
    } else if (effectiveKey) {
      this._cachedMasterPassword = effectiveKey;
    }

    const remoteEntries = Array.isArray(remoteDecrypted.entries) ? remoteDecrypted.entries : [];
    const mergedMap = new Map();

    for (const e of this.entries) {
      mergedMap.set(e.id, e);
    }

    let remoteNewerCount = 0;
    for (const re of remoteEntries) {
      if (!mergedMap.has(re.id)) {
        mergedMap.set(re.id, re);
        remoteNewerCount++;
      } else {
        const localE = mergedMap.get(re.id);
        const localTime = new Date(localE.updatedAt || 0).getTime();
        const remoteTime = new Date(re.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedMap.set(re.id, re);
          remoteNewerCount++;
        }
      }
    }

    this.entries = Array.from(mergedMap.values());
    this.metadata.updatedAt = new Date().toISOString();
    this.metadata.revision = Math.max(this.metadata.revision || 0, remoteDecrypted.metadata?.revision || 0) + 1;

    // Save locally first
    await this._persistVault();

    // Now push the merged vault up to GitHub (using current vault's key)
    const updatedLocalEnvelope = this.getEncryptedEnvelope();
    let pushRes;
    try {
      pushRes = await githubService.pushRemoteVault(token, owner, repo, updatedLocalEnvelope, branch, remote.sha);
    } catch (pushErr) {
      if (pushErr.code === 'SYNC_CONFLICT' || (pushErr.message && pushErr.message.includes('409'))) {
        // Retry once: fetch latest remote, re-merge, and retry push
        const fresh = await githubService.fetchRemoteVault(token, owner, repo, branch);
        if (fresh.found && fresh.envelope) {
          let freshDecrypted = null;
          const retryKeys = [effectiveKey, this._cachedMasterPassword, ...candidates];
          for (const rk of retryKeys) {
            if (!rk) continue;
            try {
              freshDecrypted = await cryptoService.decryptVault(fresh.envelope, rk);
              if (freshDecrypted) break;
            } catch (e) {}
          }
          if (freshDecrypted && Array.isArray(freshDecrypted.entries)) {
            for (const fre of freshDecrypted.entries) {
              if (!mergedMap.has(fre.id)) {
                mergedMap.set(fre.id, fre);
                remoteNewerCount++;
              } else {
                const loc = mergedMap.get(fre.id);
                if (new Date(fre.updatedAt || 0).getTime() > new Date(loc.updatedAt || 0).getTime()) {
                  mergedMap.set(fre.id, fre);
                }
              }
            }
            this.entries = Array.from(mergedMap.values());
            this.metadata.updatedAt = new Date().toISOString();
            await this._persistVault();
            const retryEnvelope = this.getEncryptedEnvelope();
            pushRes = await githubService.pushRemoteVault(token, owner, repo, retryEnvelope, branch, fresh.sha);
          }
        }
      }
      if (!pushRes) {
        throw pushErr;
      }
    }

    this.metadata.lastRemoteSha = pushRes.newSha;
    this.metadata.lastSyncedAt = this.metadata.updatedAt;
    this.metadata.isDirty = false;
    await this._persistVault();

    return {
      action: 'merged_and_synced',
      message: `Synchronized successfully. Merged ${remoteNewerCount} remote changes.`,
      sha: pushRes.newSha,
      remoteEntriesCount: remoteEntries.length
    };
  }

  /**
   * Restores and imports vault entries directly from GitHub remote backup.
   * Works whether the vault is currently locked, not_initialized, or unlocked.
   *
   * @param {object} githubService
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} [branch='main']
   * @param {string} [cloudPassword=null]
   * @returns {Promise<{ success: boolean, restoredCount: number, message: string }>}
   */
  async restoreFromCloud(githubService, token, owner, repo, branch = 'main', cloudPassword = null, fallbackKeys = []) {
    const remote = await githubService.fetchRemoteVault(token, owner, repo, branch);
    if (!remote.found || !remote.envelope) {
      throw new Error(`No remote vault backup found in repository "${owner}/${repo}".`);
    }

    // Build exhaustive list of key candidates to try
    const candidates = [];
    const currentTokenKey = this.deriveVaultKey(token, owner, repo);
    if (currentTokenKey && !candidates.includes(currentTokenKey)) candidates.push(currentTokenKey);
    const legacyKey = this.deriveLegacyTokenKey(token, owner, repo);
    if (legacyKey && !candidates.includes(legacyKey)) candidates.push(legacyKey);

    if (this._cachedMasterPassword && !candidates.includes(this._cachedMasterPassword)) {
      candidates.push(this._cachedMasterPassword);
    }
    if (cloudPassword && typeof cloudPassword === 'string' && cloudPassword.trim()) {
      const cleanInput = cloudPassword.trim();
      const derivedFromInput = this.deriveVaultKey(cleanInput, owner, repo);
      if (derivedFromInput && !candidates.includes(derivedFromInput)) candidates.push(derivedFromInput);
      const legacyFromInput = this.deriveLegacyTokenKey(cleanInput, owner, repo);
      if (legacyFromInput && !candidates.includes(legacyFromInput)) candidates.push(legacyFromInput);
      if (!candidates.includes(cleanInput)) candidates.push(cleanInput);
    }
    if (Array.isArray(fallbackKeys)) {
      for (const fk of fallbackKeys) {
        if (!fk) continue;
        if (typeof fk === 'string') {
          const derivedFk = this.deriveVaultKey(fk, owner, repo);
          if (derivedFk && !candidates.includes(derivedFk)) candidates.push(derivedFk);
          const legacyFk = this.deriveLegacyTokenKey(fk, owner, repo);
          if (legacyFk && !candidates.includes(legacyFk)) candidates.push(legacyFk);
          if (!candidates.includes(fk)) candidates.push(fk);
        }
      }
    }

    let remoteDecrypted = null;
    let effectiveKey = null;
    for (const keyCandidate of candidates) {
      try {
        remoteDecrypted = await cryptoService.decryptVault(remote.envelope, keyCandidate);
        if (remoteDecrypted) {
          effectiveKey = keyCandidate;
          break;
        }
      } catch (e) {}
    }

    if (!remoteDecrypted) {
      const mismatchErr = new Error('Incorrect cloud password. Could not decrypt the GitHub remote backup.');
      mismatchErr.code = 'REMOTE_KEY_MISMATCH';
      throw mismatchErr;
    }

    let remoteEntries = Array.isArray(remoteDecrypted.entries) ? remoteDecrypted.entries : [];
    const targetPassword = currentTokenKey || effectiveKey;

    // If HEAD vault has 0 entries, automatically inspect recent commit history for previous snapshots
    let restoredFromHistorySha = null;
    if (remoteEntries.length === 0 && githubService && typeof githubService.fetchCommitHistory === 'function') {
      try {
        const history = await githubService.fetchCommitHistory(token, owner, repo, 30);
        for (const commit of history) {
          if (commit.sha === remote.sha) continue;
          try {
            const histRemote = await githubService.fetchRemoteVaultAtCommit(token, owner, repo, commit.sha);
            if (histRemote && histRemote.found && histRemote.envelope) {
              for (const kc of candidates) {
                try {
                  const histDec = await cryptoService.decryptVault(histRemote.envelope, kc);
                  if (histDec && Array.isArray(histDec.entries) && histDec.entries.length > 0) {
                    remoteEntries = histDec.entries;
                    restoredFromHistorySha = commit.sha;
                    break;
                  }
                } catch (e) {}
              }
              if (remoteEntries.length > 0) break;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (this.state !== VAULT_STATES.UNLOCKED) {
      this.entries = remoteEntries;
      this.metadata = Object.assign({}, remoteDecrypted.metadata || {}, {
        lastRemoteSha: remote.sha,
        updatedAt: new Date().toISOString()
      });
      this._cachedMasterPassword = targetPassword;
      this.state = VAULT_STATES.UNLOCKED;
      await this._persistVault();

      if (restoredFromHistorySha) {
        try {
          const pushRes = await githubService.pushRemoteVault(token, owner, repo, this.getEncryptedEnvelope(), branch, remote.sha);
          this.metadata.lastRemoteSha = pushRes.newSha;
          await this._persistVault();
        } catch (e) {}
      }

      return {
        success: true,
        restoredCount: remoteEntries.length,
        message: `Successfully restored ${remoteEntries.length} passwords from GitHub Cloud!`
      };
    }

    // Merge into currently unlocked vault
    const mergedMap = new Map();
    for (const e of this.entries) {
      mergedMap.set(e.id, e);
    }

    let addedCount = 0;
    for (const re of remoteEntries) {
      if (!mergedMap.has(re.id)) {
        mergedMap.set(re.id, re);
        addedCount++;
      } else {
        const localE = mergedMap.get(re.id);
        const localTime = new Date(localE.updatedAt || 0).getTime();
        const remoteTime = new Date(re.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          mergedMap.set(re.id, re);
          addedCount++;
        }
      }
    }

    this.entries = Array.from(mergedMap.values());
    this.metadata.updatedAt = new Date().toISOString();
    this.metadata.lastRemoteSha = remote.sha;
    this._cachedMasterPassword = targetPassword;
    await this._persistVault();

    if (restoredFromHistorySha && addedCount > 0) {
      try {
        const pushRes = await githubService.pushRemoteVault(token, owner, repo, this.getEncryptedEnvelope(), branch, remote.sha);
        this.metadata.lastRemoteSha = pushRes.newSha;
        await this._persistVault();
      } catch (e) {}
    }

    return {
      success: true,
      restoredCount: remoteEntries.length,
      mergedCount: addedCount,
      message: `Successfully synchronized ${remoteEntries.length} passwords from GitHub Cloud!`
    };
  }

  /**
   * Restores vault entries from a specific historical GitHub commit.
   * Decrypts the historical envelope using supplied password/key, caches the key,
   * merges/restores the entries, persists locally, and pushes the restored vault to HEAD.
   *
   * @param {object} githubService
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} commitSha
   * @param {string|null} [suppliedPassword=null]
   * @param {string[]} [fallbackKeys=[]]
   * @returns {Promise<{ success: boolean, restoredCount: number, message: string }>}
   */
  async restoreFromCommit(githubService, token, owner, repo, commitSha, suppliedPassword = null, fallbackKeys = []) {
    const remote = await githubService.fetchRemoteVaultAtCommit(token, owner, repo, commitSha);
    if (!remote.found || !remote.envelope) {
      throw new Error(`No vault backup found at commit ${commitSha.substring(0, 7)}.`);
    }

    // Build key candidates
    const candidates = [];
    const currentTokenKey = this.deriveVaultKey(token, owner, repo);
    if (currentTokenKey && !candidates.includes(currentTokenKey)) candidates.push(currentTokenKey);
    const legacyKey = this.deriveLegacyTokenKey(token, owner, repo);
    if (legacyKey && !candidates.includes(legacyKey)) candidates.push(legacyKey);

    if (this._cachedMasterPassword && !candidates.includes(this._cachedMasterPassword)) {
      candidates.push(this._cachedMasterPassword);
    }
    if (suppliedPassword && typeof suppliedPassword === 'string' && suppliedPassword.trim()) {
      const cleanInput = suppliedPassword.trim();
      const derivedFromInput = this.deriveVaultKey(cleanInput, owner, repo);
      if (derivedFromInput && !candidates.includes(derivedFromInput)) candidates.push(derivedFromInput);
      const legacyFromInput = this.deriveLegacyTokenKey(cleanInput, owner, repo);
      if (legacyFromInput && !candidates.includes(legacyFromInput)) candidates.push(legacyFromInput);
      if (!candidates.includes(cleanInput)) candidates.push(cleanInput);
    }
    if (Array.isArray(fallbackKeys)) {
      for (const fk of fallbackKeys) {
        if (!fk) continue;
        if (typeof fk === 'string') {
          const derivedFk = this.deriveVaultKey(fk, owner, repo);
          if (derivedFk && !candidates.includes(derivedFk)) candidates.push(derivedFk);
          const legacyFk = this.deriveLegacyTokenKey(fk, owner, repo);
          if (legacyFk && !candidates.includes(legacyFk)) candidates.push(legacyFk);
          if (!candidates.includes(fk)) candidates.push(fk);
        }
      }
    }

    let decrypted = null;
    let effectiveKey = null;
    for (const keyCandidate of candidates) {
      try {
        decrypted = await cryptoService.decryptVault(remote.envelope, keyCandidate);
        if (decrypted) {
          effectiveKey = keyCandidate;
          break;
        }
      } catch (e) {}
    }

    if (!decrypted) {
      const mismatchErr = new Error(`Could not decrypt backup from commit ${commitSha.substring(0, 7)}. Please check your master password.`);
      mismatchErr.code = 'REMOTE_KEY_MISMATCH';
      throw mismatchErr;
    }

    const remoteEntries = Array.isArray(decrypted.entries) ? decrypted.entries : [];
    const targetPassword = currentTokenKey || effectiveKey || this._cachedMasterPassword;

    // Merge or replace entries
    const mergedMap = new Map();
    for (const e of this.entries) {
      mergedMap.set(e.id, e);
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const item of remoteEntries) {
      const { valid, sanitized } = validateEntry(item);
      if (valid) {
        if (!mergedMap.has(sanitized.id)) {
          mergedMap.set(sanitized.id, sanitized);
          addedCount++;
        } else {
          const existing = mergedMap.get(sanitized.id);
          const existingTime = new Date(existing.updatedAt || 0).getTime();
          const remoteTime = new Date(sanitized.updatedAt || 0).getTime();
          if (remoteTime >= existingTime) {
            mergedMap.set(sanitized.id, sanitized);
            updatedCount++;
          }
        }
      }
    }

    this.entries = Array.from(mergedMap.values());
    this.metadata = Object.assign({}, decrypted.metadata || {}, {
      revision: (this.metadata.revision || 0) + 1,
      updatedAt: new Date().toISOString()
    });
    this._cachedMasterPassword = targetPassword;
    this.state = VAULT_STATES.UNLOCKED;

    await this._persistVault();

    // Automatically push restored vault to GitHub HEAD with current token key
    let pushNotice = '';
    try {
      const headRemote = await githubService.fetchRemoteVault(token, owner, repo, 'main');
      const currentHeadSha = headRemote.found ? headRemote.sha : null;
      const pushRes = await githubService.pushRemoteVault(
        token,
        owner,
        repo,
        this.getEncryptedEnvelope(),
        'main',
        currentHeadSha
      );
      this.metadata.lastRemoteSha = pushRes.newSha;
      this.metadata.lastSyncedAt = new Date().toISOString();
      await this._persistVault();
      pushNotice = ' and synced to GitHub HEAD';
    } catch (pushErr) {
      pushNotice = ` (saved locally; sync notice: ${pushErr.message})`;
    }

    return {
      success: true,
      restoredCount: remoteEntries.length,
      totalCount: this.entries.length,
      added: addedCount,
      updated: updatedCount,
      message: `Successfully restored ${remoteEntries.length} password(s) from commit ${commitSha.substring(0, 7)}${pushNotice}!`
    };
  }

  /**
   * Internal helper to persist encrypted vault to disk atomically.
   */
  async _persistVault() {
    if (!this._cachedMasterPassword) {
      throw new Error('Cannot persist vault: missing encryption password in memory.');
    }

    const payload = {
      entries: this.entries,
      metadata: this.metadata
    };

    const envelope = await cryptoService.encryptVault(payload, this._cachedMasterPassword, {
      entryCount: this.entries.length,
      revision: this.metadata.revision,
      updatedAt: this.metadata.updatedAt
    });

    const serialized = JSON.stringify(envelope, null, 2);
    fileStorage.writeAtomicSync(this.vaultFilePath, serialized);
  }

  _ensureUnlocked() {
    if (this.state !== VAULT_STATES.UNLOCKED) {
      throw new Error('Vault is currently locked. Please unlock to access entries.');
    }
  }
}

module.exports = {
  VaultService,
  VAULT_STATES
};

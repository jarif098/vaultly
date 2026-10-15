/**
 * Vaultly - Settings & Secret Storage Service
 * Manages user preferences and securely protects secrets (such as GitHub PAT)
 * using Electron's native safeStorage API backed by Windows DPAPI.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const fileStorage = require('../utils/file-storage');

const DEFAULT_SETTINGS = {
  theme: 'cream',
  accentColor: '#FFE500',
  lockTimeoutMinutes: 5,
  clipboardClearSeconds: 30,
  startMinimized: false,
  generatorDefaults: {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true
  },
  github: {
    user: null, // { login, name, avatarUrl, email }
    owner: '',
    repo: '',
    branch: 'main',
    autoSync: true,
    lastSyncTimestamp: null,
    lastSyncStatus: 'not_configured'
  },
  mode: 'unconfigured' // 'unconfigured' | 'local' | 'github'
};

class SettingsService {
  /**
   * @param {string} userDataDir
   * @param {object} [safeStorageModule] - Electron safeStorage object
   */
  constructor(userDataDir, safeStorageModule = null) {
    this.userDataDir = userDataDir;
    this.safeStorage = safeStorageModule;
    this.settingsFilePath = path.join(userDataDir, 'settings.json');
    this.secretsFilePath = path.join(userDataDir, 'secrets.bin');
    this.settings = this.loadSettings();
  }

  /**
   * Returns whether OS-level safeStorage encryption is available.
   * @returns {boolean}
   */
  isSafeStorageAvailable() {
    return Boolean(this.safeStorage && typeof this.safeStorage.isEncryptionAvailable === 'function' && this.safeStorage.isEncryptionAvailable());
  }

  /**
   * Loads persisted settings or initializes defaults.
   * @returns {object}
   */
  loadSettings() {
    const loaded = fileStorage.readJsonSync(this.settingsFilePath, null);
    if (!loaded) {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    // Deep merge with defaults to ensure all keys exist
    const merged = Object.assign({}, DEFAULT_SETTINGS, loaded);
    merged.generatorDefaults = Object.assign({}, DEFAULT_SETTINGS.generatorDefaults, loaded.generatorDefaults);
    merged.github = Object.assign({}, DEFAULT_SETTINGS.github, loaded.github);
    return merged;
  }

  /**
   * Saves settings to disk atomically.
   * @param {object} newSettings
   * @returns {object} updated settings
   */
  saveSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') {
      throw new Error('Invalid settings object.');
    }

    if (newSettings.theme && ['cream', 'dark', 'cyber', 'light', 'system'].includes(newSettings.theme)) {
      this.settings.theme = newSettings.theme;
    }
    if (newSettings.accentColor && /^#[0-9a-fA-F]{6}$/.test(newSettings.accentColor)) {
      this.settings.accentColor = newSettings.accentColor;
    }
    if (newSettings.lockTimeoutMinutes !== undefined) {
      const minutes = Number(newSettings.lockTimeoutMinutes);
      this.settings.lockTimeoutMinutes = isNaN(minutes) ? 5 : Math.max(0, Math.min(120, minutes));
    }
    if (newSettings.clipboardClearSeconds !== undefined) {
      const seconds = Number(newSettings.clipboardClearSeconds);
      this.settings.clipboardClearSeconds = isNaN(seconds) ? 30 : Math.max(0, Math.min(300, seconds));
    }
    if (newSettings.startMinimized !== undefined) {
      this.settings.startMinimized = Boolean(newSettings.startMinimized);
    }
    if (newSettings.generatorDefaults && typeof newSettings.generatorDefaults === 'object') {
      this.settings.generatorDefaults = Object.assign({}, this.settings.generatorDefaults, newSettings.generatorDefaults);
    }
    if (newSettings.github && typeof newSettings.github === 'object') {
      this.settings.github = Object.assign({}, this.settings.github, newSettings.github);
    }
    if (newSettings.mode && ['unconfigured', 'local', 'github'].includes(newSettings.mode)) {
      this.settings.mode = newSettings.mode;
    }

    fileStorage.writeAtomicSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2));
    return this.getSanitizedSettings();
  }

  /**
   * Internal helper to load the decrypted secrets dictionary.
   * @returns {object}
   */
  _loadSecretsMap() {
    if (!fs.existsSync(this.secretsFilePath)) {
      return {};
    }

    try {
      const secretData = fs.readFileSync(this.secretsFilePath);
      let decrypted = null;

      if (this.isSafeStorageAvailable()) {
        try {
          decrypted = this.safeStorage.decryptString(secretData);
        } catch (decryptErr) {}
      }

      if (!decrypted) {
        try {
          const parsed = JSON.parse(secretData.toString('utf8'));
          if (parsed.unprotected && parsed.data) {
            decrypted = Buffer.from(parsed.data, 'base64').toString('utf8');
          }
        } catch (e) {}
      }

      if (!decrypted) return {};

      // If stored as JSON map
      try {
        const parsedMap = JSON.parse(decrypted);
        if (parsedMap && typeof parsedMap === 'object') {
          return parsedMap;
        }
      } catch (e) {}

      // Legacy plain token string format
      return { githubToken: decrypted };
    } catch (err) {
      return {};
    }
  }

  /**
   * Internal helper to persist secrets dictionary atomically.
   * @param {object} map
   * @param {boolean} [allowUnsafeFallback=true]
   * @returns {boolean}
   */
  _saveSecretsMap(map, allowUnsafeFallback = true) {
    const serialized = JSON.stringify(map);

    if (this.isSafeStorageAvailable()) {
      const encryptedBuffer = this.safeStorage.encryptString(serialized);
      fileStorage.writeAtomicSync(this.secretsFilePath, encryptedBuffer);
      return true;
    }

    if (allowUnsafeFallback) {
      const fallbackPayload = Buffer.from(JSON.stringify({
        unprotected: true,
        data: Buffer.from(serialized, 'utf8').toString('base64')
      }), 'utf8');
      fileStorage.writeAtomicSync(this.secretsFilePath, fallbackPayload);
      return true;
    }

    return false;
  }

  /**
   * Stores the GitHub Personal Access Token using Electron safeStorage.
   *
   * @param {string} token
   * @param {boolean} [allowUnsafeFallback=false]
   * @returns {{ success: boolean, safeStorageUsed: boolean }}
   */
  saveGitHubToken(token, allowUnsafeFallback = false) {
    const map = this._loadSecretsMap();
    if (!token || typeof token !== 'string') {
      delete map.githubToken;
    } else {
      const trimmedToken = token.trim();
      if (trimmedToken.length === 0) {
        delete map.githubToken;
      } else {
        if (map.githubToken && map.githubToken !== trimmedToken) {
          if (!Array.isArray(map.previousTokens)) map.previousTokens = [];
          if (!map.previousTokens.includes(map.githubToken)) {
            map.previousTokens.push(map.githubToken);
          }
        }
        map.githubToken = trimmedToken;
      }
    }

    const ok = this._saveSecretsMap(map, allowUnsafeFallback);
    return { success: ok, safeStorageUsed: this.isSafeStorageAvailable() };
  }

  /**
   * Retrieves historical GitHub tokens previously used on this PC.
   * @returns {string[]}
   */
  getPreviousTokens() {
    const map = this._loadSecretsMap();
    return Array.isArray(map.previousTokens) ? map.previousTokens : [];
  }

  /**
   * Retrieves the stored GitHub Personal Access Token.
   * @returns {string|null}
   */
  getGitHubToken() {
    const map = this._loadSecretsMap();
    return map.githubToken || null;
  }

  /**
   * Clears the stored GitHub token.
   */
  clearGitHubToken() {
    const map = this._loadSecretsMap();
    delete map.githubToken;
    this._saveSecretsMap(map, true);
  }

  /**
   * Completely deletes secrets storage file (DPAPI secrets.bin).
   */
  clearAllSecrets() {
    if (fs.existsSync(this.secretsFilePath)) {
      try {
        fs.unlinkSync(this.secretsFilePath);
      } catch (e) {}
    }
  }

  /**
   * Gets or generates a local 256-bit vault key protected by Windows DPAPI safeStorage.
   * Used for offline/local vault mode without GitHub credentials.
   * @returns {string} 64-char hex key
   */
  getOrCreateLocalVaultKey() {
    const map = this._loadSecretsMap();
    if (map.localVaultKey && typeof map.localVaultKey === 'string' && map.localVaultKey.length === 64) {
      return map.localVaultKey;
    }

    const crypto = require('crypto');
    const newKey = crypto.randomBytes(32).toString('hex');
    map.localVaultKey = newKey;
    this._saveSecretsMap(map, true);
    return newKey;
  }

  /**
   * Checks whether the user has configured GitHub credentials on this machine.
   * @returns {boolean}
   */
  hasConfiguredGitHub() {
    const token = this.getGitHubToken();
    const owner = this.settings?.github?.owner;
    const repo = this.settings?.github?.repo;
    return Boolean(
      token && typeof token === 'string' && token.trim().length > 0 &&
      owner && typeof owner === 'string' && owner.trim().length > 0 &&
      repo && typeof repo === 'string' && repo.trim().length > 0
    );
  }

  /**
   * Returns current GitHub credentials and repo configuration.
   * @returns {{ token: string|null, owner: string, repo: string, branch: string, autoSync: boolean }}
   */
  getGitHubCredentials() {
    return {
      token: this.getGitHubToken(),
      owner: (this.settings?.github?.owner || '').trim(),
      repo: (this.settings?.github?.repo || '').trim(),
      branch: (this.settings?.github?.branch || 'main').trim(),
      autoSync: this.settings?.github?.autoSync !== false
    };
  }

  /**
   * Securely saves an SSO-linked vault password using DPAPI / safeStorage.
   * @param {string} provider
   * @param {string} identifier
   * @param {string} masterPassword
   * @returns {{ success: boolean }}
   */
  linkSsoPassword(provider, identifier, masterPassword) {
    if (!provider || !identifier || !masterPassword) {
      return { success: false, error: 'Missing parameters.' };
    }
    const key = `${provider}:${identifier}`.toLowerCase();
    const linksPath = path.join(this.userDataDir, 'sso_links.bin');
    let links = {};
    if (fs.existsSync(linksPath)) {
      try {
        const raw = fs.readFileSync(linksPath);
        if (this.isSafeStorageAvailable()) {
          links = JSON.parse(this.safeStorage.decryptString(raw));
        } else {
          links = JSON.parse(Buffer.from(raw.toString('utf8'), 'base64').toString('utf8'));
        }
      } catch (e) {
        links = {};
      }
    }
    links[key] = masterPassword;
    const jsonStr = JSON.stringify(links);
    if (this.isSafeStorageAvailable()) {
      const encrypted = this.safeStorage.encryptString(jsonStr);
      fileStorage.writeAtomicSync(linksPath, encrypted);
    } else {
      const b64 = Buffer.from(jsonStr, 'utf8').toString('base64');
      fileStorage.writeAtomicSync(linksPath, Buffer.from(b64, 'utf8'));
    }
    return { success: true };
  }

  /**
   * Retrieves an SSO-linked vault password if one exists.
   * @param {string} provider
   * @param {string} identifier
   * @returns {string|null}
   */
  getSsoLinkedPassword(provider, identifier) {
    if (!provider || !identifier) return null;
    const key = `${provider}:${identifier}`.toLowerCase();
    const linksPath = path.join(this.userDataDir, 'sso_links.bin');
    if (!fs.existsSync(linksPath)) return null;
    try {
      const raw = fs.readFileSync(linksPath);
      let links = {};
      if (this.isSafeStorageAvailable()) {
        links = JSON.parse(this.safeStorage.decryptString(raw));
      } else {
        links = JSON.parse(Buffer.from(raw.toString('utf8'), 'base64').toString('utf8'));
      }
      return links[key] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Retrieves all stored SSO passwords from previous sessions for seamless migration.
   * @returns {string[]}
   */
  getAllStoredPasswords() {
    const passwords = new Set();
    const map = this._loadSecretsMap();
    if (map.localVaultKey) passwords.add(map.localVaultKey);
    if (map.githubToken) passwords.add(map.githubToken);
    if (Array.isArray(map.previousTokens)) {
      for (const tok of map.previousTokens) {
        if (tok && typeof tok === 'string') passwords.add(tok);
      }
    }

    const linksPath = path.join(this.userDataDir, 'sso_links.bin');
    if (fs.existsSync(linksPath)) {
      try {
        const raw = fs.readFileSync(linksPath);
        let links = {};
        if (this.isSafeStorageAvailable()) {
          links = JSON.parse(this.safeStorage.decryptString(raw));
        } else {
          links = JSON.parse(Buffer.from(raw.toString('utf8'), 'base64').toString('utf8'));
        }
        for (const val of Object.values(links)) {
          if (val && typeof val === 'string') passwords.add(val);
        }
      } catch (e) {}
    }
    return Array.from(passwords);
  }

  /**
   * Returns settings safe to send to renderer (never includes plaintext token).
   * @returns {object}
   */
  getSanitizedSettings() {
    const token = this.getGitHubToken();
    const hasToken = Boolean(token && typeof token === 'string' && token.trim().length > 0);
    return Object.assign({}, this.settings, {
      hasGitHubToken: hasToken,
      safeStorageAvailable: this.isSafeStorageAvailable()
    });
  }
}

module.exports = {
  SettingsService,
  DEFAULT_SETTINGS
};

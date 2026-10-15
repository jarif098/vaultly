/**
 * Vaultly - Preload Script
 * Exposes a strictly scoped, type-safe API to the renderer process via contextBridge.
 * Enforces context isolation and zero Node.js integration in the DOM.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vaultlyApi', {
  // Vault Lifecycle & State
  getStatus: () => ipcRenderer.invoke('vault:get-status'),
  createVault: (masterPassword) => ipcRenderer.invoke('vault:create', masterPassword),
  unlockVault: (masterPassword) => ipcRenderer.invoke('vault:unlock', masterPassword),
  lockVault: () => ipcRenderer.invoke('vault:lock'),
  resetVault: () => ipcRenderer.invoke('vault:reset'),
  resetAppData: () => ipcRenderer.invoke('app:reset-data'),
  changeMasterPassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('vault:change-password', { currentPassword, newPassword }),

  // Vault CRUD
  getEntries: (options) => ipcRenderer.invoke('vault:get-entries', options),
  addEntry: (entry) => ipcRenderer.invoke('vault:add-entry', entry),
  updateEntry: (id, updates) => ipcRenderer.invoke('vault:update-entry', { id, updates }),
  deleteEntry: (id) => ipcRenderer.invoke('vault:delete-entry', id),
  toggleFavorite: (id) => ipcRenderer.invoke('vault:toggle-favorite', id),
  checkDuplicate: (service, username, currentId) =>
    ipcRenderer.invoke('vault:check-duplicate', { service, username, currentId }),

  // Backup & Restore
  exportBackupFile: (password) => ipcRenderer.invoke('vault:export-backup-file', password),
  restoreBackupFile: (password) => ipcRenderer.invoke('vault:restore-backup-file', password),

  // Cryptographic Password Generation
  generatePassword: (options) => ipcRenderer.invoke('generator:generate', options),
  evaluateStrength: (password) => ipcRenderer.invoke('generator:evaluate', password),

  // Secure Clipboard
  copyToClipboard: (text, isSensitive = false) =>
    ipcRenderer.invoke('clipboard:copy', { text, isSensitive }),

  // Settings & OS Secret Storage
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveGitHubToken: (token, allowUnsafeFallback) =>
    ipcRenderer.invoke('settings:save-github-token', { token, allowUnsafeFallback }),
  clearGitHubToken: () => ipcRenderer.invoke('settings:clear-github-token'),

  // GitHub Synchronization
  testGitHubConnection: (owner, repo) =>
    ipcRenderer.invoke('github:test-connection', { owner, repo }),
  createPrivateGitHubRepo: (repoName) =>
    ipcRenderer.invoke('github:create-private-repo', repoName),
  syncWithGitHub: (forceOverwrite = false, cloudPassword = null) =>
    ipcRenderer.invoke('github:sync', { forceOverwrite: Boolean(forceOverwrite), cloudPassword }),
  restoreFromCloud: (cloudPassword = null) =>
    ipcRenderer.invoke('github:restore-cloud', { cloudPassword }),
  checkCloudBackup: () =>
    ipcRenderer.invoke('github:check-cloud-backup'),
  getGitHubBackupHistory: () =>
    ipcRenderer.invoke('github:get-backup-history'),
  restoreFromGitHubCommit: (commitSha, password) =>
    ipcRenderer.invoke('github:restore-commit', { commitSha, password }),

  // GitHub-First Authentication (Zero-Knowledge Sync)
  checkAuthStatus: () => ipcRenderer.invoke('auth:check-status'),
  loginWithGitHubDetails: (details) => ipcRenderer.invoke('auth:github-login', details),
  saveLocal: () => ipcRenderer.invoke('auth:save-local'),
  disconnectGitHub: () => ipcRenderer.invoke('auth:github-logout'),

  // Browser Authentication (Legacy / Fallback)
  loginWithBrowser: (provider, isSetup) =>
    ipcRenderer.invoke('auth:browser-login', { provider, isSetup }),
  cancelBrowserLogin: () =>
    ipcRenderer.invoke('auth:cancel-browser-login'),
  onGitHubCode: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('auth:github-code', listener);
    return () => ipcRenderer.removeListener('auth:github-code', listener);
  },
  linkSsoAccount: (provider, email, masterPassword) =>
    ipcRenderer.invoke('auth:link-sso', { provider, email, masterPassword }),
  getSsoLinkedPassword: (provider, email) =>
    ipcRenderer.invoke('auth:get-sso-link', { provider, email }),

  // External Links & System
  openExternalUrl: (url) => ipcRenderer.invoke('system:open-url', url),
  recordActivity: () => ipcRenderer.send('system:user-activity'),

  // Custom Brutalist Window Controls & DevTools
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  toggleDevTools: () => ipcRenderer.invoke('window:toggle-devtools'),
  onWindowStateChange: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('window:state-changed', listener);
    return () => ipcRenderer.removeListener('window:state-changed', listener);
  },

  // Event Listeners
  onAutoLocked: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('vault:auto-locked', listener);
    return () => ipcRenderer.removeListener('vault:auto-locked', listener);
  },
  onVaultSynced: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('vault:synced', listener);
    return () => ipcRenderer.removeListener('vault:synced', listener);
  }
});

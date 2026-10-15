/**
 * Vaultly - Main Electron Process
 * Initializes secure BrowserWindow, binds scoped IPC handlers, coordinates
 * crypto/vault/settings/GitHub services, and manages auto-lock and clipboard security.
 */

'use strict';

const { app, BrowserWindow, ipcMain, clipboard, dialog, shell, safeStorage, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure Windows taskbar groups and shows custom app icon instead of default Electron atom
if (process.platform === 'win32') {
  app.setAppUserModelId('com.vaultly.desktop');
}

// Disable standard Chromium application menu globally
Menu.setApplicationMenu(null);

const { VaultService, VAULT_STATES } = require('./src/services/vault');
const { SettingsService, DEFAULT_SETTINGS } = require('./src/services/settings');
const { GitHubSyncService } = require('./src/services/github');
const { BrowserAuthService } = require('./src/services/browser-auth');
const pwdGen = require('./src/services/password-generator');
const validation = require('./src/utils/validation');

// Enforce single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let vaultService = null;
let settingsService = null;
let githubService = null;
let browserAuthService = new BrowserAuthService();
let activeGitHubAuth = null;

// Security timers
let lastActivityTime = Date.now();
let autoLockInterval = null;
let clipboardClearTimer = null;
let lastCopiedSecret = null;

function resetActivity() {
  lastActivityTime = Date.now();
}

function startAutoLockMonitor() {
  if (autoLockInterval) clearInterval(autoLockInterval);

  autoLockInterval = setInterval(() => {
    if (!vaultService || vaultService.state !== VAULT_STATES.UNLOCKED) return;

    const timeoutMinutes = settingsService.settings.lockTimeoutMinutes;
    if (!timeoutMinutes || timeoutMinutes <= 0) return; // 0 = Never auto-lock

    const elapsedMs = Date.now() - lastActivityTime;
    if (elapsedMs >= timeoutMinutes * 60 * 1000) {
      vaultService.lockVault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vault:auto-locked', {
          reason: 'inactivity',
          minutes: timeoutMinutes
        });
      }
    }
  }, 10000); // Check every 10 seconds
}

function createWindow() {
  const icoPath = path.join(__dirname, 'assets', 'icons', 'app-icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icons', 'app-icon.png');
  const iconPath = fs.existsSync(icoPath) ? icoPath : (fs.existsSync(pngPath) ? pngPath : undefined);
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1140,
    height: 750,
    minWidth: 880,
    minHeight: 580,
    backgroundColor: '#F5EFEB',
    title: 'Vaultly',
    icon: appIcon || iconPath,
    show: false,
    frame: false, // Custom frameless window for brutalist desktop title bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Track window maximization state for titlebar icon sync
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: true });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: false });
    }
  });

  const isDev = !app.isPackaged || process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

  // Developer shortcuts (F12, Ctrl+Shift+I for DevTools; F5, Ctrl+R for reload)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }

    if (isDev && (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r'))) {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  if (isDev || process.argv.includes('--test-startup')) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Renderer Console]: ${message}`);
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--test-startup')) {
      console.log('Automated startup test: MainWindow successfully ready-to-show!');
      setTimeout(() => {
        app.quit();
      }, 1000);
      return;
    }

    if (settingsService.settings.startMinimized) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }

    // Automatically open DevTools if explicitly launched in dev mode
    if (isDev && process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools({ mode: 'right' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');

  // Initialize modular services
  settingsService = new SettingsService(userDataPath, safeStorage);
  vaultService = new VaultService(userDataPath);
  githubService = new GitHubSyncService({ vaultFileName: 'vaultly-vault.enc.json' });

  registerIpcHandlers();
  startAutoLockMonitor();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (autoLockInterval) clearInterval(autoLockInterval);
  if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
  if (vaultService) vaultService.lockVault();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (vaultService) vaultService.lockVault();
});

// IPC Handler Registration
function registerIpcHandlers() {
  // --- Vault Lifecycle ---
  ipcMain.handle('vault:get-status', async () => {
    resetActivity();
    return vaultService.getStatus();
  });

  ipcMain.handle('vault:create', async (event, masterPassword) => {
    resetActivity();
    return vaultService.createVault(masterPassword);
  });

  ipcMain.handle('vault:unlock', async (event, masterPassword) => {
    resetActivity();
    return vaultService.unlockVault(masterPassword);
  });

  ipcMain.handle('vault:lock', async () => {
    resetActivity();
    return vaultService.lockVault();
  });

  ipcMain.handle('vault:reset', async () => {
    resetActivity();
    return vaultService.resetVault();
  });

  ipcMain.handle('app:reset-data', async () => {
    resetActivity();
    try {
      // 1. Reset vault service (unlinks vault.enc.json and clears in-memory keys)
      vaultService.resetVault();

      // 2. Clear DPAPI secrets (secrets.bin) — wipes token, localVaultKey, previousTokens
      settingsService.clearAllSecrets();

      // 3. Reset settings to default (settings.json)
      settingsService.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      settingsService.saveSettings(settingsService.settings);

      // 4. Remove SSO links if any
      const ssoPath = path.join(app.getPath('userData'), 'sso_links.bin');
      if (fs.existsSync(ssoPath)) {
        try { fs.unlinkSync(ssoPath); } catch (e) {}
      }

      // 5. Reload the renderer so the app starts completely fresh
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reload();
          }
        }, 600); // Short delay so the toast "success" notification is visible first
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('vault:change-password', async (event, { currentPassword, newPassword }) => {
    resetActivity();
    return vaultService.changeMasterPassword(currentPassword, newPassword);
  });

  // --- Vault CRUD ---
  ipcMain.handle('vault:get-entries', async (event, options) => {
    resetActivity();
    return vaultService.getEntries(options);
  });

  ipcMain.handle('vault:add-entry', async (event, entry) => {
    resetActivity();
    return vaultService.addEntry(entry);
  });

  ipcMain.handle('vault:update-entry', async (event, { id, updates }) => {
    resetActivity();
    return vaultService.updateEntry(id, updates);
  });

  ipcMain.handle('vault:delete-entry', async (event, id) => {
    resetActivity();
    return vaultService.deleteEntry(id);
  });

  ipcMain.handle('vault:toggle-favorite', async (event, id) => {
    resetActivity();
    return vaultService.toggleFavorite(id);
  });

  ipcMain.handle('vault:check-duplicate', async (event, { service, username, currentId }) => {
    resetActivity();
    return vaultService.hasDuplicate(service, username, currentId);
  });

  // --- Backup & Restore (.vaulty / .vaultly) ---
  ipcMain.handle('vault:export-backup-file', async (event, exportPassword) => {
    resetActivity();
    const backupJson = await vaultService.exportEncryptedBackup(exportPassword);

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Encrypted .vaulty Backup',
      defaultPath: `vault-backup-${new Date().toISOString().slice(0, 10)}.vaulty`,
      filters: [
        { name: 'Vaulty Backup (*.vaulty, *.vaultly)', extensions: ['vaulty', 'vaultly'] },
        { name: 'JSON Backup (*.json)', extensions: ['json'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, backupJson, 'utf8');
    return { success: true, filePath };
  });

  ipcMain.handle('vault:restore-backup-file', async (event, backupPassword) => {
    resetActivity();
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select .vaulty Backup to Import',
      properties: ['openFile'],
      filters: [
        { name: 'Vaulty Backup (*.vaulty, *.vaultly, *.json)', extensions: ['vaulty', 'vaultly', 'json'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const backupContent = fs.readFileSync(filePaths[0], 'utf8');
    const fallbackKeys = settingsService.getAllStoredPasswords();
    const localKey = settingsService.getOrCreateLocalVaultKey();
    if (localKey && !fallbackKeys.includes(localKey)) fallbackKeys.push(localKey);
    fallbackKeys.push('vaultly-portable-backup-open-v1');

    // Also include profile keys for configured and known GitHub accounts
    const gh = settingsService.settings.github || {};
    if (gh.owner && gh.repo) {
      const currentToken = settingsService.getGitHubToken();
      const profileKey = vaultService.deriveVaultKey(currentToken, gh.owner, gh.repo);
      if (profileKey && !fallbackKeys.includes(profileKey)) fallbackKeys.push(profileKey);
      const legacyKey = vaultService.deriveLegacyTokenKey(currentToken, gh.owner, gh.repo);
      if (legacyKey && !fallbackKeys.includes(legacyKey)) fallbackKeys.push(legacyKey);
    }

    const prevTokens = settingsService.getPreviousTokens();
    for (const pt of prevTokens) {
      if (gh.owner && gh.repo) {
        const pk = vaultService.deriveVaultKey(pt, gh.owner, gh.repo);
        if (pk && !fallbackKeys.includes(pk)) fallbackKeys.push(pk);
        const lk = vaultService.deriveLegacyTokenKey(pt, gh.owner, gh.repo);
        if (lk && !fallbackKeys.includes(lk)) fallbackKeys.push(lk);
      }
    }

    // If vault is not yet unlocked or initialized, initialize/unlock with local key
    if (vaultService.state !== VAULT_STATES.UNLOCKED) {
      if (fs.existsSync(vaultService.vaultFilePath)) {
        try {
          await vaultService.unlockWithDerivedKey(localKey);
        } catch (e) {
          await vaultService.createWithDerivedKey(localKey);
        }
      } else {
        await vaultService.createWithDerivedKey(localKey);
      }
      settingsService.saveSettings({ mode: 'local' });
    }

    const result = await vaultService.restoreEncryptedBackup(backupContent, backupPassword, fallbackKeys);
    return Object.assign({ filePath: filePaths[0] }, result);
  });

  // --- Password Generator ---
  ipcMain.handle('generator:generate', async (event, options) => {
    resetActivity();
    const password = pwdGen.generatePassword(options);
    const strength = pwdGen.evaluateStrength(password);
    return { password, strength };
  });

  ipcMain.handle('generator:evaluate', async (event, password) => {
    return pwdGen.evaluateStrength(password);
  });

  // --- Secure Clipboard Operations ---
  ipcMain.handle('clipboard:copy', async (event, { text, isSensitive }) => {
    resetActivity();
    if (typeof text !== 'string') return { success: false };

    clipboard.writeText(text);

    if (isSensitive) {
      lastCopiedSecret = text;
      const clearSeconds = settingsService.settings.clipboardClearSeconds;

      if (clipboardClearTimer) clearTimeout(clipboardClearTimer);

      if (clearSeconds && clearSeconds > 0) {
        clipboardClearTimer = setTimeout(() => {
          try {
            // Only clear if the clipboard still contains the exact secret
            if (clipboard.readText() === lastCopiedSecret) {
              clipboard.clear();
            }
          } catch (e) {}
          lastCopiedSecret = null;
        }, clearSeconds * 1000);
      }
    }

    return { success: true };
  });

  // --- Settings & Secret Storage ---
  ipcMain.handle('settings:get', async () => {
    resetActivity();
    return settingsService.getSanitizedSettings();
  });

  ipcMain.handle('settings:save', async (event, newSettings) => {
    resetActivity();
    return settingsService.saveSettings(newSettings);
  });

  ipcMain.handle('settings:save-github-token', async (event, { token, allowUnsafeFallback }) => {
    resetActivity();
    return settingsService.saveGitHubToken(token, allowUnsafeFallback);
  });

  ipcMain.handle('settings:clear-github-token', async () => {
    resetActivity();
    settingsService.clearGitHubToken();
    settingsService.saveSettings({
      github: { lastSyncStatus: 'not_configured' }
    });
    return { success: true };
  });

  // --- GitHub Synchronization ---
  ipcMain.handle('github:test-connection', async (event, { owner, repo }) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    if (!token) {
      throw new Error('No GitHub Personal Access Token configured.');
    }
    return githubService.testConnection(token, owner, repo);
  });

  ipcMain.handle('github:create-private-repo', async (event, repoName) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    if (!token) {
      throw new Error('No GitHub Personal Access Token configured.');
    }
    return githubService.createPrivateRepository(token, repoName);
  });

  ipcMain.handle('github:get-user-repos', async () => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    if (!token) {
      throw new Error('Not authenticated with GitHub. Please sign in first.');
    }
    return githubService.getUserRepositories(token);
  });

  ipcMain.handle('github:get-user-profile', async () => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    if (!token) return null;
    try {
      const profile = await githubService.getUserProfile(token);
      const gh = settingsService.settings.github || {};
      settingsService.saveSettings({
        github: Object.assign({}, gh, { user: profile })
      });
      return profile;
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('github:check-repo-vault', async (event, { owner, repo, branch }) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    if (!token) {
      throw new Error('GitHub token not found. Please sign in.');
    }
    return githubService.checkRepoVault(token, owner, repo, branch || 'main');
  });

  ipcMain.handle('github:sync', async (event, options = {}) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    const ghConfig = settingsService.settings.github || {};
    const forceOverwrite = Boolean(options && options.forceOverwrite);
    const cloudPassword = options && options.cloudPassword ? String(options.cloudPassword) : null;

    if (!token) {
      throw new Error('GitHub token is missing. Please configure GitHub Sync in Settings.');
    }
    if (!ghConfig.owner || !ghConfig.repo) {
      throw new Error('Repository owner or name is not configured.');
    }

    try {
      const fallbackKeys = settingsService.getAllStoredPasswords();
      const localKey = settingsService.getOrCreateLocalVaultKey();
      if (localKey && !fallbackKeys.includes(localKey)) fallbackKeys.push(localKey);

      const tokenKey = vaultService.deriveVaultKey(token, ghConfig.owner, ghConfig.repo);
      if (tokenKey && !fallbackKeys.includes(tokenKey)) fallbackKeys.push(tokenKey);

      const prevTokens = settingsService.getPreviousTokens();
      for (const pt of prevTokens) {
        const pk = vaultService.deriveVaultKey(pt, ghConfig.owner, ghConfig.repo);
        if (pk && !fallbackKeys.includes(pk)) fallbackKeys.push(pk);
      }

      const syncResult = await vaultService.syncWithGitHub(
        githubService,
        token,
        ghConfig.owner,
        ghConfig.repo,
        ghConfig.branch || 'main',
        forceOverwrite,
        cloudPassword,
        fallbackKeys
      );

      // Record sync status in settings
      settingsService.saveSettings({
        github: Object.assign({}, ghConfig, {
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncStatus: 'success'
        })
      });

      return syncResult;
    } catch (err) {
      settingsService.saveSettings({
        github: Object.assign({}, ghConfig, {
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncStatus: 'failed'
        })
      });
      throw err;
    }
  });

  ipcMain.handle('github:restore-cloud', async (event, options = {}) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    const ghConfig = settingsService.settings.github || {};
    const cloudPassword = options && options.cloudPassword ? String(options.cloudPassword) : null;

    if (!token) {
      throw new Error('GitHub token is missing. Please configure GitHub Sync in Settings.');
    }
    if (!ghConfig.owner || !ghConfig.repo) {
      throw new Error('Repository owner or name is not configured.');
    }

    try {
      const fallbackKeys = settingsService.getAllStoredPasswords();
      const localKey = settingsService.getOrCreateLocalVaultKey();
      if (localKey && !fallbackKeys.includes(localKey)) fallbackKeys.push(localKey);

      const tokenKey = vaultService.deriveVaultKey(token, ghConfig.owner, ghConfig.repo);
      if (tokenKey && !fallbackKeys.includes(tokenKey)) fallbackKeys.push(tokenKey);

      const prevTokens = settingsService.getPreviousTokens();
      for (const pt of prevTokens) {
        const pk = vaultService.deriveVaultKey(pt, ghConfig.owner, ghConfig.repo);
        if (pk && !fallbackKeys.includes(pk)) fallbackKeys.push(pk);
      }

      const restoreResult = await vaultService.restoreFromCloud(
        githubService,
        token,
        ghConfig.owner,
        ghConfig.repo,
        ghConfig.branch || 'main',
        cloudPassword,
        fallbackKeys
      );

      settingsService.saveSettings({
        github: Object.assign({}, ghConfig, {
          lastSyncTimestamp: new Date().toISOString(),
          lastSyncStatus: 'success'
        })
      });

      return restoreResult;
    } catch (err) {
      throw err;
    }
  });

  ipcMain.handle('github:check-cloud-backup', async () => {
    try {
      const token = settingsService.getGitHubToken();
      if (!token) return { hasBackup: false, configured: false };
      const gh = settingsService.settings.github || {};
      if (!gh.owner || !gh.repo) return { hasBackup: false, configured: false };

      const remote = await githubService.fetchRemoteVault(token, gh.owner, gh.repo, gh.branch || 'main');
      return {
        hasBackup: remote.found,
        configured: true,
        sha: remote.sha || null,
        entryCount: remote.envelope?.meta?.entryCount ?? null,
        updatedAt: remote.envelope?.meta?.updatedAt ?? null
      };
    } catch (e) {
      return { hasBackup: false, configured: false, error: e.message };
    }
  });

  ipcMain.handle('github:get-backup-history', async () => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    const ghConfig = settingsService.settings.github || {};
    if (!token || !ghConfig.owner || !ghConfig.repo) {
      return { success: false, commits: [], error: 'GitHub is not configured.' };
    }

    try {
      const commits = await githubService.fetchCommitHistory(token, ghConfig.owner, ghConfig.repo, 15);
      const commitDetails = [];
      for (const c of commits) {
        try {
          const detail = await githubService.fetchRemoteVaultAtCommit(token, ghConfig.owner, ghConfig.repo, c.sha);
          commitDetails.push({
            sha: c.sha,
            shortSha: c.shortSha,
            date: c.date,
            message: c.message,
            entryCount: detail.envelope?.meta?.entryCount ?? null,
            updatedAt: detail.envelope?.meta?.updatedAt ?? null
          });
        } catch (e) {
          commitDetails.push({
            sha: c.sha,
            shortSha: c.shortSha,
            date: c.date,
            message: c.message,
            entryCount: null,
            updatedAt: null
          });
        }
      }
      return { success: true, commits: commitDetails };
    } catch (err) {
      return { success: false, commits: [], error: err.message };
    }
  });

  ipcMain.handle('github:restore-commit', async (event, { commitSha, password }) => {
    resetActivity();
    const token = settingsService.getGitHubToken();
    const ghConfig = settingsService.settings.github || {};
    if (!token || !ghConfig.owner || !ghConfig.repo) {
      throw new Error('GitHub is not configured.');
    }

    const fallbackKeys = settingsService.getAllStoredPasswords();
    const localKey = settingsService.getOrCreateLocalVaultKey();
    if (localKey && !fallbackKeys.includes(localKey)) fallbackKeys.push(localKey);
    const prevTokens = settingsService.getPreviousTokens();
    for (const pt of prevTokens) {
      const pk = vaultService.deriveVaultKey(pt, ghConfig.owner, ghConfig.repo);
      if (pk && !fallbackKeys.includes(pk)) fallbackKeys.push(pk);
    }

    return vaultService.restoreFromCommit(
      githubService,
      token,
      ghConfig.owner,
      ghConfig.repo,
      commitSha,
      password,
      fallbackKeys
    );
  });

  // --- System & Activity ---
  ipcMain.handle('system:open-url', async (event, url) => {
    resetActivity();
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL scheme.' };
  });

  // --- GitHub-First Authentication (Zero-Knowledge Sync) ---
  ipcMain.handle('auth:check-status', async () => {
    resetActivity();
    const isConfigured = settingsService.hasConfiguredGitHub();

    if (!isConfigured) {
      // Check if user previously selected "Save Local" mode
      if (settingsService.settings.mode === 'local') {
        const localKey = settingsService.getOrCreateLocalVaultKey();
        if (vaultService.state !== VAULT_STATES.UNLOCKED && localKey) {
          if (fs.existsSync(vaultService.vaultFilePath)) {
            try {
              await vaultService.unlockWithDerivedKey(localKey);
            } catch (unlockErr) {
              const legacyPasswords = settingsService.getAllStoredPasswords();
              let migrated = false;
              for (const oldPwd of legacyPasswords) {
                try {
                  await vaultService.unlockVault(oldPwd);
                  vaultService._cachedMasterPassword = localKey;
                  await vaultService._persistVault();
                  migrated = true;
                  break;
                } catch (e) {}
              }
              if (!migrated) {
                await vaultService.createWithDerivedKey(localKey);
              }
            }
          } else {
            await vaultService.createWithDerivedKey(localKey);
          }
        }

        return {
          configured: true,
          mode: 'local',
          unlocked: vaultService.state === VAULT_STATES.UNLOCKED,
          entryCount: vaultService.entries ? vaultService.entries.length : 0
        };
      }

      return {
        configured: false,
        mode: settingsService.settings?.mode || 'unconfigured',
        hasToken: Boolean(settingsService.getGitHubToken()),
        user: settingsService.settings?.github?.user || null,
        owner: settingsService.settings?.github?.owner || '',
        repo: settingsService.settings?.github?.repo || '',
        branch: settingsService.settings?.github?.branch || 'main',
        autoSync: settingsService.settings?.github?.autoSync !== false
      };
    }

    const creds = settingsService.getGitHubCredentials();
    const key = vaultService.deriveVaultKey(creds.token, creds.owner, creds.repo);

    // Auto-unlock local vault if not yet unlocked
    if (vaultService.state !== VAULT_STATES.UNLOCKED && key) {
      try {
        await vaultService.unlockWithDerivedKey(key);
      } catch (unlockErr) {
        const legacyPasswords = settingsService.getAllStoredPasswords();

        // If local vault file exists but failed with derived key, attempt automatic migration
        if (fs.existsSync(vaultService.vaultFilePath)) {
          let migrated = false;
          for (const oldPwd of legacyPasswords) {
            try {
              await vaultService.unlockVault(oldPwd);
              vaultService._cachedMasterPassword = key;
              await vaultService._persistVault();
              migrated = true;
              break;
            } catch (e) {}
          }

          if (!migrated) {
            // Try restoring from GitHub remote using derived key or legacy passwords
            try {
              await vaultService.restoreFromCloud(githubService, creds.token, creds.owner, creds.repo, creds.branch, key);
            } catch (cloudErr) {
              for (const oldPwd of legacyPasswords) {
                try {
                  await vaultService.restoreFromCloud(githubService, creds.token, creds.owner, creds.repo, creds.branch, oldPwd);
                  vaultService._cachedMasterPassword = key;
                  await vaultService._persistVault();
                  break;
                } catch (e) {}
              }
            }
          }
        } else {
          // Local vault does not exist yet. Try restoring from GitHub
          try {
            await vaultService.restoreFromCloud(githubService, creds.token, creds.owner, creds.repo, creds.branch, key);
          } catch (cloudErr) {
            let restored = false;
            for (const oldPwd of legacyPasswords) {
              try {
                await vaultService.restoreFromCloud(githubService, creds.token, creds.owner, creds.repo, creds.branch, oldPwd);
                vaultService._cachedMasterPassword = key;
                await vaultService._persistVault();
                restored = true;
                break;
              } catch (e) {}
            }
            if (!restored) {
              await vaultService.createWithDerivedKey(key);
            }
          }
        }
      }
    }

    // Auto-sync in background if unlocked and configured
    if (vaultService.state === VAULT_STATES.UNLOCKED && creds.autoSync && creds.token && creds.owner && creds.repo) {
      setImmediate(() => {
        const fallbackKeys = settingsService.getAllStoredPasswords();
        vaultService.syncWithGitHub(githubService, creds.token, creds.owner, creds.repo, creds.branch, false, null, fallbackKeys)
          .then(res => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('vault:synced', res);
            }
          })
          .catch(err => {
            console.warn('Background auto-sync notice:', err.message);
          });
      });
    }

    return {
      configured: true,
      unlocked: vaultService.state === VAULT_STATES.UNLOCKED,
      entryCount: vaultService.entries ? vaultService.entries.length : 0,
      hasToken: true,
      user: settingsService.settings?.github?.user || null,
      owner: creds.owner,
      repo: creds.repo,
      branch: creds.branch
    };
  });

  ipcMain.handle('auth:save-local', async () => {
    resetActivity();
    const localKey = settingsService.getOrCreateLocalVaultKey();
    settingsService.saveSettings({ mode: 'local' });

    if (vaultService.state !== VAULT_STATES.UNLOCKED) {
      if (fs.existsSync(vaultService.vaultFilePath)) {
        try {
          await vaultService.unlockWithDerivedKey(localKey);
        } catch (unlockErr) {
          const legacyPasswords = settingsService.getAllStoredPasswords();
          let migrated = false;
          for (const oldPwd of legacyPasswords) {
            try {
              await vaultService.unlockVault(oldPwd);
              vaultService._cachedMasterPassword = localKey;
              await vaultService._persistVault();
              migrated = true;
              break;
            } catch (e) {}
          }
          if (!migrated) {
            await vaultService.createWithDerivedKey(localKey);
          }
        }
      } else {
        await vaultService.createWithDerivedKey(localKey);
      }
    }

    return {
      success: true,
      mode: 'local',
      unlocked: true,
      entryCount: vaultService.entries ? vaultService.entries.length : 0
    };
  });

  ipcMain.handle('auth:github-login', async (event, { token, owner, repo, branch, autoSync }) => {
    resetActivity();
    const storedToken = settingsService.getGitHubToken();
    const cleanToken = (token || storedToken || '').trim();
    if (!cleanToken) {
      throw new Error('Please sign in with GitHub or enter your Personal Access Token (PAT).');
    }
    if (!owner || typeof owner !== 'string' || !owner.trim()) {
      throw new Error('Please enter or select your GitHub repository owner.');
    }
    if (!repo || typeof repo !== 'string' || !repo.trim()) {
      throw new Error('Please enter or select your private repository name.');
    }

    const cleanOwner = owner.trim();
    const cleanRepo = repo.trim();
    const cleanBranch = (branch || 'main').trim();
    const cleanAutoSync = autoSync !== undefined ? Boolean(autoSync) : true;

    // 1. Verify credentials and repository via GitHub API
    const testRes = await githubService.testConnection(cleanToken, cleanOwner, cleanRepo);
    if (!testRes.repoExists) {
      if (testRes.hasRepoScope === false) {
        throw new Error(`Connected as @${testRes.user}, but repository "${cleanOwner}/${cleanRepo}" was not found and your token lacks "repo" scope.`);
      }
      // Auto-create private repository if it doesn't exist
      try {
        await githubService.createPrivateRepository(cleanToken, cleanRepo);
      } catch (createErr) {
        throw new Error(`Repository "${cleanOwner}/${cleanRepo}" could not be created: ${createErr.message}`);
      }
    }

    // 2. Save credentials to this PC (safeStorage Windows DPAPI + settings.json)
    settingsService.saveGitHubToken(cleanToken, true);
    const currentGh = settingsService.settings.github || {};
    settingsService.saveSettings({
      mode: 'github',
      github: Object.assign({}, currentGh, {
        owner: cleanOwner,
        repo: cleanRepo,
        branch: cleanBranch,
        autoSync: cleanAutoSync,
        lastSyncTimestamp: new Date().toISOString(),
        lastSyncStatus: 'connected'
      })
    });

    // 3. Derive 256-bit encryption key from GitHub details
    const key = vaultService.deriveVaultKey(cleanToken, cleanOwner, cleanRepo);

    // 4. Check remote repository for existing vault
    const remote = await githubService.fetchRemoteVault(cleanToken, cleanOwner, cleanRepo, cleanBranch);
    if (remote.found && remote.envelope) {
      const fallbackKeys = settingsService.getAllStoredPasswords();
      const localKey = settingsService.getOrCreateLocalVaultKey();
      if (localKey && !fallbackKeys.includes(localKey)) fallbackKeys.push(localKey);
      const prevTokens = settingsService.getPreviousTokens();
      for (const pt of prevTokens) {
        const pk = vaultService.deriveVaultKey(pt, cleanOwner, cleanRepo);
        if (pk && !fallbackKeys.includes(pk)) fallbackKeys.push(pk);
      }

      let restored = false;
      try {
        await vaultService.restoreFromCloud(githubService, cleanToken, cleanOwner, cleanRepo, cleanBranch, key, fallbackKeys);
        restored = true;
      } catch (restoreErr) {
        for (const oldPwd of fallbackKeys) {
          try {
            await vaultService.restoreFromCloud(githubService, cleanToken, cleanOwner, cleanRepo, cleanBranch, oldPwd, fallbackKeys);
            vaultService._cachedMasterPassword = key;
            await vaultService._persistVault();
            await vaultService.syncWithGitHub(githubService, cleanToken, cleanOwner, cleanRepo, cleanBranch, true);
            restored = true;
            break;
          } catch (e) {}
        }
      }

      if (!restored) {
        // DO NOT OVERWRITE REMOTE REPOSITORY!
        // Preserve remote cloud backup safely. Unlock or create local vault with derived key.
        if (!fs.existsSync(vaultService.vaultFilePath)) {
          await vaultService.createWithDerivedKey(key);
        } else {
          try {
            await vaultService.unlockWithDerivedKey(key);
          } catch (e) {
            await vaultService.createWithDerivedKey(key);
          }
        }
        return {
          success: true,
          entryCount: vaultService.entries ? vaultService.entries.length : 0,
          owner: cleanOwner,
          repo: cleanRepo,
          remoteKeyMismatch: true,
          remoteEntryCount: remote.envelope?.meta?.entryCount ?? 0
        };
      }
    } else {
      // Initialize local vault with derived key and push to GitHub
      if (vaultService.state === VAULT_STATES.UNLOCKED && vaultService.entries.length > 0) {
        vaultService._cachedMasterPassword = key;
        await vaultService._persistVault();
        await vaultService.syncWithGitHub(githubService, cleanToken, cleanOwner, cleanRepo, cleanBranch, true);
      } else {
        await vaultService.createWithDerivedKey(key);
        await vaultService.syncWithGitHub(githubService, cleanToken, cleanOwner, cleanRepo, cleanBranch, true);
      }
    }

    return {
      success: true,
      entryCount: vaultService.entries.length,
      owner: cleanOwner,
      repo: cleanRepo
    };
  });

  ipcMain.handle('auth:github-logout', async () => {
    resetActivity();
    browserAuthService.cancel();
    activeGitHubAuth = null;
    settingsService.clearGitHubToken();
    const gh = settingsService.settings.github || {};
    settingsService.saveSettings({
      mode: 'unconfigured',
      github: Object.assign({}, gh, {
        user: null,
        owner: '',
        repo: '',
        lastSyncStatus: 'not_configured'
      })
    });
    vaultService.lockVault();
    return { success: true };
  });

  // --- GitHub Device OAuth Flow ---
  ipcMain.handle('auth:github-start-device', async () => {
    resetActivity();
    try {
      const authData = await browserAuthService.startGitHubAuth();
      activeGitHubAuth = authData;
      return {
        success: true,
        userCode: authData.userCode,
        verificationUri: authData.verificationUri
      };
    } catch (err) {
      activeGitHubAuth = null;
      throw err;
    }
  });

  ipcMain.handle('auth:github-poll-device', async () => {
    resetActivity();
    if (!activeGitHubAuth || !activeGitHubAuth.waitForAuth) {
      throw new Error('No active GitHub device authorization in progress.');
    }
    try {
      const profile = await activeGitHubAuth.waitForAuth();
      activeGitHubAuth = null;

      settingsService.saveGitHubToken(profile.token, true);
      const currentGh = settingsService.settings.github || {};
      settingsService.saveSettings({
        github: Object.assign({}, currentGh, {
          user: {
            login: profile.login,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            email: profile.email
          }
        })
      });

      return {
        success: true,
        user: {
          login: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          email: profile.email
        }
      };
    } catch (err) {
      activeGitHubAuth = null;
      throw err;
    }
  });

  ipcMain.handle('auth:github-cancel-device', async () => {
    resetActivity();
    browserAuthService.cancel();
    activeGitHubAuth = null;
    return { success: true };
  });

  // Legacy compatibility fallbacks
  ipcMain.handle('auth:browser-login', async () => ({ success: false, error: 'SSO login disabled.' }));
  ipcMain.handle('auth:cancel-browser-login', async () => ({ success: true }));
  ipcMain.handle('auth:link-sso', async () => ({ success: true }));
  ipcMain.handle('auth:get-sso-link', async () => ({ masterPassword: null }));

  // --- Custom Brutalist Window Controls ---
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
    return true;
  });

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
    return true;
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('window:toggle-devtools', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
      return mainWindow.webContents.isDevToolsOpened();
    }
    return false;
  });

  ipcMain.on('system:user-activity', () => {
    resetActivity();
  });
}

/**
 * Vaultly - UI Views & Presentation Modules
 * Renders Sidebar, Settings Panels, Details Drawer, and Dialogs.
 */

'use strict';

const ACCENT_COLORS = [
  { name: 'Canary Yellow', hex: '#FFE500' },
  { name: 'Neo Mint', hex: '#00E599' },
  { name: 'Brutal Coral', hex: '#FF3B5C' },
  { name: 'Electric Cyan', hex: '#00C2FF' },
  { name: 'Vivid Amber', hex: '#FFA800' },
  { name: 'Lilac Violet', hex: '#8B5CF6' }
];

/**
 * Renders the sidebar category links and counters.
 */
function renderSidebar(navContainer, categories, currentCategory, counts, onSelect) {
  navContainer.innerHTML = '';

  const mainSection = document.createElement('div');
  const catSection = document.createElement('div');

  const catTitle = document.createElement('div');
  catTitle.className = 'sidebar-section-title';
  catTitle.textContent = 'Categories';
  catSection.appendChild(catTitle);

  categories.forEach(cat => {
    const item = document.createElement('a');
    item.className = `nav-item ${cat.id === currentCategory ? 'active' : ''}`;
    item.dataset.catId = cat.id;

    const count = counts[cat.id] !== undefined ? counts[cat.id] : 0;

    item.innerHTML = `
      <span class="nav-icon">${cat.icon}</span>
      <span class="nav-label">${escapeHtml(cat.name)}</span>
      <span class="nav-badge">${count}</span>
    `;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      onSelect(cat.id);
    });

    if (['all', 'favorites', 'recent'].includes(cat.id)) {
      mainSection.appendChild(item);
    } else {
      catSection.appendChild(item);
    }
  });

  navContainer.appendChild(mainSection);
  navContainer.appendChild(catSection);
}

/**
 * Renders details of the selected password entry inside the slide-over drawer.
 */
function renderDetailDrawer(bodyEl, entry, callbacks) {
  let isPasswordVisible = false;

  bodyEl.innerHTML = `
    <!-- Website URL -->
    <div class="detail-field">
      <span class="detail-label">Website URL</span>
      <div class="detail-value-box">
        <span class="detail-value-text" id="detail-val-url">${escapeHtml(entry.websiteUrl || 'Not specified')}</span>
        ${entry.websiteUrl ? `
          <button class="btn-icon-only" id="btn-copy-url" style="width: 28px; height: 28px;" title="Copy URL">
            ${UI_ICONS.copy}
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Username / Email -->
    <div class="detail-field">
      <span class="detail-label">Username or Email</span>
      <div class="detail-value-box">
        <span class="detail-value-text">${escapeHtml(entry.username)}</span>
        <button class="btn-icon-only" id="btn-detail-copy-user" style="width: 28px; height: 28px;" title="Copy Username">
          ${UI_ICONS.copy}
        </button>
      </div>
    </div>

    <!-- Password -->
    <div class="detail-field">
      <span class="detail-label">Password</span>
      <div class="detail-value-box">
        <span class="detail-value-text" id="detail-password-text" style="letter-spacing: 0.15em;">••••••••••••</span>
        <div style="display: flex; gap: 0.25rem;">
          <button class="btn-icon-only" id="btn-detail-toggle-pwd" style="width: 28px; height: 28px;" title="Show/Hide">
            ${UI_ICONS.eye}
          </button>
          <button class="btn-icon-only" id="btn-detail-copy-pwd" style="width: 28px; height: 28px;" title="Copy Password">
            ${UI_ICONS.copy}
          </button>
        </div>
      </div>
    </div>

    <!-- Secure Notes -->
    <div class="detail-field">
      <span class="detail-label">Notes (Encrypted)</span>
      <div class="detail-value-box" style="align-items: flex-start; min-height: 80px; white-space: pre-wrap; font-family: inherit; font-size: 0.85rem;">
        <span>${escapeHtml(entry.notes || 'No notes attached.')}</span>
      </div>
    </div>

    <!-- Timestamps -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-subtle);">
      <div>
        <strong>Created:</strong>
        <div>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown'}</div>
      </div>
      <div>
        <strong>Last Updated:</strong>
        <div>${entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : 'Unknown'}</div>
      </div>
    </div>
  `;

  // Bind toggle visibility
  const pwdTextEl = bodyEl.querySelector('#detail-password-text');
  const toggleBtn = bodyEl.querySelector('#btn-detail-toggle-pwd');
  toggleBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    if (isPasswordVisible) {
      pwdTextEl.textContent = entry.password;
      pwdTextEl.style.letterSpacing = 'normal';
      toggleBtn.innerHTML = UI_ICONS.eyeOff;
    } else {
      pwdTextEl.textContent = '••••••••••••';
      pwdTextEl.style.letterSpacing = '0.15em';
      toggleBtn.innerHTML = UI_ICONS.eye;
    }
  });

  // Bind copy buttons
  bodyEl.querySelector('#btn-detail-copy-user').addEventListener('click', () => {
    callbacks.onCopyUser(entry);
  });

  bodyEl.querySelector('#btn-detail-copy-pwd').addEventListener('click', () => {
    callbacks.onCopyPassword(entry);
  });

  const copyUrlBtn = bodyEl.querySelector('#btn-copy-url');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', () => {
      callbacks.onCopyUrl(entry.websiteUrl);
    });
  }
}

/**
 * Renders the full Settings page with General, Security, GitHub Sync, and About tabs.
 */
function renderSettings(container, settings, callbacks) {
  const gh = settings.github || {};
  const isSafeStorage = settings.safeStorageAvailable;

  const ghOwner = (gh.owner || '').trim();
  const ghRepo = (gh.repo || '').trim();
  const hasToken = Boolean(settings.hasGitHubToken);
  const hasRepo = Boolean(ghOwner && ghRepo);
  const repoUrlDisplay = hasRepo ? `https://github.com/${ghOwner}/${ghRepo}` : 'https://github.com/(owner)/(repo)';

  let connectionDotColor = '#94a3b8';
  let connectionBadgeBg = '#e2e8f0';
  let connectionBadgeColor = '#475569';
  let connectionBadgeText = 'Not Configured';
  let connectionStatusMsg = 'GitHub sync is not configured yet.';

  if (hasToken && hasRepo) {
    if (gh.lastSyncStatus === 'success') {
      connectionDotColor = '#00E599';
      connectionBadgeBg = '#00E599';
      connectionBadgeColor = '#121212';
      connectionBadgeText = 'Connected & Synced';
      connectionStatusMsg = `Encrypted vault is connected and synced with ${ghOwner}/${ghRepo}`;
    } else if (gh.lastSyncStatus === 'connected') {
      connectionDotColor = '#00E599';
      connectionBadgeBg = '#00E599';
      connectionBadgeColor = '#121212';
      connectionBadgeText = 'Connected';
      connectionStatusMsg = `Connected to repository ${ghOwner}/${ghRepo}`;
    } else if (gh.lastSyncStatus === 'failed') {
      connectionDotColor = '#FF3B5C';
      connectionBadgeBg = '#FF3B5C';
      connectionBadgeColor = '#FFFFFF';
      connectionBadgeText = 'Connection Error';
      connectionStatusMsg = 'Failed to connect or sync. Click Test Connection to diagnose.';
    } else {
      connectionDotColor = '#FFA800';
      connectionBadgeBg = '#FFA800';
      connectionBadgeColor = '#121212';
      connectionBadgeText = 'Not Verified';
      connectionStatusMsg = `Credentials configured for ${ghOwner}/${ghRepo}. Click Test Connection to verify.`;
    }
  } else if (!hasToken && hasRepo) {
    connectionDotColor = '#FF3B5C';
    connectionBadgeBg = '#FFE5EA';
    connectionBadgeColor = '#FF3B5C';
    connectionBadgeText = 'Disconnected';
    connectionStatusMsg = 'GitHub token is disconnected. Enter a Personal Access Token (PAT) to connect.';
  } else if (hasToken && !hasRepo) {
    connectionDotColor = '#FFA800';
    connectionBadgeBg = '#FFA800';
    connectionBadgeColor = '#121212';
    connectionBadgeText = 'Repo Required';
    connectionStatusMsg = 'Please enter repository owner and private repository name.';
  }

  container.innerHTML = `
    <!-- Settings Section: General -->
    <div class="settings-section">
      <div class="settings-section-header">
        <h3>General Preferences</h3>
        <p>Configure theme, appearance, and window behavior.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <div class="form-group">
          <label class="form-label" for="setting-theme">Theme</label>
          <select id="setting-theme" class="form-select">
            <option value="cream" ${settings.theme === 'cream' || !settings.theme || settings.theme === 'light' ? 'selected' : ''}>Brutalist Cream (Default)</option>
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Brutalist Dark Ink</option>
            <option value="cyber" ${settings.theme === 'cyber' ? 'selected' : ''}>Brutalist High Voltage</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Accent Color</label>
          <div class="color-picker-group" id="accent-swatches">
            ${ACCENT_COLORS.map(c => `
              <div class="color-swatch ${settings.accentColor === c.hex ? 'active' : ''}"
                   data-hex="${c.hex}"
                   style="background-color: ${c.hex};"
                   title="${c.name}"></div>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="setting-lock-timeout">Auto-Lock Inactivity Timeout</label>
          <select id="setting-lock-timeout" class="form-select">
            <option value="1" ${settings.lockTimeoutMinutes === 1 ? 'selected' : ''}>1 Minute</option>
            <option value="5" ${settings.lockTimeoutMinutes === 5 ? 'selected' : ''}>5 Minutes (Recommended)</option>
            <option value="15" ${settings.lockTimeoutMinutes === 15 ? 'selected' : ''}>15 Minutes</option>
            <option value="30" ${settings.lockTimeoutMinutes === 30 ? 'selected' : ''}>30 Minutes</option>
            <option value="0" ${settings.lockTimeoutMinutes === 0 ? 'selected' : ''}>Never Auto-Lock (Not recommended)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="setting-clipboard-timeout">Clipboard Clearing Delay</label>
          <select id="setting-clipboard-timeout" class="form-select">
            <option value="15" ${settings.clipboardClearSeconds === 15 ? 'selected' : ''}>15 Seconds</option>
            <option value="30" ${settings.clipboardClearSeconds === 30 ? 'selected' : ''}>30 Seconds (Recommended)</option>
            <option value="60" ${settings.clipboardClearSeconds === 60 ? 'selected' : ''}>60 Seconds</option>
            <option value="0" ${settings.clipboardClearSeconds === 0 ? 'selected' : ''}>Never Clear</option>
          </select>
        </div>
      </div>

      <div style="margin-top: 0.5rem;">
        <label class="checkbox-label" style="font-size: 0.85rem;">
          <input type="checkbox" id="setting-start-minimized" ${settings.startMinimized ? 'checked' : ''}>
          Start Vaultly minimized in background
        </label>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn-primary" id="btn-save-general-settings">Save General Preferences</button>
      </div>
    </div>

    <!-- Settings Section: Backups & Account -->
    <div class="settings-section">
      <div class="settings-section-header">
        <h3>Encrypted Backups & Account</h3>
        <p>Export local encrypted backups or disconnect your GitHub account from this PC.</p>
      </div>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <button class="btn-secondary" id="btn-export-backup" title="Save all passwords to a .vaulty file on your PC">
          ${UI_ICONS.shield}
          <span>Export .vaulty Backup</span>
        </button>

        <button class="btn-secondary" id="btn-restore-backup" title="Import and merge passwords from a .vaulty file into this vault">
          ${UI_ICONS.refresh}
          <span>Import / Merge .vaulty File</span>
        </button>

        <button class="btn-secondary" id="btn-settings-disconnect-gh" style="color: var(--color-danger);">
          ${UI_ICONS.close}
          <span>Disconnect / Log Out of GitHub</span>
        </button>
      </div>
    </div>

    <!-- Settings Section: GitHub Private Repository Synchronization -->
    <div class="settings-section">
      <div class="settings-section-header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3>GitHub Cloud Backup & Synchronization</h3>
            <p>Sync your encrypted vault to your private GitHub repository across devices. GitHub is completely optional.</p>
          </div>
          <span class="nav-badge" style="background: ${connectionBadgeBg}; color: ${connectionBadgeColor}; border: 1.5px solid var(--border-color, #121212);">
            ${connectionBadgeText}
          </span>
        </div>
      </div>

      ${!isSafeStorage ? `
        <div class="alert-box alert-warning">
          ${UI_ICONS.key}
          <span>Warning: Operating system secure storage (Windows DPAPI safeStorage) is not available in this environment. GitHub tokens will be stored in an obfuscated local file.</span>
        </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label" for="gh-token">GitHub Personal Access Token (PAT)</label>
          <div class="input-with-action">
            <input type="password" id="gh-token" class="form-input"
                   placeholder="${settings.hasGitHubToken ? 'Token configured (leave blank to keep)' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}"
                   autocomplete="off">
            <div class="input-action-buttons">
              ${settings.hasGitHubToken ? `
                <button type="button" class="btn-secondary" id="btn-clear-gh-token" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; color: var(--color-danger);">
                  Disconnect Token
                </button>
              ` : ''}
            </div>
          </div>
          <span style="font-size: 0.725rem; color: var(--text-subtle);">
            Tokens are stored securely using Electron <code>safeStorage</code> (Windows DPAPI) and never uploaded or logged.
          </span>
        </div>

        <div class="form-group">
          <label class="form-label" for="gh-owner">Repository Owner (Username / Org)</label>
          <input type="text" id="gh-owner" class="form-input" value="${escapeHtml(gh.owner || '')}" placeholder="e.g. your-github-handle">
        </div>

        <div class="form-group">
          <label class="form-label" for="gh-repo">Private Repository Name</label>
          <input type="text" id="gh-repo" class="form-input" value="${escapeHtml(gh.repo || '')}" placeholder="e.g. vaultly-passwords">
        </div>

        <div class="form-group">
          <label class="form-label" for="gh-branch">Branch Name</label>
          <input type="text" id="gh-branch" class="form-input" value="${escapeHtml(gh.branch || 'main')}" placeholder="main">
        </div>

        <div class="form-group" style="justify-content: flex-end;">
          <label class="checkbox-label" style="font-size: 0.85rem; padding-bottom: 0.5rem;">
            <input type="checkbox" id="gh-auto-sync" ${gh.autoSync !== false ? 'checked' : ''}>
            Automatically push changes after edits
          </label>
        </div>
      </div>

      <!-- GitHub Repository Link & Live Connection Status Card -->
      <div id="gh-repo-status-panel" style="margin: 0.9rem 0; border: 2px solid var(--border-color, #121212); border-radius: var(--radius-md); box-shadow: var(--shadow-sm, 2px 2px 0px #121212); background: var(--bg-tertiary); padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.65rem;">
        
        <!-- Status Header Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.55rem;">
            <span id="gh-connection-dot" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--border-color, #121212); background: ${connectionDotColor};"></span>
            <span style="font-size: 0.82rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.01em;">
              Connection Status:
            </span>
            <span id="gh-connection-badge" class="badge" style="background: ${connectionBadgeBg}; color: ${connectionBadgeColor}; border: 1.5px solid var(--border-color, #121212); font-weight: 800; font-size: 0.72rem; padding: 2px 8px; border-radius: var(--radius-full, 9999px);">
              ${connectionBadgeText}
            </span>
          </div>

          <div id="gh-connection-msg" style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">
            ${connectionStatusMsg}
          </div>
        </div>

        <!-- Repository Link Row -->
        <div style="background: var(--bg-card); border: 2px solid var(--border-color, #121212); border-radius: var(--radius-sm); padding: 0.55rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.55rem; min-width: 0; flex: 1;">
            <span style="display: inline-flex; width: 18px; height: 18px; flex-shrink: 0; color: var(--text-main);">
              ${BRAND_ICONS.github}
            </span>
            <div style="display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
              <span style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
                Repository Link
              </span>
              <a href="#" id="link-gh-repo-url" style="font-size: 0.82rem; font-weight: 800; color: var(--text-main); text-decoration: underline; text-underline-offset: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono, monospace);" title="Click to open repository in browser">
                ${repoUrlDisplay}
              </a>
            </div>
          </div>

          <div style="display: flex; gap: 0.4rem; flex-shrink: 0;">
            <button type="button" class="btn-secondary" id="btn-copy-gh-repo-url" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.3rem;" title="Copy repository URL to clipboard">
              <span style="display: inline-flex; width: 12px; height: 12px;">${UI_ICONS.copy}</span>
              <span>Copy Link</span>
            </button>
            <button type="button" class="btn-secondary" id="btn-open-gh-repo" style="padding: 0.3rem 0.65rem; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.3rem; background: var(--color-success); color: #121212;" title="Open repository in default browser" ${hasRepo ? '' : 'disabled'}>
              <span>Open on GitHub</span>
              <span style="display: inline-flex; width: 12px; height: 12px;">${UI_ICONS.externalLink}</span>
            </button>
          </div>
        </div>
      </div>

      <div style="background: var(--bg-tertiary); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.8rem; color: var(--text-muted);">
        <p><strong>How to create a private backup repository:</strong></p>
        <ol style="margin-left: 1.25rem; margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.2rem;">
          <li>Visit <a href="#" id="link-gh-tokens" style="color: var(--accent-color);">github.com/settings/tokens</a> and generate a token with <code>repo</code> scope.</li>
          <li>Enter your username, private repository name (e.g. <code>my-vaultly-backup</code>), and token above.</li>
          <li>Click <strong>Test Connection</strong>. If the repository doesn't exist, Vaultly will offer to create it privately for you.</li>
        </ol>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.5rem;">
        <span style="font-size: 0.785rem; color: var(--text-subtle);">
          Last Sync: <strong>${gh.lastSyncTimestamp ? new Date(gh.lastSyncTimestamp).toLocaleString() : 'Never'}</strong>
        </span>
        <div style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
          <button class="btn-secondary" id="btn-test-gh-connection">Test Connection</button>
          <button class="btn-secondary" id="btn-restore-cloud" title="Restore and merge all passwords from your GitHub cloud backup">Restore from Cloud</button>
          <button class="btn-secondary" id="btn-backup-history" title="View historical backup versions from GitHub commit history" style="border-color: #00E599; font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem;">
            <span>Backup History</span>
          </button>
          <button class="btn-secondary" id="btn-force-overwrite-gh" title="Replace outdated remote file on GitHub with your current vault">Overwrite Remote</button>
          <button class="btn-primary" id="btn-sync-now">Sync Now</button>
        </div>
      </div>
    </div>

    <!-- Settings Section: Danger Zone (Reset App) -->
    <div class="settings-section" style="border-color: #FF5252;">
      <div class="settings-section-header">
        <h3 style="color: #FF5252;">Danger Zone: Reset App Data</h3>
        <p>Erase local encrypted vault, clear stored tokens, and return Vaultly back to initial setup.</p>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <p style="font-size: 0.82rem; color: var(--text-muted); max-width: 500px; margin: 0; line-height: 1.4;">
          Permanently delete the local encrypted vault and all configuration settings. Make sure you have exported a <strong>.vaulty</strong> backup if you wish to keep your credentials.
        </p>
        <button class="btn-secondary" id="btn-reset-app-data" style="color: #FF5252; border-color: #FF5252; font-weight: 800; display: inline-flex; align-items: center; gap: 0.5rem;">
          ${UI_ICONS.trash}
          <span>Reset App Data</span>
        </button>
      </div>
    </div>

    <!-- Settings Section: About & Security Architecture -->
    <div class="settings-section">
      <div class="settings-section-header" style="display: flex; align-items: center; gap: 0.85rem;">
        <img src="assets/icons/app-logo-round.png" alt="Vaultly" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid #121212; box-shadow: 2px 2px 0px #121212; background: #FBFBFB; object-fit: cover; flex-shrink: 0;">
        <div>
          <h3>About Vaultly & Security Architecture</h3>
          <p>Version 1.0.0 • Developed by Raktakto • Open Source MIT License</p>
        </div>
      </div>

      <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.75rem;">
        <p>
          <strong>Vaultly</strong> is a minimalist, privacy-focused password manager engineered for Windows.
          It operates with zero telemetry, zero background tracking, and no external server requirements.
        </p>

        <div style="background: var(--bg-input); padding: 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <strong style="color: var(--text-main);">Cryptographic Design:</strong>
          <ul style="margin-left: 1.25rem; margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.25rem;">
            <li><strong>Key Derivation:</strong> Node.js <code>crypto.scrypt</code> with 256-bit unique random salt and calibrated cost parameters (N=32768, r=8, p=1).</li>
            <li><strong>Vault Encryption:</strong> Authenticated AES-256-GCM with a fresh 96-bit cryptographic nonce and 128-bit authentication tag for every save.</li>
            <li><strong>Secret Protection:</strong> GitHub Personal Access Tokens are encrypted using Electron <code>safeStorage</code> backed by the Windows Data Protection API (DPAPI).</li>
            <li><strong>Memory Hygiene:</strong> Master keys and decrypted entries are wiped with zeros upon vault lock.</li>
          </ul>
        </div>

        <div class="alert-box alert-warning">
          ${UI_ICONS.shield}
          <span>
            <strong>Security Limitations Notice:</strong> While Vaultly utilizes state-of-the-art authenticated encryption and OS-level DPAPI storage,
            it cannot protect your vault if your operating system is actively compromised by keyloggers, unauthorized physical access, or advanced kernel-level malware.
            Always keep your Windows PC secure and updated.
          </span>
        </div>
      </div>
    </div>
  `;

  // Bind Instant Theme Switching
  const themeSelect = container.querySelector('#setting-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      if (callbacks.onSelectTheme) {
        callbacks.onSelectTheme(themeSelect.value);
      }
    });
  }

  // Bind Accent Swatches
  container.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      callbacks.onSelectAccent(swatch.dataset.hex);
    });
  });

  // Bind General Save
  container.querySelector('#btn-save-general-settings').addEventListener('click', () => {
    const theme = container.querySelector('#setting-theme').value;
    const lockTimeout = container.querySelector('#setting-lock-timeout').value;
    const clipTimeout = container.querySelector('#setting-clipboard-timeout').value;
    const startMin = container.querySelector('#setting-start-minimized').checked;
    const activeSwatch = container.querySelector('.color-swatch.active');
    const accent = activeSwatch ? activeSwatch.dataset.hex : settings.accentColor;

    callbacks.onSaveGeneral({
      theme,
      accentColor: accent,
      lockTimeoutMinutes: Number(lockTimeout),
      clipboardClearSeconds: Number(clipTimeout),
      startMinimized: startMin
    });
  });

  // Bind Backup & Account Buttons
  const exportBtn = container.querySelector('#btn-export-backup');
  if (exportBtn) exportBtn.addEventListener('click', callbacks.onExportBackup);
  const backupRestoreBtn = container.querySelector('#btn-restore-backup');
  if (backupRestoreBtn) backupRestoreBtn.addEventListener('click', callbacks.onRestoreBackup);
  const disconnectGhBtn = container.querySelector('#btn-settings-disconnect-gh');
  if (disconnectGhBtn) disconnectGhBtn.addEventListener('click', callbacks.onClearGitHubToken);

  // Bind GitHub Actions
  const clearTokenBtn = container.querySelector('#btn-clear-gh-token');
  if (clearTokenBtn) {
    clearTokenBtn.addEventListener('click', callbacks.onClearGitHubToken);
  }

  const backupHistBtn = container.querySelector('#btn-backup-history');
  if (backupHistBtn && callbacks.onShowBackupHistory) {
    backupHistBtn.addEventListener('click', callbacks.onShowBackupHistory);
  }

  container.querySelector('#btn-test-gh-connection').addEventListener('click', () => {
    const token = container.querySelector('#gh-token').value;
    const owner = container.querySelector('#gh-owner').value;
    const repo = container.querySelector('#gh-repo').value;
    const branch = container.querySelector('#gh-branch').value;
    const autoSync = container.querySelector('#gh-auto-sync').checked;

    const dot = container.querySelector('#gh-connection-dot');
    const badge = container.querySelector('#gh-connection-badge');
    const msg = container.querySelector('#gh-connection-msg');
    if (dot) dot.style.background = '#FFA800';
    if (badge) {
      badge.textContent = 'Testing...';
      badge.style.background = '#FFA800';
      badge.style.color = '#121212';
    }
    if (msg) msg.textContent = 'Verifying connection to repository...';

    callbacks.onTestGitHub({ token, owner, repo, branch, autoSync });
  });

  // Bind Repository Link, Copy, and Live Preview Listeners
  const ownerInput = container.querySelector('#gh-owner');
  const repoInput = container.querySelector('#gh-repo');
  const repoUrlLink = container.querySelector('#link-gh-repo-url');
  const openRepoBtn = container.querySelector('#btn-open-gh-repo');
  const copyRepoBtn = container.querySelector('#btn-copy-gh-repo-url');

  function updateRepoLinkPreview() {
    const o = (ownerInput ? ownerInput.value : '').trim();
    const r = (repoInput ? repoInput.value : '').trim();
    if (o && r) {
      const fullUrl = `https://github.com/${o}/${r}`;
      if (repoUrlLink) {
        repoUrlLink.textContent = fullUrl;
        repoUrlLink.title = `Open ${fullUrl}`;
      }
      if (openRepoBtn) openRepoBtn.disabled = false;
      if (copyRepoBtn) copyRepoBtn.disabled = false;
    } else {
      if (repoUrlLink) {
        repoUrlLink.textContent = 'https://github.com/(owner)/(repo)';
        repoUrlLink.title = 'Enter owner and repository name above';
      }
      if (openRepoBtn) openRepoBtn.disabled = true;
      if (copyRepoBtn) copyRepoBtn.disabled = true;
    }
  }

  if (ownerInput) ownerInput.addEventListener('input', updateRepoLinkPreview);
  if (repoInput) repoInput.addEventListener('input', updateRepoLinkPreview);

  function openCurrentRepoUrl() {
    const o = (ownerInput ? ownerInput.value : '').trim();
    const r = (repoInput ? repoInput.value : '').trim();
    if (o && r) {
      const fullUrl = `https://github.com/${o}/${r}`;
      callbacks.onOpenExternal(fullUrl);
    } else {
      showToast('Please enter repository owner and name first', 'warning');
    }
  }

  if (repoUrlLink) {
    repoUrlLink.addEventListener('click', (e) => {
      e.preventDefault();
      openCurrentRepoUrl();
    });
  }

  if (openRepoBtn) {
    openRepoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openCurrentRepoUrl();
    });
  }

  if (copyRepoBtn) {
    copyRepoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const o = (ownerInput ? ownerInput.value : '').trim();
      const r = (repoInput ? repoInput.value : '').trim();
      if (o && r) {
        const fullUrl = `https://github.com/${o}/${r}`;
        navigator.clipboard.writeText(fullUrl).then(() => {
          showToast('Repository link copied to clipboard!', 'success');
        }).catch(() => {
          showToast('Failed to copy link to clipboard', 'error');
        });
      } else {
        showToast('Please enter repository owner and name first', 'warning');
      }
    });
  }

  container.querySelector('#btn-sync-now').addEventListener('click', () => {
    const token = container.querySelector('#gh-token').value;
    const owner = container.querySelector('#gh-owner').value;
    const repo = container.querySelector('#gh-repo').value;
    const branch = container.querySelector('#gh-branch').value;
    const autoSync = container.querySelector('#gh-auto-sync').checked;
    callbacks.onSyncNow({ token, owner, repo, branch, autoSync });
  });

  const cloudRestoreBtn = container.querySelector('#btn-restore-cloud');
  if (cloudRestoreBtn) {
    cloudRestoreBtn.addEventListener('click', () => {
      if (callbacks.onRestoreCloud) {
        callbacks.onRestoreCloud();
      }
    });
  }

  const forceBtn = container.querySelector('#btn-force-overwrite-gh');
  if (forceBtn) {
    forceBtn.addEventListener('click', () => {
      const token = container.querySelector('#gh-token').value;
      const owner = container.querySelector('#gh-owner').value;
      const repo = container.querySelector('#gh-repo').value;
      const branch = container.querySelector('#gh-branch').value;
      const autoSync = container.querySelector('#gh-auto-sync').checked;
      if (callbacks.onForceOverwriteGitHub) {
        callbacks.onForceOverwriteGitHub({ token, owner, repo, branch, autoSync });
      }
    });
  }

  const resetAppDataBtn = container.querySelector('#btn-reset-app-data');
  if (resetAppDataBtn) {
    resetAppDataBtn.addEventListener('click', () => {
      if (callbacks.onResetAppData) {
        callbacks.onResetAppData();
      }
    });
  }

  const ghLink = container.querySelector('#link-gh-tokens');
  if (ghLink) {
    ghLink.addEventListener('click', (e) => {
      e.preventDefault();
      callbacks.onOpenExternal('https://github.com/settings/tokens?type=beta');
    });
  }
}

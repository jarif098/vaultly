/**
 * Vaultly - Renderer Main Controller Application
 * Manages application state, event handlers, keyboard shortcuts,
 * and coordinates between UI views and preload IPC APIs.
 */

'use strict';

// Application State
const state = {
  vaultState: 'locked', // 'not_initialized' | 'locked' | 'unlocked'
  currentCategory: 'all',
  searchQuery: '',
  sortBy: 'service',
  viewMode: 'grid', // 'grid' | 'list'
  isSettingsOpen: false,
  entries: [],
  selectedEntry: null,
  settings: {},
  generatorDefaults: {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  setupTitlebarControls();
  setupStaticIcons();
  setupEventListeners();
  setupKeyboardShortcuts();

  // Listen for auto-lock events emitted from main process
  window.vaultlyApi.onAutoLocked((data) => {
    handleVaultLocked(true, `Vault auto-locked due to ${data.minutes || 5} min inactivity.`);
  });

  // Listen for background auto-sync updates
  if (window.vaultlyApi.onVaultSynced) {
    window.vaultlyApi.onVaultSynced(async (res) => {
      await refreshVaultData();
      if (res && res.action === 'merged_and_synced') {
        showToast(`Cloud sync: ${res.message}`, 'success');
      }
    });
  }

  // Track user activity to reset auto-lock timer
  const recordActivityThrottled = throttle(() => {
    window.vaultlyApi.recordActivity();
  }, 3000);
  window.addEventListener('mousemove', recordActivityThrottled);
  window.addEventListener('keydown', recordActivityThrottled);
  window.addEventListener('click', recordActivityThrottled);

  // Check initial vault state
  await checkVaultState();
});

function throttle(func, limit) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Sets up custom brutalist title bar window controls and action buttons.
 */
function setupTitlebarControls() {
  const btnMin = document.getElementById('win-btn-min');
  const btnMax = document.getElementById('win-btn-max');
  const btnClose = document.getElementById('win-btn-close');
  const btnTbSync = document.getElementById('btn-tb-sync');
  const btnTbLock = document.getElementById('btn-tb-lock');

  if (btnMin) {
    btnMin.addEventListener('click', () => {
      window.vaultlyApi.minimizeWindow();
    });
  }

  if (btnMax) {
    btnMax.addEventListener('click', async () => {
      const isMax = await window.vaultlyApi.maximizeWindow();
      updateMaximizeIcon(isMax);
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      window.vaultlyApi.closeWindow();
    });
  }

  if (btnTbLock) {
    btnTbLock.addEventListener('click', () => {
      handleVaultLocked(false, 'Vault locked immediately.');
    });
  }

  if (btnTbSync) {
    btnTbSync.addEventListener('click', async () => {
      if (state.vaultState !== 'unlocked') {
        showToast('Unlock vault before syncing', 'warning');
        return;
      }
      try {
        btnTbSync.style.opacity = '0.5';
        showToast('Syncing encrypted vault with GitHub...', 'info');
        const syncRes = await window.vaultlyApi.syncWithGitHub();
        showToast(syncRes.message, 'success');
        await refreshVaultData();
      } catch (err) {
        showToast('Sync failed: ' + err.message, 'error');
      } finally {
        btnTbSync.style.opacity = '1';
      }
    });
  }

  window.vaultlyApi.onWindowStateChange(({ isMaximized }) => {
    updateMaximizeIcon(isMaximized);
  });
}

function updateMaximizeIcon(isMaximized) {
  const icon = document.getElementById('icon-max-state');
  if (!icon) return;
  if (isMaximized) {
    icon.innerHTML = `<path d="M3 1h6v6H3V1zm1 1v4h4V2H4z" fill="currentColor"/><path d="M1 3v6h6v-1H2V4H1V3z" fill="currentColor"/>`;
  } else {
    icon.innerHTML = `<rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.3" fill="none"/>`;
  }
}

function updateTitlebarStatus(isUnlocked, entryCount = 0) {
  const dot = document.getElementById('titlebar-status-dot');
  const text = document.getElementById('titlebar-status-text');
  if (!dot || !text) return;

  if (isUnlocked) {
    dot.classList.add('unlocked');
    text.textContent = `AES-256 // ${entryCount} ITEMS`;
  } else {
    dot.classList.remove('unlocked');
    text.textContent = `AES-256 // LOCKED`;
  }
}

/**
 * Injects brand and UI icons into static DOM elements.
 */
function setupStaticIcons() {
  const roundLogoHtml = '<img src="assets/icons/app-logo-round.png" alt="Vaultly" class="app-round-logo-img">';
  const brandIcon = document.getElementById('brand-logo-icon');
  if (brandIcon) brandIcon.innerHTML = roundLogoHtml;

  const loginIcon = document.getElementById('login-logo-icon');
  if (loginIcon) loginIcon.innerHTML = roundLogoHtml;

  const btnQuickLock = document.getElementById('btn-quick-lock');
  if (btnQuickLock) {
    btnQuickLock.title = 'Sync with GitHub Now';
    btnQuickLock.innerHTML = UI_ICONS.refresh;
  }

  const setIcon = (id, iconSvg) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = iconSvg;
  };

  setIcon('settings-nav-icon', UI_ICONS.settings);
  setIcon('search-bar-icon', UI_ICONS.search);
  setIcon('add-plus-icon', UI_ICONS.plus);
  setIcon('btn-view-toggle', UI_ICONS.folder);
  setIcon('empty-state-icon-box', UI_ICONS.shield);
  setIcon('btn-close-drawer', UI_ICONS.close);
  setIcon('btn-close-entry-modal', UI_ICONS.close);
  setIcon('btn-close-sso-modal', UI_ICONS.close);
  setIcon('btn-toggle-pwd-vis', UI_ICONS.eye);
  setIcon('btn-unlock-vis', UI_ICONS.eye);

  const btnCloseSsoModal = document.getElementById('btn-close-sso-modal');
  if (btnCloseSsoModal) {
    btnCloseSsoModal.onclick = () => {
      const modal = document.getElementById('sso-modal');
      if (modal) modal.classList.remove('open');
    };
  }

  const ssoModal = document.getElementById('sso-modal');
  if (ssoModal) {
    ssoModal.addEventListener('click', (e) => {
      if (e.target === ssoModal) {
        ssoModal.classList.remove('open');
      }
    });
  }

  // Populate category select options in Add/Edit modal
  const catSelect = document.getElementById('entry-category');
  if (catSelect) {
    catSelect.innerHTML = '';
    CATEGORIES.filter(c => !['all', 'favorites', 'recent'].includes(c.id)).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });
  }
}

/**
 * Triggers background auto-sync if GitHub is configured.
 */
let isAutoSyncing = false;
async function triggerAutoSync() {
  if (isAutoSyncing) return;
  try {
    const settings = state.settings || (await window.vaultlyApi.getSettings());
    const gh = settings.github || {};
    if (!gh.owner || !gh.repo || !settings.hasGitHubToken) return;

    isAutoSyncing = true;
    const res = await window.vaultlyApi.syncWithGitHub(false);
    if (res && res.action !== 'updated_remote') {
      await refreshVaultData();
      if (res.action === 'merged_and_synced') {
        showToast(`Cloud sync: ${res.message}`, 'success');
      }
    }
  } catch (syncErr) {
    console.warn('Auto-sync notice:', syncErr.message);
  } finally {
    isAutoSyncing = false;
  }
}

/**
 * Shows interactive Neo-Brutalist prompt for cloud decryption password.
 */
function showCloudPasswordModal({ title, message, submitLabel, showOverwrite = false, onOverwrite = null, onSubmit, onCancel }) {
  const modal = document.getElementById('sso-modal');
  const modalTitle = document.getElementById('sso-modal-title');
  const modalBody = document.getElementById('sso-modal-body');
  if (!modal || !modalBody) return;

  modalTitle.textContent = title || 'Restore from GitHub Cloud';
  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.5rem 0.25rem;">
      <div style="width: 50px; height: 50px; background: #00E599; border: 2.5px solid #121212; box-shadow: 3px 3px 0px #121212; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.85rem;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>
      </div>

      <h2 style="font-size: 1.25rem; font-weight: 900; margin-bottom: 0.35rem; color: #121212;">
        ${escapeHtml(title || 'Restore from GitHub Cloud')}
      </h2>

      <p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; line-height: 1.45; margin-bottom: 1.15rem; white-space: pre-line;">
        ${escapeHtml(message || 'Enter your Master Password to decrypt and restore your passwords into this vault:')}
      </p>

      <form id="cloud-pwd-form" style="width: 100%; text-align: left;">
        <div style="position: relative; margin-bottom: 0.85rem;">
          <input
            type="password"
            id="cloud-pwd-input"
            class="form-input"
            placeholder="Master Password (if set)"
            style="width: 100%; padding-right: 2.5rem;"
            autocomplete="current-password"
            required
            autofocus
          />
          <button
            type="button"
            id="btn-toggle-cloud-pwd"
            style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px;"
            title="Show/hide password"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>

        <div id="cloud-pwd-error" style="display: none; color: #121212; background: #FFD2D9; border: 2px solid #121212; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 800; margin-bottom: 0.85rem; box-shadow: 2px 2px 0px #121212;"></div>

        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn-secondary" id="btn-cancel-cloud-pwd" style="flex: 1;">Cancel</button>
          <button type="submit" class="btn-primary" id="btn-submit-cloud-pwd" style="flex: 2; font-weight: 900;">${escapeHtml(submitLabel || 'Restore Passwords')}</button>
        </div>

        ${showOverwrite ? `
          <div style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1.5px dashed #121212; display: flex; flex-direction: column; gap: 0.45rem; text-align: center;">
            <button type="button" class="btn-secondary" id="btn-modal-overwrite-cloud" style="background: #FFE500; font-weight: 900; padding: 0.48rem 0.85rem; font-size: 0.8rem;">
              Overwrite Remote with Current Vault
            </button>
          </div>
        ` : ''}
      </form>
    </div>
  `;

  modal.classList.add('open');

  const toggleBtn = document.getElementById('btn-toggle-cloud-pwd');
  const pwdInput = document.getElementById('cloud-pwd-input');
  if (toggleBtn && pwdInput) {
    toggleBtn.onclick = () => {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    };
  }

  const cancelBtn = document.getElementById('btn-cancel-cloud-pwd');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.classList.remove('open');
      if (onCancel) onCancel();
    };
  }

  const overwriteBtn = document.getElementById('btn-modal-overwrite-cloud');
  const errorEl = document.getElementById('cloud-pwd-error');
  if (overwriteBtn && onOverwrite) {
    overwriteBtn.onclick = async () => {
      overwriteBtn.disabled = true;
      overwriteBtn.textContent = 'Overwriting Remote...';
      try {
        await onOverwrite();
        modal.classList.remove('open');
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = 'Overwrite failed: ' + err.message;
          errorEl.style.display = 'block';
        }
      } finally {
        overwriteBtn.disabled = false;
        overwriteBtn.textContent = 'Overwrite Remote with Current Vault';
      }
    };
  }

  const form = document.getElementById('cloud-pwd-form');
  const submitBtn = document.getElementById('btn-submit-cloud-pwd');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const pwd = pwdInput ? pwdInput.value : '';
      if (!pwd) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Decrypting & Syncing...';
      if (errorEl) errorEl.style.display = 'none';

      try {
        await onSubmit(pwd);
        modal.classList.remove('open');
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel || 'Sync Passwords';
        if (errorEl) {
          errorEl.textContent = err.message || 'Incorrect password. Could not decrypt cloud backup.';
          errorEl.style.display = 'block';
        }
      }
    };
  }
}

/**
 * Shows interactive Neo-Brutalist danger confirmation modal to reset all app data.
 */
function showResetAppDataModal({ onConfirm }) {
  const modal = document.getElementById('sso-modal');
  const modalTitle = document.getElementById('sso-modal-title');
  const modalBody = document.getElementById('sso-modal-body');
  if (!modal || !modalBody) return;

  modalTitle.textContent = 'Danger Zone: Reset App Data';
  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.5rem 0.25rem;">
      <div style="width: 52px; height: 52px; background: #FF3B5C; border: 2.5px solid #121212; box-shadow: 3px 3px 0px #121212; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.85rem; color: #FFFFFF;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </div>

      <h2 style="font-size: 1.25rem; font-weight: 900; margin-bottom: 0.35rem; color: #121212;">
        Reset All App Data?
      </h2>

      <div style="background: #FFE8EC; border: 2px solid #FF3B5C; border-radius: 8px; box-shadow: 2px 2px 0px #121212; padding: 0.85rem 1.1rem; margin-bottom: 1.25rem; text-align: left; width: 100%;">
        <p style="font-size: 0.82rem; font-weight: 900; color: #D61536; margin: 0 0 0.45rem 0; letter-spacing: 0.02em;">
          PERMANENT ACTION • STARTS FROM FIRST SCREEN
        </p>
        <ul style="font-size: 0.775rem; font-weight: 700; color: #121212; margin: 0; padding-left: 1.15rem; line-height: 1.5;">
          <li>Permanently deletes your local encrypted vault and all passwords</li>
          <li>Removes stored GitHub tokens and sync settings from this PC</li>
          <li>Vaultly will immediately restart fresh from the initial setup screen</li>
        </ul>
      </div>

      <div id="reset-confirm-error" style="display: none; width: 100%; color: #121212; background: #FFD2D9; border: 2px solid #121212; padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.76rem; font-weight: 800; margin-bottom: 0.85rem; box-shadow: 2px 2px 0px #121212;"></div>

      <div style="display: flex; gap: 0.75rem; width: 100%;">
        <button type="button" class="btn-secondary" id="btn-cancel-reset" style="flex: 1; font-weight: 800; padding: 0.6rem 1rem;">Cancel</button>
        <button type="button" class="btn-danger" id="btn-submit-reset" style="flex: 2; background: #FF3B5C; color: #FFFFFF; font-weight: 900; border: 2.5px solid #121212; box-shadow: 2.5px 2.5px 0px #121212; padding: 0.6rem 1rem;">Reset Everything & Start Fresh</button>
      </div>
    </div>
  `;

  modal.classList.add('open');

  const cancelBtn = document.getElementById('btn-cancel-reset');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.classList.remove('open');
    };
  }

  const errorEl = document.getElementById('reset-confirm-error');
  const submitBtn = document.getElementById('btn-submit-reset');

  if (submitBtn) {
    submitBtn.onclick = async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Erasing All Data...';
      if (cancelBtn) cancelBtn.disabled = true;
      if (errorEl) errorEl.style.display = 'none';

      try {
        await onConfirm();
        modal.classList.remove('open');
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Reset Everything & Start Fresh';
        }
        if (cancelBtn) cancelBtn.disabled = false;
        if (errorEl) {
          errorEl.textContent = 'Reset failed: ' + err.message;
          errorEl.style.display = 'block';
        }
      }
    };
  }
}

/**
 * Shows interactive Neo-Brutalist prompt to export .vaulty backup with optional password.
 */
function showExportBackupModal({ onSubmit }) {
  const modal = document.getElementById('sso-modal');
  const modalTitle = document.getElementById('sso-modal-title');
  const modalBody = document.getElementById('sso-modal-body');
  if (!modal || !modalBody) return;

  modalTitle.textContent = 'Export Encrypted .vaulty Backup';
  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.5rem 0.25rem;">
      <div style="width: 50px; height: 50px; background: #FFE500; border: 2.5px solid #121212; box-shadow: 3px 3px 0px #121212; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.85rem;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>

      <h2 style="font-size: 1.25rem; font-weight: 900; margin-bottom: 0.35rem; color: #121212;">
        Export .vaulty Backup
      </h2>

      <p style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; line-height: 1.45; margin-bottom: 1rem;">
        Set an optional password to protect this backup file, or leave blank to export an open portable backup that can be imported into any account without a password:
      </p>

      <div style="position: relative; width: 100%; margin-bottom: 1.15rem;">
        <input
          type="password"
          id="export-backup-pwd"
          placeholder="Backup Password (Optional — leave blank for no pass)"
          autocomplete="new-password"
          style="width: 100%; padding: 0.65rem 2.5rem 0.65rem 0.75rem; border: 2px solid #121212; border-radius: 6px; font-size: 0.88rem; font-weight: 600; background: #FFFFFF;"
        />
        <button
          type="button"
          id="btn-toggle-export-pwd"
          style="position: absolute; right: 0.65rem; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; color: #121212;"
          title="Toggle password visibility"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>

      <div style="display: flex; gap: 0.65rem; width: 100%;">
        <button
          type="button"
          id="btn-cancel-export-modal"
          class="btn-secondary"
          style="flex: 1; padding: 0.65rem 1rem; font-weight: 800; font-size: 0.88rem;"
        >
          Cancel
        </button>
        <button
          type="button"
          id="btn-confirm-export-modal"
          class="btn-primary"
          style="flex: 1.6; padding: 0.65rem 1rem; font-weight: 900; font-size: 0.88rem; background: #00E599;"
        >
          Export (No Password)
        </button>
      </div>
    </div>
  `;

  modal.classList.add('open');

  const pwdInput = document.getElementById('export-backup-pwd');
  const btnToggle = document.getElementById('btn-toggle-export-pwd');
  const btnCancel = document.getElementById('btn-cancel-export-modal');
  const btnConfirm = document.getElementById('btn-confirm-export-modal');

  if (btnToggle && pwdInput) {
    btnToggle.onclick = () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
    };
  }

  if (pwdInput && btnConfirm) {
    pwdInput.addEventListener('input', () => {
      const val = pwdInput.value.trim();
      if (val) {
        btnConfirm.textContent = 'Export with Password';
        btnConfirm.style.background = '#FFE500';
      } else {
        btnConfirm.textContent = 'Export (No Password)';
        btnConfirm.style.background = '#00E599';
      }
    });
  }

  if (btnCancel) {
    btnCancel.onclick = () => modal.classList.remove('open');
  }

  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      const pass = pwdInput ? pwdInput.value.trim() : '';
      modal.classList.remove('open');
      if (onSubmit) await onSubmit(pass || null);
    };
  }
}

/**
 * Shows point-in-time recovery modal displaying commit history from GitHub.
 */
async function showBackupHistoryModal() {
  const modal = document.getElementById('sso-modal');
  const modalTitle = document.getElementById('sso-modal-title');
  const modalBody = document.getElementById('sso-modal-body');
  if (!modal || !modalBody) return;

  modalTitle.textContent = 'GitHub Backup History';
  modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.5rem 0.25rem;">
      <div style="width: 50px; height: 50px; background: #00E599; border: 2.5px solid #121212; box-shadow: 3px 3px 0px #121212; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.85rem;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>

      <h2 style="font-size: 1.25rem; font-weight: 900; margin-bottom: 0.35rem; color: #121212;">
        GitHub Backup History
      </h2>

      <p style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; line-height: 1.45; margin-bottom: 1rem;">
        Restore previous vault snapshots preserved in your GitHub repository's commit history:
      </p>

      <div id="hist-loading" style="padding: 1.5rem; font-weight: 800; font-size: 0.88rem; color: #121212;">
        Loading backup history from GitHub...
      </div>

      <div id="hist-content" style="display: none; width: 100%; max-height: 340px; overflow-y: auto; text-align: left; display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1rem;">
      </div>

      <div id="hist-restore-form-container" style="display: none; width: 100%; text-align: left; background: #FBFBFB; border: 2px solid #121212; box-shadow: 2.5px 2.5px 0px #121212; border-radius: 8px; padding: 0.85rem; margin-bottom: 1rem;">
        <div style="font-size: 0.85rem; font-weight: 900; color: #121212; margin-bottom: 0.35rem;" id="hist-restore-title">
          Restore Selected Backup
        </div>
        <p style="font-size: 0.775rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.65rem;">
          Enter the Master Password used when this backup was saved:
        </p>
        <div style="position: relative; margin-bottom: 0.65rem;">
          <input type="password" id="hist-restore-pwd" class="form-input" placeholder="Master Password (if set)" style="width: 100%; font-size: 0.82rem;" />
        </div>
        <div id="hist-restore-error" style="display: none; color: #121212; background: #FFD2D9; border: 2px solid #121212; padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.76rem; font-weight: 800; margin-bottom: 0.65rem;"></div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="btn-secondary" id="btn-cancel-hist-restore" style="flex: 1; padding: 0.4rem 0.65rem; font-size: 0.8rem;">Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-hist-restore" style="flex: 2; padding: 0.4rem 0.65rem; font-size: 0.8rem; font-weight: 900; background: #00E599;">Decrypt & Restore to Vault</button>
        </div>
      </div>

      <div style="width: 100%; display: flex; justify-content: flex-end;">
        <button type="button" class="btn-secondary" id="btn-close-hist-modal" style="padding: 0.5rem 1.25rem; font-weight: 800;">Close</button>
      </div>
    </div>
  `;

  modal.classList.add('open');

  const closeBtn = document.getElementById('btn-close-hist-modal');
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('open');

  const loadingEl = document.getElementById('hist-loading');
  const contentEl = document.getElementById('hist-content');
  const restoreContainer = document.getElementById('hist-restore-form-container');
  const restoreTitle = document.getElementById('hist-restore-title');
  const restorePwdInput = document.getElementById('hist-restore-pwd');
  const restoreError = document.getElementById('hist-restore-error');
  const submitRestoreBtn = document.getElementById('btn-submit-hist-restore');
  const cancelRestoreBtn = document.getElementById('btn-cancel-hist-restore');

  let selectedCommitSha = null;

  try {
    const res = await window.vaultlyApi.getGitHubBackupHistory();
    if (loadingEl) loadingEl.style.display = 'none';

    if (!res || !res.success || !res.commits || res.commits.length === 0) {
      if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">No backup commits found for vaultly-vault.enc.json.</div>`;
      }
      return;
    }

    if (contentEl) {
      contentEl.style.display = 'flex';
      contentEl.innerHTML = '';

      res.commits.forEach((c, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'background: #FFFFFF; border: 2px solid #121212; box-shadow: 2px 2px 0px #121212; border-radius: 6px; padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.65rem;';

        const dateStr = c.date ? new Date(c.date).toLocaleString() : 'Unknown date';
        const isHead = idx === 0;
        const countDisplay = c.entryCount !== null ? `${c.entryCount} password${c.entryCount === 1 ? '' : 's'}` : 'Unknown';
        const badgeBg = c.entryCount > 0 ? '#00E599' : '#e2e8f0';

        item.innerHTML = `
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.2rem;">
              <code style="font-size: 0.75rem; font-weight: 800; background: #EFEFEF; border: 1px solid #121212; padding: 1px 5px; border-radius: 4px;">${escapeHtml(c.shortSha)}</code>
              <span style="font-size: 0.72rem; font-weight: 800; background: ${badgeBg}; border: 1px solid #121212; padding: 1px 6px; border-radius: 999px;">
                ${countDisplay}
              </span>
              ${isHead ? '<span style="font-size: 0.68rem; font-weight: 900; background: #FFE500; border: 1px solid #121212; padding: 1px 5px; border-radius: 4px;">HEAD</span>' : ''}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">
              ${escapeHtml(dateStr)}
            </div>
          </div>
          <div>
            <button type="button" class="btn-secondary btn-restore-commit" data-sha="${c.sha}" data-count="${c.entryCount}" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; font-weight: 800; background: ${c.entryCount > 0 ? '#FFE500' : '#FFFFFF'};">
              ${c.entryCount > 0 ? 'Restore' : 'Inspect'}
            </button>
          </div>
        `;

        const btn = item.querySelector('.btn-restore-commit');
        btn.onclick = async () => {
          selectedCommitSha = c.sha;
          btn.disabled = true;
          const origText = btn.textContent;
          btn.textContent = 'Restoring...';
          try {
            const res = await window.vaultlyApi.restoreFromGitHubCommit(c.sha, null);
            if (res && res.success) {
              showToast(res.message || 'Restored backup snapshot successfully!', 'success');
              const ssoModal = document.getElementById('sso-modal');
              if (ssoModal) ssoModal.classList.remove('open');
              await loadAppSettings();
              await refreshVaultData();
              return;
            }
          } catch (autoErr) {
            // If automatic restore with current profile key fails, open prompt for optional legacy password
            if (restoreContainer) {
              restoreContainer.style.display = 'block';
              restoreTitle.textContent = `Restore Backup from ${dateStr} (${countDisplay})`;
              if (restorePwdInput) {
                restorePwdInput.value = '';
                restorePwdInput.focus();
              }
              if (restoreError) {
                restoreError.textContent = 'This snapshot was encrypted with a different key. Please enter the password:';
                restoreError.style.display = 'block';
              }
            }
          } finally {
            btn.disabled = false;
            btn.textContent = origText;
          }
        };

        contentEl.appendChild(item);
      });
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) {
      contentEl.style.display = 'block';
      contentEl.innerHTML = `<div style="color: #FF3B5C; font-weight: 800; font-size: 0.85rem; padding: 1rem;">Failed to fetch history: ${escapeHtml(err.message)}</div>`;
    }
  }

  if (cancelRestoreBtn && restoreContainer) {
    cancelRestoreBtn.onclick = () => {
      restoreContainer.style.display = 'none';
      selectedCommitSha = null;
    };
  }

  if (submitRestoreBtn) {
    submitRestoreBtn.onclick = async () => {
      if (!selectedCommitSha) return;
      const pwd = restorePwdInput ? restorePwdInput.value.trim() : '';
      submitRestoreBtn.disabled = true;
      submitRestoreBtn.textContent = 'Decrypting & Restoring...';
      if (restoreError) restoreError.style.display = 'none';

      try {
        const res = await window.vaultlyApi.restoreFromGitHubCommit(selectedCommitSha, pwd || null);
        if (res && res.success) {
          showToast(res.message, 'success');
          modal.classList.remove('open');
          await loadAppSettings();
          await refreshVaultData();
        } else {
          throw new Error(res?.error || 'Restore failed');
        }
      } catch (err) {
        submitRestoreBtn.disabled = false;
        submitRestoreBtn.textContent = 'Decrypt & Restore to Vault';
        if (restoreError) {
          restoreError.textContent = err.message || 'Incorrect master password for this backup snapshot.';
          restoreError.style.display = 'block';
        }
      }
    };
  }
}

/**
 * Imports and merges a .vaulty / .vaultly backup file into the local vault.
 */
async function handleImportVaultyFile(customPass = null) {
  try {
    const res = await window.vaultlyApi.restoreBackupFile(customPass);
    if (!res || res.canceled) return;
    if (res.success) {
      showToast(res.message || `Imported passwords from .vaulty! Total in vault: ${res.count}`, 'success');
      state.vaultState = 'unlocked';
      showScreen('app');
      await loadAppSettings();
      await refreshVaultData();
    }
  } catch (err) {
    if (err.code === 'DECRYPT_FAILED' || (err.message && (err.message.includes('decrypt') || err.message.includes('password')))) {
      showCloudPasswordModal({
        title: 'Decrypt .vaulty Backup',
        message: 'This .vaulty backup was protected with a password when exported. Enter the password to decrypt and merge into this vault:',
        submitLabel: 'Decrypt & Import',
        onSubmit: async (pass) => {
          await handleImportVaultyFile(pass);
        }
      });
    } else {
      showToast('Import failed: ' + err.message, 'error');
    }
  }
}

/**
 * Checks vault initialization and GitHub authentication status.
 */
async function checkVaultState() {
  try {
    const authStatus = await window.vaultlyApi.checkAuthStatus();
    if (!authStatus.configured || !authStatus.unlocked) {
      state.vaultState = 'locked';
      showScreen('login', authStatus);
      updateTitlebarStatus(false, 0);
    } else {
      state.vaultState = 'unlocked';
      showScreen('app');
      updateTitlebarStatus(true, authStatus.entryCount || 0);
      await loadAppSettings();
      await refreshVaultData();
      triggerAutoSync();
    }
  } catch (err) {
    showToast('Failed to verify GitHub connection: ' + err.message, 'error');
    showScreen('login');
  }
}

let isDeviceAuthPolling = false;
let cachedUserRepos = null;

/**
 * Initiates the GitHub Device Code OAuth flow, presents modal, copies code,
 * opens browser verification, and waits for background polling completion.
 */
async function startGitHubDeviceAuthFlow(onSuccess) {
  const modal = document.getElementById('github-device-modal');
  const codeDisplay = document.getElementById('device-code-display');
  const statusText = document.getElementById('device-auth-status-text');
  const copyOpenBtn = document.getElementById('btn-device-copy-open');
  const cancelBtn = document.getElementById('btn-device-cancel');
  const closeBtn = document.getElementById('btn-close-device-modal');

  let currentVerificationUri = 'https://github.com/login/device';
  let currentUserCode = '';

  try {
    if (codeDisplay) codeDisplay.textContent = 'CONNECTING...';
    if (statusText) statusText.textContent = 'Requesting authorization code from GitHub...';
    if (modal) modal.classList.add('open');

    const res = await window.vaultlyApi.startGitHubDeviceLogin();
    if (!res || !res.userCode) {
      throw new Error('Failed to retrieve device code from GitHub.');
    }

    currentUserCode = res.userCode;
    currentVerificationUri = res.verificationUri || 'https://github.com/login/device';

    if (codeDisplay) codeDisplay.textContent = currentUserCode;
    if (statusText) statusText.textContent = 'Code copied! Waiting for approval in browser...';

    // Copy to clipboard automatically & open browser
    await window.vaultlyApi.copyToClipboard(currentUserCode, false);
    await window.vaultlyApi.openExternalUrl(currentVerificationUri);
    showToast(`Code ${currentUserCode} copied! Opening browser...`, 'info');

    // Bind copy & open button
    if (copyOpenBtn) {
      copyOpenBtn.onclick = async () => {
        if (currentUserCode) {
          await window.vaultlyApi.copyToClipboard(currentUserCode, false);
          await window.vaultlyApi.openExternalUrl(currentVerificationUri);
          showToast(`Code ${currentUserCode} copied!`, 'info');
        }
      };
    }

    const handleCancel = async () => {
      isDeviceAuthPolling = false;
      try {
        await window.vaultlyApi.cancelGitHubDeviceLogin();
      } catch (_) {}
      if (modal) modal.classList.remove('open');
      showToast('GitHub sign-in canceled', 'info');
    };

    if (cancelBtn) cancelBtn.onclick = handleCancel;
    if (closeBtn) closeBtn.onclick = handleCancel;

    // Start polling in background
    isDeviceAuthPolling = true;
    const pollRes = await window.vaultlyApi.pollGitHubDeviceLogin();

    if (pollRes && pollRes.success) {
      isDeviceAuthPolling = false;
      cachedUserRepos = null; // Invalidate repo cache on new auth
      if (modal) modal.classList.remove('open');
      showToast(`Signed in to GitHub as @${pollRes.user.login}!`, 'success');
      if (typeof onSuccess === 'function') {
        await onSuccess(pollRes.user);
      }
    }
  } catch (err) {
    if (isDeviceAuthPolling) {
      showToast('GitHub sign-in: ' + err.message, 'error');
    }
    isDeviceAuthPolling = false;
    if (modal) modal.classList.remove('open');
  }
}

/**
 * Loads repositories into a given <select> element, binds filter input,
 * and sets up live inspection of vault backup existence.
 */
async function loadRepositoriesList({
  selectEl,
  badgeEl,
  searchInputEl,
  bannerEl,
  connectBtn,
  branchInputEl,
  selectedOwner,
  selectedRepo,
  forceRefresh = false
}) {
  if (!selectEl) return;

  if (badgeEl) badgeEl.textContent = 'Loading...';
  selectEl.innerHTML = '<option value="">Loading repositories...</option>';
  selectEl.disabled = true;

  try {
    if (!cachedUserRepos || forceRefresh) {
      cachedUserRepos = await window.vaultlyApi.getGitHubUserRepos();
    }

    const repos = cachedUserRepos || [];
    if (badgeEl) badgeEl.textContent = `${repos.length} found`;

    function renderOptions(filterText = '') {
      const q = filterText.toLowerCase().trim();
      const filtered = repos.filter(r =>
        !q || r.name.toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q) || (r.owner && r.owner.toLowerCase().includes(q))
      );

      selectEl.innerHTML = '';
      if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = q ? 'No repositories match filter' : 'No repositories found';
        opt.disabled = true;
        selectEl.appendChild(opt);
        return;
      }

      filtered.forEach(r => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ owner: r.owner, repo: r.name, branch: r.defaultBranch || 'main', isPrivate: r.isPrivate });
        const privacyTag = r.isPrivate ? '🔒 [Private]' : '🌐 [Public]';
        opt.textContent = `${privacyTag} ${r.fullName || `${r.owner}/${r.name}`}`;
        if (selectedOwner && selectedRepo && r.owner.toLowerCase() === selectedOwner.toLowerCase() && r.name.toLowerCase() === selectedRepo.toLowerCase()) {
          opt.selected = true;
        }
        selectEl.appendChild(opt);
      });

      // If nothing selected, select the first option
      if (!selectEl.value && filtered.length > 0) {
        selectEl.selectedIndex = 0;
      }
    }

    renderOptions(searchInputEl ? searchInputEl.value : '');
    selectEl.disabled = false;

    const triggerRepoCheck = () => {
      if (!selectEl.value) {
        if (bannerEl) bannerEl.style.display = 'none';
        return;
      }
      try {
        const item = JSON.parse(selectEl.value);
        if (branchInputEl && (!branchInputEl.value || branchInputEl.value === 'main')) {
          branchInputEl.value = item.branch || 'main';
        }
        checkAndDisplayRepoVault(item.owner, item.repo, branchInputEl ? branchInputEl.value : item.branch, bannerEl, connectBtn);
      } catch (_) {}
    };

    if (searchInputEl) {
      searchInputEl.oninput = () => {
        renderOptions(searchInputEl.value);
        triggerRepoCheck();
      };
    }

    selectEl.onchange = triggerRepoCheck;
    triggerRepoCheck();

  } catch (err) {
    if (badgeEl) badgeEl.textContent = 'Error';
    selectEl.innerHTML = `<option value="">Failed to load: ${err.message}</option>`;
    selectEl.disabled = false;
  }
}

/**
 * Checks if a repository contains an existing encrypted vault file and displays
 * informative brutalist status badge/banner.
 */
async function checkAndDisplayRepoVault(owner, repo, branch, bannerEl, connectBtn) {
  if (!bannerEl || !owner || !repo) return;
  bannerEl.style.display = 'block';
  bannerEl.style.background = '#FFFDF8';
  bannerEl.style.borderColor = '#121212';
  bannerEl.style.color = '#121212';
  bannerEl.textContent = 'Inspecting repository for existing vault...';

  try {
    const res = await window.vaultlyApi.checkRepoVault(owner, repo, branch || 'main');
    if (res.found) {
      bannerEl.style.background = '#E8F5E9';
      bannerEl.style.borderColor = '#00E599';
      bannerEl.style.color = '#121212';
      const count = res.entryCount ?? '?';
      const timeStr = res.updatedAt ? new Date(res.updatedAt).toLocaleString() : 'recently';
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.95rem;">📦</span>
          <div>
            <strong>Existing Vault Found:</strong> Contains <strong>${count}</strong> encrypted passwords (last synced: ${timeStr}).
          </div>
        </div>
      `;
      if (connectBtn) {
        connectBtn.textContent = 'Connect & Restore Vault';
      }
    } else {
      bannerEl.style.background = '#FFFDE7';
      bannerEl.style.borderColor = '#121212';
      bannerEl.style.color = '#121212';
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.95rem;">✨</span>
          <div>
            <strong>Clean Repository:</strong> No existing <code>vaultly-vault.enc.json</code> found. Connecting will initialize cloud backup here.
          </div>
        </div>
      `;
      if (connectBtn) {
        connectBtn.textContent = 'Connect & Sync Repository';
      }
    }
  } catch (err) {
    bannerEl.style.background = '#FFFDF8';
    bannerEl.style.borderColor = '#FFA800';
    bannerEl.innerHTML = `⚠️ <span>Notice: ${err.message}</span>`;
  }
}

/**
 * Opens modal for choosing or changing repository in Settings.
 */
async function openChooseRepoModal() {
  const modal = document.getElementById('github-repo-modal');
  if (!modal) return;

  const userAvatar = document.getElementById('modal-repo-user-avatar');
  const userFallback = document.getElementById('modal-repo-user-avatar-fallback');
  const userLogin = document.getElementById('modal-repo-user-login');
  const userName = document.getElementById('modal-repo-user-name');
  const selectEl = document.getElementById('modal-repo-select');
  const countBadge = document.getElementById('modal-repo-count-badge');
  const filterInput = document.getElementById('modal-repo-filter');
  const refreshBtn = document.getElementById('btn-modal-repo-refresh');
  const switchBtn = document.getElementById('btn-modal-repo-switch');
  const createInput = document.getElementById('modal-new-repo-name');
  const createBtn = document.getElementById('btn-modal-create-repo');
  const bannerEl = document.getElementById('modal-repo-detect-status');
  const branchInput = document.getElementById('modal-repo-branch');
  const autoSyncInput = document.getElementById('modal-repo-autosync');
  const cancelBtn = document.getElementById('btn-modal-repo-cancel');
  const closeBtn = document.getElementById('btn-close-repo-modal');
  const confirmBtn = document.getElementById('btn-modal-repo-confirm');

  // Load user profile info
  const user = state.settings?.github?.user || null;
  const owner = state.settings?.github?.owner || '';
  const repo = state.settings?.github?.repo || '';
  const branch = state.settings?.github?.branch || 'main';
  const autoSync = state.settings?.github?.autoSync !== false;

  if (userLogin) userLogin.textContent = `@${user?.login || owner || 'github-user'}`;
  if (userName) userName.textContent = user?.name || '';
  if (user?.avatarUrl) {
    if (userAvatar) {
      userAvatar.src = user.avatarUrl;
      userAvatar.style.display = 'block';
    }
    if (userFallback) userFallback.style.display = 'none';
  } else {
    if (userAvatar) userAvatar.style.display = 'none';
    if (userFallback) userFallback.style.display = 'flex';
  }

  if (branchInput) branchInput.value = branch;
  if (autoSyncInput) autoSyncInput.checked = autoSync;

  const closeModal = () => modal.classList.remove('open');
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (closeBtn) closeBtn.onclick = closeModal;

  // Switch account button
  if (switchBtn) {
    switchBtn.onclick = async () => {
      closeModal();
      await window.vaultlyApi.disconnectGitHub();
      cachedUserRepos = null;
      state.settings.hasGitHubToken = false;
      showToast('Logged out of GitHub', 'info');
      await loadAppSettings();
      showSettingsView(true);
      startGitHubDeviceAuthFlow(async () => {
        await loadAppSettings();
        showSettingsView(true);
      });
    };
  }

  // Refresh repos button
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      loadRepositoriesList({
        selectEl,
        badgeEl: countBadge,
        searchInputEl: filterInput,
        bannerEl,
        connectBtn: confirmBtn,
        branchInputEl: branchInput,
        selectedOwner: owner,
        selectedRepo: repo,
        forceRefresh: true
      });
    };
  }

  // Create repo button
  if (createBtn) {
    createBtn.onclick = async () => {
      const newName = (createInput ? createInput.value : '').trim();
      if (!newName) {
        showToast('Please enter a repository name', 'warning');
        return;
      }
      try {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        const created = await window.vaultlyApi.createPrivateGitHubRepo(newName);
        showToast(`Created private repository ${created.owner}/${created.repo}!`, 'success');
        await loadRepositoriesList({
          selectEl,
          badgeEl: countBadge,
          searchInputEl: filterInput,
          bannerEl,
          connectBtn: confirmBtn,
          branchInputEl: branchInput,
          selectedOwner: created.owner,
          selectedRepo: created.repo,
          forceRefresh: true
        });
      } catch (err) {
        showToast('Failed to create repository: ' + err.message, 'error');
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = '+ Create Private';
      }
    };
  }

  // Confirm button
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      if (!selectEl || !selectEl.value) {
        showToast('Please select a repository first', 'warning');
        return;
      }
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Connecting & Syncing...';
        const sel = JSON.parse(selectEl.value);
        const br = (branchInput ? branchInput.value : 'main').trim() || 'main';
        const as = autoSyncInput ? autoSyncInput.checked : true;

        const res = await window.vaultlyApi.loginWithGitHubDetails({
          owner: sel.owner,
          repo: sel.repo,
          branch: br,
          autoSync: as
        });

        closeModal();
        showToast(`Switched repository to @${res.owner}/${res.repo}! Loaded ${res.entryCount} passwords.`, 'success');
        await loadAppSettings();
        await refreshVaultData();
        showSettingsView(true);
      } catch (err) {
        showToast('Failed to connect repository: ' + err.message, 'error');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Connect & Sync Repository';
      }
    };
  }

  modal.classList.add('open');

  await loadRepositoriesList({
    selectEl,
    badgeEl: countBadge,
    searchInputEl: filterInput,
    bannerEl,
    connectBtn: confirmBtn,
    branchInputEl: branchInput,
    selectedOwner: owner,
    selectedRepo: repo
  });
}

/**
 * Switches screen between GitHub credentials login and main app workspace.
 */
function showScreen(screen, data = {}) {
  const loginEl = document.getElementById('github-login-screen');
  const appRoot = document.getElementById('app-root');

  if (screen === 'login') {
    if (loginEl) loginEl.style.display = 'flex';
    if (appRoot) appRoot.style.display = 'none';

    const ghLoginView = document.getElementById('gh-login-view');
    const ghChooseRepoView = document.getElementById('gh-choose-repo-view');
    const ghManualPatContainer = document.getElementById('gh-manual-pat-container');

    const hasToken = Boolean(data.hasToken);

    if (hasToken) {
      if (ghChooseRepoView) ghChooseRepoView.style.display = 'flex';
      if (ghLoginView) ghLoginView.style.display = 'none';
      if (ghManualPatContainer) ghManualPatContainer.style.display = 'none';

      // Update user details
      const user = data.user || null;
      const userLoginEl = document.getElementById('login-user-login');
      const userNameEl = document.getElementById('login-user-name');
      const userAvatarEl = document.getElementById('login-user-avatar');
      const userAvatarFallback = document.getElementById('login-user-avatar-fallback');

      if (userLoginEl) userLoginEl.textContent = `@${user?.login || data.owner || 'github-user'}`;
      if (userNameEl) userNameEl.textContent = user?.name || '';
      if (user?.avatarUrl) {
        if (userAvatarEl) {
          userAvatarEl.src = user.avatarUrl;
          userAvatarEl.style.display = 'block';
        }
        if (userAvatarFallback) userAvatarFallback.style.display = 'none';
      } else {
        if (userAvatarEl) userAvatarEl.style.display = 'none';
        if (userAvatarFallback) userAvatarFallback.style.display = 'flex';
      }

      if (data.branch) {
        const branchEl = document.getElementById('login-chosen-branch');
        if (branchEl) branchEl.value = data.branch;
      }
      if (data.autoSync !== undefined) {
        const autoSyncEl = document.getElementById('login-chosen-autosync');
        if (autoSyncEl) autoSyncEl.checked = data.autoSync;
      }

      // Populate repo dropdown
      loadRepositoriesList({
        selectEl: document.getElementById('login-repo-dropdown'),
        badgeEl: document.getElementById('login-repo-count-badge'),
        searchInputEl: document.getElementById('login-repo-search-input'),
        bannerEl: document.getElementById('login-chosen-repo-banner'),
        connectBtn: document.getElementById('btn-login-chosen-connect'),
        branchInputEl: document.getElementById('login-chosen-branch'),
        selectedOwner: data.owner,
        selectedRepo: data.repo
      });
    } else {
      if (ghLoginView) ghLoginView.style.display = 'flex';
      if (ghChooseRepoView) ghChooseRepoView.style.display = 'none';
      if (ghManualPatContainer) ghManualPatContainer.style.display = 'none';
    }

    // Populate or reset manual PAT fields
    const ownerInput = document.getElementById('login-gh-owner');
    const repoInput = document.getElementById('login-gh-repo');
    const branchInput = document.getElementById('login-gh-branch');
    const autoSyncInput = document.getElementById('login-gh-autosync');
    const tokenInput = document.getElementById('login-gh-token');

    if (ownerInput) ownerInput.value = data.owner || '';
    if (repoInput) repoInput.value = data.repo || '';
    if (branchInput) branchInput.value = data.branch || 'main';
    if (autoSyncInput) autoSyncInput.checked = data.autoSync !== undefined ? data.autoSync : true;

    if (tokenInput) {
      tokenInput.value = '';
    }

    // Reset login connection preview
    const loginGhStatusDot = document.getElementById('login-gh-status-dot');
    const loginGhStatusBadge = document.getElementById('login-gh-status-badge');
    const loginGhStatusMsg = document.getElementById('login-gh-status-msg');
    const loginGhRepoLink = document.getElementById('login-gh-repo-link');
    const btnLoginOpenRepo = document.getElementById('btn-login-open-repo');
    const btnLoginCopyRepo = document.getElementById('btn-login-copy-repo');

    if (data.owner && data.repo) {
      const url = `https://github.com/${data.owner}/${data.repo}`;
      if (loginGhRepoLink) {
        loginGhRepoLink.textContent = url;
        loginGhRepoLink.title = `Open ${url}`;
      }
      if (btnLoginOpenRepo) btnLoginOpenRepo.disabled = false;
      if (btnLoginCopyRepo) btnLoginCopyRepo.disabled = false;
    } else {
      if (loginGhRepoLink) {
        loginGhRepoLink.textContent = 'https://github.com/(owner)/(repo)';
        loginGhRepoLink.title = 'Enter owner and repository name above';
      }
      if (btnLoginOpenRepo) btnLoginOpenRepo.disabled = true;
      if (btnLoginCopyRepo) btnLoginCopyRepo.disabled = true;
    }

    if (loginGhStatusDot) loginGhStatusDot.style.background = '#94a3b8';
    if (loginGhStatusBadge) {
      loginGhStatusBadge.textContent = 'Not Connected';
      loginGhStatusBadge.style.background = '#e2e8f0';
      loginGhStatusBadge.style.color = '#475569';
    }
    if (loginGhStatusMsg) {
      loginGhStatusMsg.textContent = 'Click "Test Connection" to verify repository';
    }
  } else {
    if (loginEl) loginEl.style.display = 'none';
    if (appRoot) appRoot.style.display = 'flex';
  }
}

/**
 * Loads user settings and applies active theme and accent colors.
 */
async function loadAppSettings() {
  try {
    const settings = await window.vaultlyApi.getSettings();
    state.settings = settings;
    applyThemeAndAccent(settings.theme, settings.accentColor);
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

/**
 * Applies CSS theme and accent color variables.
 */
function applyThemeAndAccent(theme, accentColor) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'cyber') {
    document.documentElement.setAttribute('data-theme', 'cyber');
  } else {
    // Default is Brutalist Cream!
    document.documentElement.removeAttribute('data-theme');
  }

  if (accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    document.documentElement.style.setProperty('--accent-glow', `${accentColor}40`);
  }
}

/**
 * Refreshes entries from the vault and updates sidebar counts.
 */
async function refreshVaultData() {
  try {
    const entries = await window.vaultlyApi.getEntries({
      category: state.currentCategory,
      search: state.searchQuery,
      sortBy: state.sortBy
    });
    state.entries = entries;

    // Fetch all entries count per category
    const allEntries = await window.vaultlyApi.getEntries({ category: 'all' });
    const counts = calculateCategoryCounts(allEntries);

    renderSidebar(
      document.getElementById('sidebar-nav'),
      CATEGORIES,
      state.currentCategory,
      counts,
      (catId) => {
        state.isSettingsOpen = false;
        state.currentCategory = catId;
        updatePageTitles(catId);
        showSettingsView(false);
        refreshVaultData();
      }
    );

    renderEntries();
    updateTitlebarStatus(true, allEntries.length);
  } catch (err) {
    showToast('Failed to load passwords: ' + err.message, 'error');
  }
}

/**
 * Calculates item counts for categories.
 */
function calculateCategoryCounts(allEntries) {
  const counts = { all: allEntries.length, favorites: 0, recent: 0 };
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);

  CATEGORIES.forEach(c => {
    if (!['all', 'favorites', 'recent'].includes(c.id)) {
      counts[c.id] = 0;
    }
  });

  allEntries.forEach(e => {
    if (e.isFavorite) counts.favorites++;
    if (new Date(e.createdAt || e.updatedAt).getTime() >= cutoff) counts.recent++;
    if (e.category && counts[e.category] !== undefined) {
      counts[e.category]++;
    }
  });

  return counts;
}

/**
 * Updates page title and subtitle.
 */
function updatePageTitles(catId) {
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  const cat = CATEGORIES.find(c => c.id === catId);

  titleEl.textContent = cat ? cat.name : 'Passwords';
  if (catId === 'favorites') {
    subEl.textContent = 'Your starred and prioritized entries';
  } else if (catId === 'recent') {
    subEl.textContent = 'Entries added or updated in the last 14 days';
  } else {
    subEl.textContent = `Showing ${cat ? cat.name.toLowerCase() : ''} passwords`;
  }
}

/**
 * Renders the password card list or empty state.
 */
function renderEntries() {
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');

  container.innerHTML = '';
  container.className = state.viewMode === 'list' ? 'cards-list' : 'cards-grid';

  if (!state.entries || state.entries.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    const restoreHistBtn = document.getElementById('btn-empty-restore-hist');
    if (restoreHistBtn) {
      const gh = state.settings?.github || {};
      if (gh.owner && gh.repo) {
        restoreHistBtn.style.display = 'inline-block';
        restoreHistBtn.onclick = () => showBackupHistoryModal();
      } else {
        restoreHistBtn.style.display = 'none';
      }
    }
    return;
  }

  container.style.display = state.viewMode === 'list' ? 'flex' : 'grid';
  emptyState.style.display = 'none';

  state.entries.forEach(entry => {
    const card = createPasswordCard(
      entry,
      (selected) => openDetailsDrawer(selected),
      (e) => copyTextToClipboard(e.username, false, 'Username copied to clipboard'),
      (e) => copyTextToClipboard(e.password, true, 'Password copied! (Clipboard auto-clears)'),
      async (e) => {
        try {
          await window.vaultlyApi.toggleFavorite(e.id);
          await refreshVaultData();
        } catch (err) {
          showToast('Failed to toggle favorite: ' + err.message, 'error');
        }
      }
    );
    container.appendChild(card);
  });
}

/**
 * Copies text using secure clipboard API.
 */
async function copyTextToClipboard(text, isSensitive, message) {
  try {
    await window.vaultlyApi.copyToClipboard(text, isSensitive);
    showToast(message, 'success');
  } catch (err) {
    showToast('Failed to copy to clipboard', 'error');
  }
}

/**
 * Opens details drawer for an entry.
 */
function openDetailsDrawer(entry) {
  state.selectedEntry = entry;
  const drawer = document.getElementById('details-drawer');
  const body = document.getElementById('detail-drawer-body');
  const iconBox = document.getElementById('detail-icon-box');
  const nameEl = document.getElementById('detail-service-name');
  const tagEl = document.getElementById('detail-category-tag');

  iconBox.innerHTML = getIconSvg(entry.icon || entry.service);
  nameEl.textContent = entry.service;
  tagEl.textContent = (entry.category || 'other').toUpperCase();

  renderDetailDrawer(body, entry, {
    onCopyUser: (e) => copyTextToClipboard(e.username, false, 'Username copied!'),
    onCopyPassword: (e) => copyTextToClipboard(e.password, true, 'Password copied! (Protected)'),
    onCopyUrl: (url) => copyTextToClipboard(url, false, 'URL copied!')
  });

  drawer.classList.add('open');
}

function closeDetailsDrawer() {
  document.getElementById('details-drawer').classList.remove('open');
  state.selectedEntry = null;
}

/**
 * Sets up all UI event listeners.
 */
function setupEventListeners() {
  // --- GitHub 1-Click Login & Repo Chooser Listeners ---
  const btnStartGhLogin = document.getElementById('btn-start-gh-login');
  if (btnStartGhLogin) {
    btnStartGhLogin.addEventListener('click', () => {
      startGitHubDeviceAuthFlow(async (user) => {
        await checkVaultState();
      });
    });
  }

  const btnToggleManualPat = document.getElementById('btn-toggle-manual-pat');
  const btnHideManualPat = document.getElementById('btn-hide-manual-pat');
  const ghLoginView = document.getElementById('gh-login-view');
  const ghManualPatContainer = document.getElementById('gh-manual-pat-container');

  if (btnToggleManualPat) {
    btnToggleManualPat.addEventListener('click', () => {
      if (ghLoginView) ghLoginView.style.display = 'none';
      if (ghManualPatContainer) ghManualPatContainer.style.display = 'block';
    });
  }

  if (btnHideManualPat) {
    btnHideManualPat.addEventListener('click', () => {
      if (ghManualPatContainer) ghManualPatContainer.style.display = 'none';
      if (ghLoginView) ghLoginView.style.display = 'flex';
    });
  }

  const btnLoginSwitchAccount = document.getElementById('btn-login-switch-account');
  if (btnLoginSwitchAccount) {
    btnLoginSwitchAccount.addEventListener('click', async () => {
      try {
        await window.vaultlyApi.disconnectGitHub();
        cachedUserRepos = null;
        showToast('Logged out of GitHub', 'info');
        await checkVaultState();
      } catch (err) {
        showToast('Logout error: ' + err.message, 'error');
      }
    });
  }

  const btnLoginRefreshRepos = document.getElementById('btn-login-refresh-repos');
  if (btnLoginRefreshRepos) {
    btnLoginRefreshRepos.addEventListener('click', () => {
      loadRepositoriesList({
        selectEl: document.getElementById('login-repo-dropdown'),
        badgeEl: document.getElementById('login-repo-count-badge'),
        searchInputEl: document.getElementById('login-repo-search-input'),
        bannerEl: document.getElementById('login-chosen-repo-banner'),
        connectBtn: document.getElementById('btn-login-chosen-connect'),
        branchInputEl: document.getElementById('login-chosen-branch'),
        forceRefresh: true
      });
    });
  }

  const btnLoginCreateRepoAction = document.getElementById('btn-login-create-repo-action');
  const loginNewRepoInput = document.getElementById('login-new-repo-input');
  if (btnLoginCreateRepoAction) {
    btnLoginCreateRepoAction.addEventListener('click', async () => {
      const repoName = (loginNewRepoInput ? loginNewRepoInput.value : '').trim();
      if (!repoName) {
        showToast('Please enter a repository name', 'warning');
        return;
      }
      try {
        btnLoginCreateRepoAction.disabled = true;
        btnLoginCreateRepoAction.textContent = 'Creating...';
        const created = await window.vaultlyApi.createPrivateGitHubRepo(repoName);
        showToast(`Created private repository ${created.owner}/${created.repo}!`, 'success');
        await loadRepositoriesList({
          selectEl: document.getElementById('login-repo-dropdown'),
          badgeEl: document.getElementById('login-repo-count-badge'),
          searchInputEl: document.getElementById('login-repo-search-input'),
          bannerEl: document.getElementById('login-chosen-repo-banner'),
          connectBtn: document.getElementById('btn-login-chosen-connect'),
          branchInputEl: document.getElementById('login-chosen-branch'),
          selectedOwner: created.owner,
          selectedRepo: created.repo,
          forceRefresh: true
        });
      } catch (err) {
        showToast('Failed to create repository: ' + err.message, 'error');
      } finally {
        btnLoginCreateRepoAction.disabled = false;
        btnLoginCreateRepoAction.textContent = '+ Create Private Repo';
      }
    });
  }

  const btnLoginChosenTest = document.getElementById('btn-login-chosen-test');
  const loginChosenError = document.getElementById('login-chosen-error');
  if (btnLoginChosenTest) {
    btnLoginChosenTest.addEventListener('click', async () => {
      if (loginChosenError) loginChosenError.style.display = 'none';
      const selectEl = document.getElementById('login-repo-dropdown');
      if (!selectEl || !selectEl.value) {
        showToast('Please select a repository to test.', 'warning');
        return;
      }
      try {
        btnLoginChosenTest.disabled = true;
        btnLoginChosenTest.textContent = 'Testing...';
        const item = JSON.parse(selectEl.value);
        const testRes = await window.vaultlyApi.testGitHubConnection(item.owner, item.repo);
        if (testRes.repoExists) {
          showToast(`Repository verified: @${testRes.user}/${item.repo}`, 'success');
        } else {
          showToast(testRes.message || 'Repository not accessible', 'warning');
        }
      } catch (err) {
        if (loginChosenError) {
          loginChosenError.textContent = err.message || 'Connection test failed.';
          loginChosenError.style.display = 'block';
        }
        showToast('Connection test failed: ' + err.message, 'error');
      } finally {
        btnLoginChosenTest.disabled = false;
        btnLoginChosenTest.textContent = 'Test Selected';
      }
    });
  }

  const btnLoginChosenConnect = document.getElementById('btn-login-chosen-connect');
  if (btnLoginChosenConnect) {
    btnLoginChosenConnect.addEventListener('click', async () => {
      if (loginChosenError) loginChosenError.style.display = 'none';
      const selectEl = document.getElementById('login-repo-dropdown');
      if (!selectEl || !selectEl.value) {
        showToast('Please select a repository first.', 'warning');
        return;
      }
      try {
        btnLoginChosenConnect.disabled = true;
        btnLoginChosenConnect.textContent = 'Connecting & Synchronizing...';
        const item = JSON.parse(selectEl.value);
        const branch = (document.getElementById('login-chosen-branch')?.value || 'main').trim() || 'main';
        const autoSync = document.getElementById('login-chosen-autosync')?.checked ?? true;

        const res = await window.vaultlyApi.loginWithGitHubDetails({
          owner: item.owner,
          repo: item.repo,
          branch,
          autoSync
        });

        showToast(`Connected to @${res.owner}/${res.repo}! Loaded ${res.entryCount} passwords.`, 'success');
        await checkVaultState();
      } catch (err) {
        if (loginChosenError) {
          loginChosenError.textContent = err.message || 'Failed to connect repository.';
          loginChosenError.style.display = 'block';
        }
        showToast('Connection failed: ' + err.message, 'error');
      } finally {
        btnLoginChosenConnect.disabled = false;
        btnLoginChosenConnect.textContent = 'Connect & Sync Repository';
      }
    });
  }

  // --- GitHub Credentials & Local Vault Setup Screen (Manual PAT Fallback) ---
  const ghLoginForm = document.getElementById('github-login-form');
  const ghLoginToken = document.getElementById('login-gh-token');
  const ghLoginOwner = document.getElementById('login-gh-owner');
  const ghLoginRepo = document.getElementById('login-gh-repo');
  const ghLoginBranch = document.getElementById('login-gh-branch');
  const ghLoginAutoSync = document.getElementById('login-gh-autosync');
  const ghLoginError = document.getElementById('login-gh-error');
  const ghLoginSubmitBtn = document.getElementById('btn-submit-gh-login');
  const ghToggleTokenBtn = document.getElementById('btn-toggle-login-token');
  const linkCreateLoginPat = document.getElementById('link-create-login-pat');
  const btnSaveLocal = document.getElementById('btn-save-local');
  const btnLoginTestGh = document.getElementById('btn-login-test-gh');
  const btnLoginRestoreCloud = document.getElementById('btn-login-restore-cloud');
  const btnLoginImportVaulty = document.getElementById('btn-login-import-vaulty');

  if (btnLoginImportVaulty) {
    btnLoginImportVaulty.addEventListener('click', () => {
      handleImportVaultyFile();
    });
  }

  if (ghToggleTokenBtn && ghLoginToken) {
    ghToggleTokenBtn.innerHTML = UI_ICONS.eye;
    ghToggleTokenBtn.addEventListener('click', () => {
      const isPass = ghLoginToken.type === 'password';
      ghLoginToken.type = isPass ? 'text' : 'password';
      ghToggleTokenBtn.innerHTML = isPass ? UI_ICONS.eyeOff : UI_ICONS.eye;
    });
  }

  if (linkCreateLoginPat) {
    linkCreateLoginPat.addEventListener('click', (e) => {
      e.preventDefault();
      window.vaultlyApi.openExternalUrl('https://github.com/settings/tokens');
    });
  }

  // "Save Local" button: Offline zero-knowledge vault backed by Windows DPAPI
  if (btnSaveLocal) {
    btnSaveLocal.addEventListener('click', async () => {
      try {
        btnSaveLocal.disabled = true;
        btnSaveLocal.textContent = 'Saving...';
        const res = await window.vaultlyApi.saveLocal();
        if (res.success) {
          showToast('Vault configured locally. You can enable GitHub cloud backup anytime in Settings.', 'success');
          await checkVaultState();
        }
      } catch (err) {
        showToast('Failed to initialize local vault: ' + err.message, 'error');
      } finally {
        btnSaveLocal.disabled = false;
        btnSaveLocal.textContent = 'Save Local';
      }
    });
  }

  // Live Preview & Actions for Repository Link in Login Form
  const loginGhRepoLink = document.getElementById('login-gh-repo-link');
  const btnLoginOpenRepo = document.getElementById('btn-login-open-repo');
  const btnLoginCopyRepo = document.getElementById('btn-login-copy-repo');
  const loginGhStatusDot = document.getElementById('login-gh-status-dot');
  const loginGhStatusBadge = document.getElementById('login-gh-status-badge');
  const loginGhStatusMsg = document.getElementById('login-gh-status-msg');

  function updateLoginRepoLink() {
    const o = (ghLoginOwner ? ghLoginOwner.value : '').trim();
    const r = (ghLoginRepo ? ghLoginRepo.value : '').trim();
    if (o && r) {
      const url = `https://github.com/${o}/${r}`;
      if (loginGhRepoLink) {
        loginGhRepoLink.textContent = url;
        loginGhRepoLink.title = `Open ${url}`;
      }
      if (btnLoginOpenRepo) btnLoginOpenRepo.disabled = false;
      if (btnLoginCopyRepo) btnLoginCopyRepo.disabled = false;
    } else {
      if (loginGhRepoLink) {
        loginGhRepoLink.textContent = 'https://github.com/(owner)/(repo)';
        loginGhRepoLink.title = 'Enter owner and repository name above';
      }
      if (btnLoginOpenRepo) btnLoginOpenRepo.disabled = true;
      if (btnLoginCopyRepo) btnLoginCopyRepo.disabled = true;
    }
  }

  if (ghLoginOwner) {
    ghLoginOwner.addEventListener('input', updateLoginRepoLink);
  }
  if (ghLoginRepo) {
    ghLoginRepo.addEventListener('input', updateLoginRepoLink);
  }

  if (btnLoginOpenRepo) {
    btnLoginOpenRepo.addEventListener('click', (e) => {
      e.preventDefault();
      const o = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const r = (ghLoginRepo ? ghLoginRepo.value : '').trim();
      if (o && r) {
        window.vaultlyApi.openExternalUrl(`https://github.com/${o}/${r}`);
      } else {
        showToast('Please enter repository owner and name first', 'warning');
      }
    });
  }

  if (loginGhRepoLink) {
    loginGhRepoLink.addEventListener('click', (e) => {
      e.preventDefault();
      const o = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const r = (ghLoginRepo ? ghLoginRepo.value : '').trim();
      if (o && r) {
        window.vaultlyApi.openExternalUrl(`https://github.com/${o}/${r}`);
      }
    });
  }

  if (btnLoginCopyRepo) {
    btnLoginCopyRepo.addEventListener('click', (e) => {
      e.preventDefault();
      const o = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const r = (ghLoginRepo ? ghLoginRepo.value : '').trim();
      if (o && r) {
        navigator.clipboard.writeText(`https://github.com/${o}/${r}`).then(() => {
          showToast('Repository link copied!', 'success');
        });
      }
    });
  }

  // "Test Connection" button
  if (btnLoginTestGh) {
    btnLoginTestGh.addEventListener('click', async () => {
      const token = (ghLoginToken ? ghLoginToken.value : '').trim();
      const owner = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const repo = (ghLoginRepo ? ghLoginRepo.value : '').trim();
      if (ghLoginError) ghLoginError.style.display = 'none';

      if (!token || !owner || !repo) {
        if (loginGhStatusDot) loginGhStatusDot.style.background = '#FFA800';
        if (loginGhStatusBadge) {
          loginGhStatusBadge.textContent = 'Inputs Incomplete';
          loginGhStatusBadge.style.background = '#FFA800';
          loginGhStatusBadge.style.color = '#121212';
        }
        if (loginGhStatusMsg) loginGhStatusMsg.textContent = 'Please enter Token, Owner, and Repo above.';
        showToast('Please enter Token, Owner, and Repo to test connection.', 'warning');
        return;
      }

      try {
        btnLoginTestGh.disabled = true;
        btnLoginTestGh.textContent = 'Testing...';
        if (loginGhStatusDot) loginGhStatusDot.style.background = '#FFA800';
        if (loginGhStatusBadge) {
          loginGhStatusBadge.textContent = 'Testing...';
          loginGhStatusBadge.style.background = '#FFA800';
          loginGhStatusBadge.style.color = '#121212';
        }
        if (loginGhStatusMsg) loginGhStatusMsg.textContent = 'Verifying connection to repository...';

        await window.vaultlyApi.saveGitHubToken(token, false);
        const res = await window.vaultlyApi.testGitHubConnection(owner, repo);
        if (res.repoExists) {
          if (loginGhStatusDot) loginGhStatusDot.style.background = '#00E599';
          if (loginGhStatusBadge) {
            loginGhStatusBadge.textContent = 'Connected & Verified';
            loginGhStatusBadge.style.background = '#00E599';
            loginGhStatusBadge.style.color = '#121212';
          }
          if (loginGhStatusMsg) loginGhStatusMsg.textContent = `Private repository verified for @${res.user}`;
          showToast(`Connected to private repo ${owner}/${repo} as @${res.user}!`, 'success');
        } else {
          if (loginGhStatusDot) loginGhStatusDot.style.background = '#FFA800';
          if (loginGhStatusBadge) {
            loginGhStatusBadge.textContent = 'Repo Not Found';
            loginGhStatusBadge.style.background = '#FFA800';
            loginGhStatusBadge.style.color = '#121212';
          }
          if (loginGhStatusMsg) loginGhStatusMsg.textContent = 'Repository does not exist yet.';

          if (res.hasRepoScope === false) {
            alert(res.message);
          } else {
            const create = confirm(`${res.message}\n\nWould you like Vaultly to create a PRIVATE repository named "${repo}" now?`);
            if (create) {
              const cr = await window.vaultlyApi.createPrivateGitHubRepo(repo);
              if (loginGhStatusDot) loginGhStatusDot.style.background = '#00E599';
              if (loginGhStatusBadge) {
                loginGhStatusBadge.textContent = 'Connected & Created';
                loginGhStatusBadge.style.background = '#00E599';
                loginGhStatusBadge.style.color = '#121212';
              }
              if (loginGhStatusMsg) loginGhStatusMsg.textContent = `Created private repo ${cr.owner}/${cr.repo}`;
              showToast(`Created private repository ${cr.owner}/${cr.repo}!`, 'success');
            }
          }
        }
      } catch (err) {
        if (loginGhStatusDot) loginGhStatusDot.style.background = '#FF3B5C';
        if (loginGhStatusBadge) {
          loginGhStatusBadge.textContent = 'Connection Failed';
          loginGhStatusBadge.style.background = '#FF3B5C';
          loginGhStatusBadge.style.color = '#FFFFFF';
        }
        if (loginGhStatusMsg) loginGhStatusMsg.textContent = err.message || 'Connection test failed.';
        if (ghLoginError) {
          ghLoginError.textContent = err.message || 'Connection test failed.';
          ghLoginError.style.display = 'block';
        }
        showToast('Connection test failed: ' + err.message, 'error');
      } finally {
        btnLoginTestGh.disabled = false;
        btnLoginTestGh.textContent = 'Test Connection';
      }
    });
  }

  // "Restore from Cloud" button
  if (btnLoginRestoreCloud) {
    btnLoginRestoreCloud.addEventListener('click', async () => {
      const token = (ghLoginToken ? ghLoginToken.value : '').trim();
      const owner = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const repo = (ghLoginRepo ? ghLoginRepo.value : '').trim();
      const branch = (ghLoginBranch && ghLoginBranch.value ? ghLoginBranch.value : 'main').trim();
      const autoSync = ghLoginAutoSync ? ghLoginAutoSync.checked : true;
      if (ghLoginError) ghLoginError.style.display = 'none';

      if (!token || !owner || !repo) {
        showToast('Please enter your Token, Owner username, and Repo name first.', 'warning');
        return;
      }

      try {
        btnLoginRestoreCloud.disabled = true;
        btnLoginRestoreCloud.textContent = 'Connecting & Restoring...';
        showToast('Connecting to GitHub and restoring vault...', 'info');

        const res = await window.vaultlyApi.loginWithGitHubDetails({ token, owner, repo, branch, autoSync });
        if (res.success) {
          const count = res.entryCount || 0;
          showToast(`✓ Restored ${count} password${count !== 1 ? 's' : ''} from @${res.owner}/${res.repo}!`, 'success');
          await checkVaultState();
        }
      } catch (err) {
        if (ghLoginError) {
          ghLoginError.textContent = err.message || 'Cloud restore failed.';
          ghLoginError.style.display = 'block';
        }
        showToast('Cloud restore error: ' + err.message, 'error');
      } finally {
        btnLoginRestoreCloud.disabled = false;
        btnLoginRestoreCloud.textContent = 'Restore from Cloud';
      }
    });
  }

  // "Connect & Sync Cloud" Form Submission
  if (ghLoginForm) {
    ghLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ghLoginError) ghLoginError.style.display = 'none';

      const token = (ghLoginToken ? ghLoginToken.value : '').trim();
      const owner = (ghLoginOwner ? ghLoginOwner.value : '').trim();
      const repo = (ghLoginRepo ? ghLoginRepo.value : '').trim();

      if (!token || !owner || !repo) {
        showToast('Please fill in Token, Owner, and Repo to connect cloud, or click "Save Local".', 'warning');
        return;
      }

      if (ghLoginSubmitBtn) {
        ghLoginSubmitBtn.disabled = true;
        ghLoginSubmitBtn.textContent = 'Connecting & Synchronizing...';
      }

      try {
        const res = await window.vaultlyApi.loginWithGitHubDetails({
          token,
          owner,
          repo,
          branch: (ghLoginBranch.value || 'main').trim(),
          autoSync: ghLoginAutoSync ? ghLoginAutoSync.checked : true
        });

        showToast(`Connected to @${res.owner}/${res.repo}! Loaded ${res.entryCount} passwords.`, 'success');
        await checkVaultState();
      } catch (err) {
        if (ghLoginError) {
          ghLoginError.textContent = err.message || 'Failed to connect to GitHub repository.';
          ghLoginError.style.display = 'block';
        }
      } finally {
        if (ghLoginSubmitBtn) {
          ghLoginSubmitBtn.disabled = false;
          ghLoginSubmitBtn.textContent = 'Connect & Sync Cloud';
        }
      }
    });
  }

  // --- Quick Sync Button (Sidebar Header) ---
  const btnQuickSync = document.getElementById('btn-quick-lock');
  if (btnQuickSync) {
    btnQuickSync.addEventListener('click', async () => {
      if (state.vaultState !== 'unlocked') {
        showToast('Connect vault before syncing', 'warning');
        return;
      }
      try {
        btnQuickSync.style.opacity = '0.5';
        showToast('Syncing vault with GitHub...', 'info');
        const syncRes = await window.vaultlyApi.syncWithGitHub();
        showToast(syncRes.message, 'success');
        await refreshVaultData();
      } catch (err) {
        showToast('Sync failed: ' + err.message, 'error');
      } finally {
        btnQuickSync.style.opacity = '1';
      }
    });
  }

  // --- Global Search Input ---
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      refreshVaultData();
    });
  }

  // --- Sort Selector ---
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.sortBy = sortSelect.value;
      refreshVaultData();
    });
  }

  // --- View Mode Toggle ---
  const viewToggleBtn = document.getElementById('btn-view-toggle');
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
      renderEntries();
    });
  }

  // --- Add Password Modal Trigger ---
  const btnOpenAdd = document.getElementById('btn-open-add-modal');
  if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openEntryModal());

  const btnEmptyAdd = document.getElementById('btn-empty-add');
  if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => openEntryModal());

  const btnCloseModal = document.getElementById('btn-close-entry-modal');
  if (btnCloseModal) btnCloseModal.addEventListener('click', () => closeEntryModal());

  const btnCancelEntry = document.getElementById('btn-cancel-entry');
  if (btnCancelEntry) btnCancelEntry.addEventListener('click', () => closeEntryModal());

  // --- Service Autocomplete & Suggestions ---
  const serviceInput = document.getElementById('entry-service');
  const suggestionsBox = document.getElementById('service-suggestions');
  const duplicateWarning = document.getElementById('duplicate-warning');

  if (serviceInput && suggestionsBox) {
    serviceInput.addEventListener('input', () => {
      const q = serviceInput.value.trim().toLowerCase();
      checkDuplicateWarning();

      if (!q) {
        suggestionsBox.style.display = 'none';
        return;
      }

      const matches = BUILT_IN_SERVICES.filter(s =>
        s.name.toLowerCase().includes(q) || s.id.includes(q)
      ).slice(0, 5);

      if (matches.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
      }

      suggestionsBox.innerHTML = '';
      matches.forEach(item => {
        const row = document.createElement('div');
        row.className = 'suggestion-item';
        row.innerHTML = `
          <span style="color: ${item.color || 'var(--accent-color)'}">${getIconSvg(item.icon)}</span>
          <strong>${escapeHtml(item.name)}</strong>
          <span style="color: var(--text-subtle); font-size: 0.75rem; margin-left: auto;">${escapeHtml(item.category)}</span>
        `;
        row.addEventListener('click', () => {
          serviceInput.value = item.name;
          const urlEl = document.getElementById('entry-url');
          if (urlEl) urlEl.value = item.url || '';
          const catEl = document.getElementById('entry-category');
          if (catEl) catEl.value = item.category || 'other';
          suggestionsBox.style.display = 'none';
          checkDuplicateWarning();
        });
        suggestionsBox.appendChild(row);
      });

      suggestionsBox.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#entry-service') && !e.target.closest('#service-suggestions')) {
        suggestionsBox.style.display = 'none';
      }
    });
  }

  // --- Duplicate Entry Check ---
  const userInput = document.getElementById('entry-username');
  if (userInput) {
    userInput.addEventListener('input', () => checkDuplicateWarning());
  }

  async function checkDuplicateWarning() {
    if (!serviceInput || !userInput || !duplicateWarning) return;
    const service = serviceInput.value.trim();
    const user = userInput.value.trim();
    const idEl = document.getElementById('entry-id');
    const currentId = idEl ? idEl.value : null;

    if (service && user) {
      const isDup = await window.vaultlyApi.checkDuplicate(service, user, currentId);
      duplicateWarning.style.display = isDup ? 'flex' : 'none';
    } else {
      duplicateWarning.style.display = 'none';
    }
  }

  // --- Password Field Controls & Generator in Form ---
  const pwdInput = document.getElementById('entry-password');
  const pwdVisBtn = document.getElementById('btn-toggle-pwd-vis');
  const quickGenBtn = document.getElementById('btn-generate-quick');
  const toggleGenBtn = document.getElementById('btn-toggle-generator');
  const inlineGen = document.getElementById('inline-generator');
  const genSlider = document.getElementById('gen-slider');
  const genLenLabel = document.getElementById('gen-len-label');
  const applyGenBtn = document.getElementById('btn-apply-generated');
  const formStrBar = document.getElementById('form-strength-bar');
  const formStrLabel = document.getElementById('form-strength-label');
  const formStrFeedback = document.getElementById('form-strength-feedback');

  if (pwdVisBtn && pwdInput) {
    pwdVisBtn.addEventListener('click', () => {
      const isPass = pwdInput.type === 'password';
      pwdInput.type = isPass ? 'text' : 'password';
      pwdVisBtn.innerHTML = isPass ? UI_ICONS.eyeOff : UI_ICONS.eye;
    });
  }

  if (pwdInput && formStrBar) {
    pwdInput.addEventListener('input', async () => {
      const strength = await window.vaultlyApi.evaluateStrength(pwdInput.value);
      updateStrengthMeter(formStrBar, formStrLabel, formStrFeedback, strength);
    });
  }

  if (toggleGenBtn && inlineGen) {
    toggleGenBtn.addEventListener('click', () => {
      const isShown = inlineGen.style.display === 'block';
      inlineGen.style.display = isShown ? 'none' : 'block';
    });
  }

  if (genSlider && genLenLabel) {
    genSlider.addEventListener('input', () => {
      genLenLabel.textContent = genSlider.value;
    });
  }

  if (quickGenBtn) {
    quickGenBtn.addEventListener('click', async () => {
      await generateAndApplyPassword();
    });
  }

  if (applyGenBtn) {
    applyGenBtn.addEventListener('click', async () => {
      await generateAndApplyPassword();
    });
  }

  async function generateAndApplyPassword() {
    if (!pwdInput || !genSlider) return;
    const length = Number(genSlider.value);
    const upperEl = document.getElementById('gen-opt-upper');
    const lowerEl = document.getElementById('gen-opt-lower');
    const numEl = document.getElementById('gen-opt-numbers');
    const symEl = document.getElementById('gen-opt-symbols');
    const uppercase = upperEl ? upperEl.checked : true;
    const lowercase = lowerEl ? lowerEl.checked : true;
    const numbers = numEl ? numEl.checked : true;
    const symbols = symEl ? symEl.checked : true;

    const res = await window.vaultlyApi.generatePassword({ length, uppercase, lowercase, numbers, symbols });
    pwdInput.value = res.password;
    if (formStrBar) {
      updateStrengthMeter(formStrBar, formStrLabel, formStrFeedback, res.strength);
    }
    showToast('Strong password generated', 'info');
  }

  // --- Save Password Entry ---
  const btnSaveEntry = document.getElementById('btn-save-entry');
  if (btnSaveEntry) {
    btnSaveEntry.addEventListener('click', async () => {
      const idEl = document.getElementById('entry-id');
      const id = idEl ? idEl.value : null;
      const service = serviceInput ? serviceInput.value.trim() : '';
      const urlEl = document.getElementById('entry-url');
      const websiteUrl = urlEl ? urlEl.value.trim() : '';
      const username = userInput ? userInput.value.trim() : '';
      const password = pwdInput ? pwdInput.value : '';
      const catEl = document.getElementById('entry-category');
      const category = catEl ? catEl.value : 'other';
      const favEl = document.getElementById('entry-favorite');
      const isFavorite = favEl ? favEl.checked : false;
      const notesEl = document.getElementById('entry-notes');
      const notes = notesEl ? notesEl.value : '';

      if (!service || !username || !password) {
        showToast('Please fill in service name, username, and password.', 'warning');
        return;
      }

      try {
        if (id) {
          await window.vaultlyApi.updateEntry(id, {
            service,
            websiteUrl,
            username,
            password,
            category,
            isFavorite,
            notes
          });
          showToast('Password updated successfully', 'success');
        } else {
          await window.vaultlyApi.addEntry({
            service,
            websiteUrl,
            username,
            password,
            category,
            isFavorite,
            notes
          });
          showToast('Password saved to vault', 'success');
        }

        closeEntryModal();
        await refreshVaultData();

        // Trigger automatic sync if enabled
        if (state.settings.github && state.settings.github.autoSync && state.settings.hasGitHubToken) {
          window.vaultlyApi.syncWithGitHub().catch(() => {});
        }
      } catch (err) {
        showToast('Error saving password: ' + err.message, 'error');
      }
    });
  }

  // --- Drawer Actions: Edit, Delete, Launch ---
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => closeDetailsDrawer());
  }

  const btnEditEntry = document.getElementById('btn-edit-entry');
  if (btnEditEntry) {
    btnEditEntry.addEventListener('click', () => {
      if (!state.selectedEntry) return;
      const entryToEdit = Object.assign({}, state.selectedEntry);
      closeDetailsDrawer();
      openEntryModal(entryToEdit);
    });
  }

  const btnDeleteEntry = document.getElementById('btn-delete-entry');
  if (btnDeleteEntry) {
    btnDeleteEntry.addEventListener('click', async () => {
      if (!state.selectedEntry) return;
      const confirmDelete = confirm(`Are you sure you want to delete "${state.selectedEntry.service}"? This cannot be undone.`);
      if (!confirmDelete) return;

      try {
        await window.vaultlyApi.deleteEntry(state.selectedEntry.id);
        showToast('Entry deleted', 'success');
        closeDetailsDrawer();
        await refreshVaultData();
      } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
      }
    });
  }

  const btnLaunchUrl = document.getElementById('btn-launch-url');
  if (btnLaunchUrl) {
    btnLaunchUrl.addEventListener('click', async () => {
      if (state.selectedEntry && state.selectedEntry.websiteUrl) {
        await window.vaultlyApi.openExternalUrl(state.selectedEntry.websiteUrl);
      } else {
        showToast('No website URL specified for this entry', 'info');
      }
    });
  }

  // --- Settings Navigation ---
  const navBtnSettings = document.getElementById('nav-btn-settings');
  if (navBtnSettings) {
    navBtnSettings.addEventListener('click', () => {
      state.isSettingsOpen = true;
      showSettingsView(true);
    });
  }
}

/**
 * Handles vault lock transition.
 */
function handleVaultLocked(isAuto = false, message = 'Vault locked') {
  window.vaultlyApi.lockVault();
  state.vaultState = 'locked';
  state.entries = [];
  state.selectedEntry = null;
  closeDetailsDrawer();
  closeEntryModal();
  updateTitlebarStatus(false, 0);
  showScreen('login');
  showToast(message, isAuto ? 'warning' : 'info');
}

/**
 * Opens Add or Edit password modal.
 */
function openEntryModal(entry = null) {
  const modal = document.getElementById('entry-modal');
  const title = document.getElementById('entry-modal-title');
  const idField = document.getElementById('entry-id');
  const service = document.getElementById('entry-service');
  const url = document.getElementById('entry-url');
  const user = document.getElementById('entry-username');
  const pass = document.getElementById('entry-password');
  const cat = document.getElementById('entry-category');
  const fav = document.getElementById('entry-favorite');
  const notes = document.getElementById('entry-notes');
  const dupWarning = document.getElementById('duplicate-warning');
  const inlineGen = document.getElementById('inline-generator');

  dupWarning.style.display = 'none';
  inlineGen.style.display = 'none';
  pass.type = 'password';
  document.getElementById('btn-toggle-pwd-vis').innerHTML = UI_ICONS.eye;

  if (entry) {
    title.textContent = `Edit ${entry.service}`;
    idField.value = entry.id;
    service.value = entry.service;
    url.value = entry.websiteUrl || '';
    user.value = entry.username;
    pass.value = entry.password;
    cat.value = entry.category || 'other';
    fav.checked = Boolean(entry.isFavorite);
    notes.value = entry.notes || '';
  } else {
    title.textContent = 'Add New Password';
    idField.value = '';
    service.value = '';
    url.value = '';
    user.value = '';
    pass.value = '';
    cat.value = ['all', 'favorites', 'recent'].includes(state.currentCategory) ? 'other' : state.currentCategory;
    fav.checked = state.currentCategory === 'favorites';
    notes.value = '';
  }

  // Update strength bar for current input
  window.vaultlyApi.evaluateStrength(pass.value).then(s => {
    updateStrengthMeter(
      document.getElementById('form-strength-bar'),
      document.getElementById('form-strength-label'),
      document.getElementById('form-strength-feedback'),
      s
    );
  });

  modal.classList.add('open');
  service.focus();
}

function closeEntryModal() {
  document.getElementById('entry-modal').classList.remove('open');
}

/**
 * Toggles the Settings view.
 */
function showSettingsView(show) {
  const settingsEl = document.getElementById('settings-view');
  const cardsContainer = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const pageHeader = document.getElementById('page-header');
  const settingsNavBtn = document.getElementById('nav-btn-settings');

  if (show) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.remove('active'));
    settingsNavBtn.classList.add('active');

    pageHeader.style.display = 'none';
    cardsContainer.style.display = 'none';
    emptyState.style.display = 'none';
    settingsEl.style.display = 'block';

    renderSettings(settingsEl, state.settings, {
      onSelectAccent: (hex) => {
        applyThemeAndAccent(state.settings.theme, hex);
      },
      onSelectTheme: async (theme) => {
        state.settings.theme = theme;
        applyThemeAndAccent(theme, state.settings.accentColor);
        await window.vaultlyApi.saveSettings({ theme });
      },
      onSaveGeneral: async (general) => {
        try {
          const updated = await window.vaultlyApi.saveSettings(general);
          state.settings = updated;
          applyThemeAndAccent(updated.theme, updated.accentColor);
          showToast('Settings saved successfully', 'success');
        } catch (err) {
          showToast('Failed to save settings: ' + err.message, 'error');
        }
      },
      onChangeMasterPassword: async () => {
        showCloudPasswordModal({
          title: 'Change Master Password',
          message: 'Enter your current master password to verify your identity:',
          submitLabel: 'Verify Current',
          onSubmit: async (currentPass) => {
            showCloudPasswordModal({
              title: 'Set New Master Password',
              message: 'Enter your new master password (at least 8 characters):',
              submitLabel: 'Change Password',
              onSubmit: async (newPass) => {
                if (!newPass || newPass.length < 8) {
                  throw new Error('New password must be at least 8 characters.');
                }
                await window.vaultlyApi.changeMasterPassword(currentPass, newPass);
                showToast('Master password changed and vault re-encrypted successfully!', 'success');
              }
            });
          }
        });
      },
      onLockNow: () => {
        handleVaultLocked(false, 'Vault locked.');
      },
      onExportBackup: async () => {
        showExportBackupModal({
          onSubmit: async (password) => {
            try {
              const res = await window.vaultlyApi.exportBackupFile(password);
              if (!res || res.canceled) return;
              if (res.success) {
                showToast(`✓ .vaulty backup exported: ${res.filePath}`, 'success');
              }
            } catch (err) {
              showToast('Export failed: ' + err.message, 'error');
            }
          }
        });
      },
      onRestoreBackup: async () => {
        await handleImportVaultyFile();
      },
      onStartGitHubLogin: () => {
        startGitHubDeviceAuthFlow(async (user) => {
          await loadAppSettings();
          showSettingsView(true);
          await openChooseRepoModal();
        });
      },
      onOpenChangeRepoModal: () => {
        openChooseRepoModal();
      },
      onClearGitHubToken: async () => {
        if (!confirm('Are you sure you want to disconnect your GitHub token?')) return;
        await window.vaultlyApi.disconnectGitHub();
        cachedUserRepos = null;
        state.settings.hasGitHubToken = false;
        showToast('GitHub token disconnected', 'info');
        await loadAppSettings();
        showSettingsView(true);
      },
      onTestGitHub: async ({ token, owner, repo, branch, autoSync }) => {
        try {
          if (token) {
            await window.vaultlyApi.saveGitHubToken(token, false);
          }
          await window.vaultlyApi.saveSettings({
            github: { owner, repo, branch, autoSync }
          });
          const testRes = await window.vaultlyApi.testGitHubConnection(owner, repo);
          if (!testRes.repoExists) {
            if (testRes.hasRepoScope === false) {
              alert(testRes.message);
            } else {
              const createIt = confirm(`${testRes.message}\n\nIf the repository "${repo}" already exists, your token may lack permission. Otherwise, would you like Vaultly to create a PRIVATE repository named "${repo}" now?`);
              if (createIt) {
                const createRes = await window.vaultlyApi.createPrivateGitHubRepo(repo);
                await window.vaultlyApi.saveSettings({
                  github: { owner: createRes.owner, repo: createRes.repo, branch, autoSync, lastSyncStatus: 'connected' }
                });
                showToast(`Created private repository: ${createRes.owner}/${createRes.repo}`, 'success');
              }
            }
          } else {
            await window.vaultlyApi.saveSettings({
              github: { owner, repo, branch, autoSync, lastSyncStatus: 'connected' }
            });
            showToast(`Connected to private repo ${owner}/${repo} as ${testRes.user}!`, 'success');
          }
          await loadAppSettings();
          showSettingsView(true);
        } catch (err) {
          try {
            await window.vaultlyApi.saveSettings({
              github: { owner, repo, branch, autoSync, lastSyncStatus: 'failed' }
            });
            await loadAppSettings();
            showSettingsView(true);
          } catch (_) {}
          showToast('GitHub Connection Error: ' + err.message, 'error');
        }
      },
      onRestoreCloud: async () => {
        try {
          showToast('Connecting to GitHub and syncing vault...', 'info');
          const res = await window.vaultlyApi.restoreFromCloud(null);
          showToast(res.message || 'Vault synchronized with GitHub!', 'success');
          await loadAppSettings();
          await refreshVaultData();
          showSettingsView(true);
        } catch (err) {
          showToast('Cloud sync notice: ' + err.message, 'warning');
        }
      },
      onSyncNow: async ({ token, owner, repo, branch, autoSync }) => {
        try {
          if (token) {
            await window.vaultlyApi.saveGitHubToken(token, false);
          }
          await window.vaultlyApi.saveSettings({
            github: { owner, repo, branch, autoSync }
          });
          showToast('Syncing encrypted vault with GitHub...', 'info');
          const syncRes = await window.vaultlyApi.syncWithGitHub(false);
          showToast(syncRes.message || 'Vault synchronized with GitHub!', 'success');
          await loadAppSettings();
          await refreshVaultData();
          showSettingsView(true);
        } catch (err) {
          showToast('Sync notice: ' + err.message, 'warning');
        }
      },
      onForceOverwriteGitHub: async ({ token, owner, repo, branch, autoSync }) => {
        if (!state.entries || state.entries.length === 0) {
          showToast('Safety guard: Cannot overwrite remote backup with an empty vault.', 'warning');
          return;
        }

        const confirmForce = confirm(
          'Overwrite Remote Backup on GitHub?\n\n' +
          `This will replace the remote vault file in your GitHub repository with your current ${state.entries.length} passwords.\n\n` +
          'Are you sure you want to proceed?'
        );
        if (!confirmForce) return;

        try {
          if (token) {
            await window.vaultlyApi.saveGitHubToken(token, false);
          }
          await window.vaultlyApi.saveSettings({
            github: { owner, repo, branch, autoSync }
          });
          showToast('Overwriting remote backup on GitHub...', 'info');
          const forceRes = await window.vaultlyApi.syncWithGitHub(true);
          showToast(forceRes.message, 'success');
          await loadAppSettings();
          await refreshVaultData();
          showSettingsView(true);
        } catch (err) {
          showToast('Overwrite failed: ' + err.message, 'error');
        }
      },
      onShowBackupHistory: () => {
        showBackupHistoryModal();
      },
      onResetAppData: () => {
        showResetAppDataModal({
          onConfirm: async () => {
            const res = await window.vaultlyApi.resetAppData();
            if (res && res.success) {
              state.vault = null;
              state.entries = [];
              state.selectedEntry = null;
              state.settings = null;
              state.currentCategory = 'all';
              state.activeSearch = '';
              state.vaultState = 'locked';

              showToast('All app data and settings have been permanently reset.', 'success');
              showSettingsView(false);
              await checkVaultState();
            } else {
              throw new Error(res?.error || 'Unknown error');
            }
          }
        });
      },
      onOpenExternal: async (url) => {
        await window.vaultlyApi.openExternalUrl(url);
      }
    });
  } else {
    settingsNavBtn.classList.remove('active');
    pageHeader.style.display = 'flex';
    settingsEl.style.display = 'none';
  }
}

/**
 * Configures global desktop keyboard shortcuts.
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl + F: Focus search
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const search = document.getElementById('global-search-input');
      if (search) {
        search.focus();
        search.select();
      }
      return;
    }

    // Ctrl + N: Add password
    if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (state.vaultState === 'unlocked') {
        openEntryModal();
      }
      return;
    }

    // Ctrl + L: Lock vault immediately
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (state.vaultState === 'unlocked') {
        handleVaultLocked(false, 'Vault locked immediately.');
      }
      return;
    }

    // Escape: Close modals / drawers
    if (e.key === 'Escape') {
      const entryModal = document.getElementById('entry-modal');
      const ssoModal = document.getElementById('sso-modal');
      const drawer = document.getElementById('details-drawer');
      const deviceModal = document.getElementById('github-device-modal');
      const repoModal = document.getElementById('github-repo-modal');

      if (entryModal && entryModal.classList.contains('open')) {
        closeEntryModal();
      } else if (deviceModal && deviceModal.classList.contains('open')) {
        deviceModal.classList.remove('open');
        window.vaultlyApi.cancelGitHubDeviceLogin().catch(() => {});
      } else if (repoModal && repoModal.classList.contains('open')) {
        repoModal.classList.remove('open');
      } else if (ssoModal && ssoModal.classList.contains('open')) {
        ssoModal.classList.remove('open');
      } else if (drawer && drawer.classList.contains('open')) {
        closeDetailsDrawer();
      }
    }
  });
}

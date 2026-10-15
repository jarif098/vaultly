/**
 * Vaultly - UI Components & DOM Helpers
 * Pure Vanilla JavaScript UI utilities, toast messages, strength meter rendering,
 * and card generation. Zero framework dependencies.
 */

'use strict';

/**
 * Displays a toast notification in the corner of the window.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {number} [duration=3000]
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = UI_ICONS.shield;
  if (type === 'success') iconSvg = UI_ICONS.check;
  if (type === 'error') iconSvg = UI_ICONS.close;
  if (type === 'warning') iconSvg = UI_ICONS.key;

  toast.innerHTML = `
    <span>${iconSvg}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }, duration);
}

/**
 * Updates a password strength meter visually.
 * @param {HTMLElement} barEl
 * @param {HTMLElement} labelEl
 * @param {HTMLElement} [feedbackEl]
 * @param {object} strength
 */
function updateStrengthMeter(barEl, labelEl, feedbackEl, strength) {
  if (!barEl || !labelEl) return;
  barEl.style.width = `${strength.percent || 0}%`;
  barEl.style.backgroundColor = strength.color || '#6b7280';
  labelEl.textContent = strength.label || 'None';
  labelEl.style.color = strength.color || '#9ca3af';

  if (feedbackEl) {
    feedbackEl.textContent = strength.feedback || '';
  }
}

/**
 * HTML escaper helper for client rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Creates and returns a password card element.
 * @param {object} entry
 * @param {Function} onClick
 * @param {Function} onCopyUser
 * @param {Function} onCopyPass
 * @param {Function} onToggleFav
 * @returns {HTMLElement}
 */
function createPasswordCard(entry, onClick, onCopyUser, onCopyPass, onToggleFav) {
  const card = document.createElement('div');
  card.className = 'password-card';
  card.dataset.id = entry.id;

  const iconSvg = getIconSvg(entry.icon || entry.service);
  const formattedDate = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-service">
        <div class="service-icon-box">${iconSvg}</div>
        <div class="service-meta">
          <h3>${escapeHtml(entry.service)}</h3>
          <span>${escapeHtml(entry.category ? entry.category.toUpperCase() : 'OTHER')}</span>
        </div>
      </div>
      <button class="card-favorite-btn" title="Toggle Favorite">
        ${entry.isFavorite ? UI_ICONS.starFilled : UI_ICONS.star}
      </button>
    </div>

    <div class="card-username" title="Username / Email">
      <span>${escapeHtml(entry.username)}</span>
      <span style="font-size: 0.72rem; color: var(--text-subtle);">${formattedDate}</span>
    </div>

    <div class="card-actions">
      <div class="copy-button-group">
        <button class="btn-card-copy btn-copy-username" title="Copy Username">
          ${UI_ICONS.copy}
          <span>User</span>
        </button>
        <button class="btn-card-copy btn-copy-password" title="Copy Password">
          ${UI_ICONS.copy}
          <span>Pass</span>
        </button>
      </div>
      <button class="btn-ghost btn-details" style="padding: 0.35rem 0.5rem; font-size: 0.75rem;">
        Details &rarr;
      </button>
    </div>
  `;

  // Bind events
  card.addEventListener('click', (e) => {
    // If clicked on buttons, let button handlers handle
    if (e.target.closest('button')) return;
    onClick(entry);
  });

  const favBtn = card.querySelector('.card-favorite-btn');
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggleFav(entry);
  });

  const copyUserBtn = card.querySelector('.btn-copy-username');
  copyUserBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onCopyUser(entry);
  });

  const copyPassBtn = card.querySelector('.btn-copy-password');
  copyPassBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onCopyPass(entry);
  });

  const detailsBtn = card.querySelector('.btn-details');
  detailsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(entry);
  });

  return card;
}

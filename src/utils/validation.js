/**
 * Vaultly - Input Validation & Sanitization Utility
 * Enforces strict typing and bounds on all IPC inputs to prevent injection and corruption.
 */

'use strict';

const ALLOWED_CATEGORIES = [
  'all',
  'favorites',
  'recent',
  'social',
  'communication',
  'email',
  'development',
  'gaming',
  'shopping',
  'finance',
  'work',
  'other'
];

/**
 * Validates master password suitability.
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMasterPassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Master password must be a string.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Master password must be at least 8 characters long.' };
  }
  if (password.length > 512) {
    return { valid: false, error: 'Master password exceeds maximum allowed length (512 characters).' };
  }
  return { valid: true };
}

/**
 * Validates and normalizes a password entry object.
 * @param {object} entry
 * @returns {{ valid: boolean, error?: string, sanitized?: object }}
 */
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, error: 'Entry must be a valid object.' };
  }

  const service = typeof entry.service === 'string' ? entry.service.trim() : '';
  if (!service || service.length > 100) {
    return { valid: false, error: 'Service name is required and must be between 1 and 100 characters.' };
  }

  const username = typeof entry.username === 'string' ? entry.username.trim() : '';
  if (!username || username.length > 255) {
    return { valid: false, error: 'Username or email is required and must be under 255 characters.' };
  }

  const password = typeof entry.password === 'string' ? entry.password : '';
  if (!password || password.length > 1024) {
    return { valid: false, error: 'Password is required and cannot exceed 1024 characters.' };
  }

  let websiteUrl = typeof entry.websiteUrl === 'string' ? entry.websiteUrl.trim() : '';
  if (websiteUrl) {
    if (!/^https?:\/\//i.test(websiteUrl)) {
      websiteUrl = 'https://' + websiteUrl;
    }
    if (websiteUrl.length > 500) {
      return { valid: false, error: 'Website URL cannot exceed 500 characters.' };
    }
  }

  let category = typeof entry.category === 'string' ? entry.category.toLowerCase().trim() : 'other';
  if (!ALLOWED_CATEGORIES.includes(category)) {
    category = 'other';
  }

  const notes = typeof entry.notes === 'string' ? entry.notes.slice(0, 10000) : '';
  const isFavorite = Boolean(entry.isFavorite);
  const icon = typeof entry.icon === 'string' ? entry.icon.trim().slice(0, 100) : '';

  let tags = [];
  if (Array.isArray(entry.tags)) {
    tags = entry.tags
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().slice(0, 30))
      .slice(0, 20);
  }

  const id = typeof entry.id === 'string' && entry.id.length > 0
    ? entry.id
    : null;

  return {
    valid: true,
    sanitized: {
      id,
      service,
      websiteUrl,
      username,
      password,
      notes,
      category,
      isFavorite,
      icon,
      tags
    }
  };
}

/**
 * Validates GitHub repository synchronization settings.
 * @param {object} settings
 * @returns {{ valid: boolean, error?: string, sanitized?: object }}
 */
function validateGitHubSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { valid: false, error: 'Settings must be an object.' };
  }

  const owner = typeof settings.owner === 'string' ? settings.owner.trim() : '';
  const repo = typeof settings.repo === 'string' ? settings.repo.trim() : '';
  const branch = typeof settings.branch === 'string' ? settings.branch.trim() : 'main';
  const token = typeof settings.token === 'string' ? settings.token.trim() : '';
  const autoSync = settings.autoSync !== undefined ? Boolean(settings.autoSync) : true;

  if (owner && !/^[a-zA-Z0-9-_.]{1,39}$/.test(owner)) {
    return { valid: false, error: 'Invalid GitHub username or organization name.' };
  }
  if (repo && !/^[a-zA-Z0-9-_.]+$/.test(repo)) {
    return { valid: false, error: 'Invalid GitHub repository name.' };
  }
  if (branch && !/^[a-zA-Z0-9-_./]+$/.test(branch)) {
    return { valid: false, error: 'Invalid branch name.' };
  }

  return {
    valid: true,
    sanitized: {
      owner,
      repo,
      branch: branch || 'main',
      token,
      autoSync
    }
  };
}

/**
 * Escapes HTML entities to prevent any injection in vanilla JS DOM manipulation.
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

module.exports = {
  validateMasterPassword,
  validateEntry,
  validateGitHubSettings,
  escapeHtml,
  ALLOWED_CATEGORIES
};

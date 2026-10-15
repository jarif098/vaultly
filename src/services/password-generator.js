/**
 * Vaultly - Password Generator & Strength Analyzer
 * Uses Node.js crypto.randomInt() for cryptographically secure random password generation.
 */

'use strict';

const crypto = require('crypto');

const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

const DEFAULT_OPTIONS = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: false // e.g. 0, O, I, l, 1
};

const AMBIGUOUS_CHARS = /[0OIl1|`]/g;

/**
 * Generates a cryptographically secure random password.
 * @param {object} [options]
 * @returns {string} The generated password
 */
function generatePassword(options = {}) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options);
  const length = Math.max(8, Math.min(128, Number(opts.length) || 16));

  let pool = '';
  const guaranteedChars = [];

  const charCategories = [];
  if (opts.uppercase) charCategories.push('uppercase');
  if (opts.lowercase) charCategories.push('lowercase');
  if (opts.numbers) charCategories.push('numbers');
  if (opts.symbols) charCategories.push('symbols');

  // Fallback to lowercase + numbers if nothing was selected
  if (charCategories.length === 0) {
    charCategories.push('lowercase', 'numbers');
  }

  for (const cat of charCategories) {
    let set = CHAR_SETS[cat];
    if (opts.avoidAmbiguous) {
      set = set.replace(AMBIGUOUS_CHARS, '');
    }
    if (set.length > 0) {
      pool += set;
      // Guarantee at least one character from each active category
      const randomIndex = crypto.randomInt(0, set.length);
      guaranteedChars.push(set[randomIndex]);
    }
  }

  if (pool.length === 0) {
    pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
    guaranteedChars.push(pool[crypto.randomInt(0, pool.length)]);
  }

  const resultChars = [...guaranteedChars];

  // Fill remaining length from full pool
  while (resultChars.length < length) {
    const randomIndex = crypto.randomInt(0, pool.length);
    resultChars.push(pool[randomIndex]);
  }

  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = resultChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = resultChars[i];
    resultChars[i] = resultChars[j];
    resultChars[j] = temp;
  }

  return resultChars.join('');
}

/**
 * Evaluates password strength and returns a detailed report.
 * @param {string} password
 * @returns {object} { score: 0-4, label: string, feedback: string, percent: number, color: string }
 */
function evaluateStrength(password) {
  if (!password || typeof password !== 'string') {
    return {
      score: 0,
      label: 'None',
      feedback: 'Enter a password',
      percent: 0,
      color: '#6b7280'
    };
  }

  let score = 0;
  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[^a-zA-Z0-9]/.test(password);

  const poolSize = (hasLower ? 26 : 0) +
                   (hasUpper ? 26 : 0) +
                   (hasNumbers ? 10 : 0) +
                   (hasSymbols ? 33 : 0);

  // Entropy calculation: length * log2(poolSize)
  const entropy = length * (poolSize > 0 ? Math.log2(poolSize) : 0);

  // Common patterns penalty
  const isAllLetters = /^[a-zA-Z]+$/.test(password);
  const isAllNumbers = /^[0-9]+$/.test(password);
  const hasRepeating = /(.)\1{2,}/.test(password);

  if (length >= 8) score++;
  if (length >= 12) score++;
  if (length >= 16) score++;
  if (entropy >= 60) score++;
  if (entropy >= 80) score++;

  let varietyCount = 0;
  if (hasLower) varietyCount++;
  if (hasUpper) varietyCount++;
  if (hasNumbers) varietyCount++;
  if (hasSymbols) varietyCount++;

  if (varietyCount >= 3) score++;
  if (varietyCount === 4) score++;

  if (isAllLetters || isAllNumbers) score = Math.max(1, score - 2);
  if (hasRepeating) score = Math.max(1, score - 1);
  if (length < 8) score = Math.min(1, score);

  // Normalize score between 0 and 4
  const finalScore = Math.max(0, Math.min(4, Math.floor(score / 1.75)));

  const LEVELS = [
    { label: 'Very Weak', color: '#ef4444', percent: 20, feedback: 'Too short or predictable' },
    { label: 'Weak', color: '#f97316', percent: 40, feedback: 'Add symbols, numbers or more letters' },
    { label: 'Fair', color: '#eab308', percent: 60, feedback: 'Moderate strength; consider 14+ chars' },
    { label: 'Strong', color: '#10b981', percent: 80, feedback: 'Strong password' },
    { label: 'Very Strong', color: '#06b6d4', percent: 100, feedback: 'Excellent cryptographic complexity' }
  ];

  return Object.assign({ score: finalScore }, LEVELS[finalScore]);
}

module.exports = {
  generatePassword,
  evaluateStrength,
  DEFAULT_OPTIONS,
  CHAR_SETS
};

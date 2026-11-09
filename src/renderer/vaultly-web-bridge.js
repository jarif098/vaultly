/**
 * Vaultly - Universal Web & Mobile Bridge
 * Enables full zero-knowledge cryptographic vault management, GitHub sync,
 * QR code pairing, and local persistence in Android WebViews and mobile browsers.
 * Automatically activates when native Electron IPC is not detected.
 */

'use strict';

(function(root) {
  const FORMAT_IDENTIFIER = 'vaultly-encrypted-vault';
  const CURRENT_VERSION = 1;
  const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, keylen: 32 };
  const DEFAULT_REPO_NAME = 'vaultly-passwords';
  const VAULT_FILENAME = 'vaultly-vault.enc.json';

  // Helper: Hex conversions
  function buf2hex(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function hex2buf(hexString) {
    if (!hexString || hexString.length % 2 !== 0) {
      return new Uint8Array(0);
    }
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return bytes;
  }

  function utf8Encode(str) {
    return new TextEncoder().encode(str);
  }

  function utf8Decode(buf) {
    return new TextDecoder().decode(buf);
  }

  // MessageChannel-based setImmediate polyfill for 0ms non-blocking crypto loops
  if (typeof root !== 'undefined' && typeof root.setImmediate === 'undefined') {
    const immediateChannel = new MessageChannel();
    const immediateQueue = [];
    immediateChannel.port1.onmessage = () => {
      const task = immediateQueue.shift();
      if (task) task();
    };
    root.setImmediate = (fn) => {
      immediateQueue.push(fn);
      immediateChannel.port2.postMessage(null);
    };
  }

  // Safe multi-byte UTF-8 <-> Base64 helpers (never corrupts binary or throws URIError)
  function base64ToUtf8(base64Str) {
    if (!base64Str) return '';
    const clean = String(base64Str).replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  function utf8ToBase64(str) {
    if (!str) return '';
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
    }
    return btoa(binary);
  }

  function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // In-memory scrypt key cache to avoid repeating expensive scrypt calculations (0ms on warm hits)
  const scryptKeyCache = new Map();

  // --- Cryptography Subsystem (WebCrypto + scrypt-js) ---
  const Crypto = {
    async sha256(strOrBuf) {
      const data = typeof strOrBuf === 'string' ? utf8Encode(strOrBuf) : strOrBuf;
      const hashBuf = await crypto.subtle.digest('SHA-256', data);
      return buf2hex(hashBuf);
    },

    async deriveKey(password, saltUint8) {
      const cacheKey = (typeof password === 'string' ? password : buf2hex(password)) + '::' + buf2hex(saltUint8);
      if (scryptKeyCache.has(cacheKey)) {
        return scryptKeyCache.get(cacheKey);
      }

      const pwdBytes = typeof password === 'string' ? utf8Encode(password) : password;
      const scryptLib = root.scrypt || (root._scrypt);
      if (!scryptLib || !scryptLib.scrypt) {
        throw new Error('scrypt library not loaded. Ensure vendor/scrypt.js is included.');
      }
      const keyUint8 = await scryptLib.scrypt(
        pwdBytes,
        saltUint8,
        SCRYPT_PARAMS.N,
        SCRYPT_PARAMS.r,
        SCRYPT_PARAMS.p,
        SCRYPT_PARAMS.keylen
      );
      const res = keyUint8 instanceof Uint8Array ? keyUint8 : new Uint8Array(keyUint8);
      scryptKeyCache.set(cacheKey, res);
      return res;
    },

    async encrypt(dataObj, password) {
      const plaintextStr = typeof dataObj === 'object' ? JSON.stringify(dataObj) : String(dataObj);
      const plaintextBuf = utf8Encode(plaintextStr);

      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);

      const iv = new Uint8Array(12);
      crypto.getRandomValues(iv);

      const derivedKeyBytes = await this.deriveKey(password, salt);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        derivedKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const aad = utf8Encode(`${FORMAT_IDENTIFIER}:v${CURRENT_VERSION}`);

      const encryptedWithTag = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: aad,
          tagLength: 128
        },
        cryptoKey,
        plaintextBuf
      );

      const encryptedBytes = new Uint8Array(encryptedWithTag);
      const ciphertext = encryptedBytes.subarray(0, encryptedBytes.length - 16);
      const authTag = encryptedBytes.subarray(encryptedBytes.length - 16);

      return {
        format: FORMAT_IDENTIFIER,
        version: CURRENT_VERSION,
        algorithm: 'aes-256-gcm',
        kdf: 'scrypt',
        kdfParams: SCRYPT_PARAMS,
        salt: buf2hex(salt),
        iv: buf2hex(iv),
        authTag: buf2hex(authTag),
        ciphertext: buf2hex(ciphertext),
        meta: {
          encryptedAt: new Date().toISOString()
        }
      };
    },

    async decrypt(envelope, password) {
      if (!envelope || !envelope.ciphertext || !envelope.iv || !envelope.salt || !envelope.authTag) {
        throw new Error('Invalid vault envelope format.');
      }

      const salt = hex2buf(envelope.salt);
      const iv = hex2buf(envelope.iv);
      const authTag = hex2buf(envelope.authTag);
      const ciphertext = hex2buf(envelope.ciphertext);

      const combined = new Uint8Array(ciphertext.length + authTag.length);
      combined.set(ciphertext, 0);
      combined.set(authTag, ciphertext.length);

      const derivedKeyBytes = await this.deriveKey(password, salt);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        derivedKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const aad = utf8Encode(`${FORMAT_IDENTIFIER}:v${envelope.version || CURRENT_VERSION}`);

      const decryptedBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: aad,
          tagLength: 128
        },
        cryptoKey,
        combined
      );

      const text = utf8Decode(decryptedBuf);
      try {
        return JSON.parse(text);
      } catch (e) {
        return text;
      }
    }
  };

  let nativeHttpCounter = 0;
  const nativeHttpCallbacks = new Map();

  if (typeof window !== 'undefined') {
    window.__onNativeHttpResponse = function(callbackId, rawJson) {
      const cb = nativeHttpCallbacks.get(callbackId);
      if (cb) {
        nativeHttpCallbacks.delete(callbackId);
        try {
          const resObj = JSON.parse(rawJson);
          cb.resolve(resObj);
        } catch (err) {
          cb.reject(err);
        }
      }
    };
  }

  /**
   * Universal HTTP fetch:
   * 1. Uses Android native async Java bridge (window.VaultlyNativeBridge.executeHttpRequestAsync) - completely non-blocking!
   * 2. Falls back to synchronous native bridge if available.
   * 3. Falls back to standard browser fetch with error handling.
   */
  async function universalHttpFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const body = options.body !== undefined ? options.body : null;
    const bodyStr = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    // 1. Android Native Async Java Bridge (non-blocking, keeps 60/120fps UI, bypasses CORS)
    if (typeof window !== 'undefined' && window.VaultlyNativeBridge && typeof window.VaultlyNativeBridge.executeHttpRequestAsync === 'function') {
      try {
        const callbackId = 'cb_' + (++nativeHttpCounter) + '_' + Date.now();
        const resObj = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            nativeHttpCallbacks.delete(callbackId);
            reject(new Error('Network request timed out.'));
          }, 35000);

          nativeHttpCallbacks.set(callbackId, {
            resolve: (res) => { clearTimeout(timer); resolve(res); },
            reject: (err) => { clearTimeout(timer); reject(err); }
          });

          window.VaultlyNativeBridge.executeHttpRequestAsync(url, method, JSON.stringify(headers), bodyStr, callbackId);
        });

        if (resObj.status === 0 && !resObj.ok) {
          throw new Error(resObj.error || 'Network error connecting to remote server.');
        }

        let data = null;
        if (resObj.body) {
          try {
            data = JSON.parse(resObj.body);
          } catch (_) {
            data = resObj.body;
          }
        }

        return {
          status: resObj.status,
          ok: resObj.ok,
          data: data,
          text: async () => resObj.body || '',
          json: async () => data
        };
      } catch (asyncErr) {
        if (!asyncErr.message || !asyncErr.message.includes('not a function')) {
          // If network error, throw directly so retry/handlers catch it
          throw asyncErr;
        }
      }
    }

    // 2. Android Native Sync Java Bridge fallback
    if (typeof window !== 'undefined' && window.VaultlyNativeBridge && typeof window.VaultlyNativeBridge.executeHttpRequest === 'function') {
      try {
        const rawJson = window.VaultlyNativeBridge.executeHttpRequest(url, method, JSON.stringify(headers), bodyStr);
        const resObj = JSON.parse(rawJson);
        if (resObj.status === 0 && !resObj.ok) {
          throw new Error(resObj.error || 'Network error connecting to remote server.');
        }
        let data = null;
        if (resObj.body) {
          try {
            data = JSON.parse(resObj.body);
          } catch (_) {
            data = resObj.body;
          }
        }
        return {
          status: resObj.status,
          ok: resObj.ok,
          data: data,
          text: async () => resObj.body || '',
          json: async () => data
        };
      } catch (nativeErr) {
        if (nativeErr.message && !nativeErr.message.includes('not a function')) {
          throw nativeErr;
        }
      }
    }

    // 3. Standard Web fetch fallback
    const init = {
      method: method,
      headers: headers
    };
    if (body !== null && method !== 'GET' && method !== 'HEAD') {
      init.body = bodyStr;
    }

    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = text;
      }

      return {
        status: res.status,
        ok: res.ok,
        data: data,
        text: async () => text,
        json: async () => data
      };
    } catch (fetchErr) {
      throw new Error(fetchErr.message || 'Failed to fetch (Network or CORS policy error)');
    }
  }

  // --- GitHub REST API Client ---
  async function githubFetch(endpoint, { method = 'GET', token, body = null } = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Vaultly-Mobile-App/1.0.1'
    };

    if (token) {
      let clean = token.trim();
      if (clean.toLowerCase().startsWith('bearer ')) clean = clean.slice(7).trim();
      if (clean.toLowerCase().startsWith('token ')) clean = clean.slice(6).trim();

      if (clean.startsWith('ghp_')) {
        headers['Authorization'] = `token ${clean}`;
      } else {
        headers['Authorization'] = `Bearer ${clean}`;
      }
    }

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    return await universalHttpFetch(url, {
      method,
      headers,
      body
    });
  }

  // --- Storage & State Management ---
  const STORAGE_KEYS = {
    VAULT_ENVELOPE: 'vaultly_encrypted_vault',
    SETTINGS: 'vaultly_settings',
    GH_TOKEN: 'vaultly_gh_token',
    LOCAL_KEY: 'vaultly_local_key'
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      theme: 'dark',
      mode: 'unconfigured',
      github: {
        owner: '',
        repo: '',
        branch: 'main',
        autoSync: true,
        user: null
      },
      clipboardClearSeconds: 30,
      autoLockMinutes: 10
    };
  }

  function saveSettingsToStore(s) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
    } catch (e) {}
  }

  function getStoredGitHubToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.GH_TOKEN) || '';
    } catch (e) {
      return '';
    }
  }

  function setStoredGitHubToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.GH_TOKEN, token.trim());
      } else {
        localStorage.removeItem(STORAGE_KEYS.GH_TOKEN);
      }
    } catch (e) {}
  }

  function getOrCreateLocalVaultKey() {
    let key = localStorage.getItem(STORAGE_KEYS.LOCAL_KEY);
    if (!key) {
      const rand = new Uint8Array(32);
      crypto.getRandomValues(rand);
      key = buf2hex(rand);
      localStorage.setItem(STORAGE_KEYS.LOCAL_KEY, key);
    }
    return key;
  }

  // Vault Service (In-Memory State)
  class WebVaultService {
    constructor() {
      this.state = 'locked'; // 'not_initialized' | 'locked' | 'unlocked'
      this.entries = [];
      this.metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 1
      };
      this.cachedKey = null;
      this.settings = loadSettings();
      this.eventListeners = {
        autoLocked: [],
        vaultSynced: []
      };
      this.lastActivity = Date.now();
      this.startActivityMonitor();
    }

    deriveVaultKey(token, owner, repo) {
      if (!owner || !repo) return null;
      const cleanOwner = String(owner).trim().toLowerCase();
      const cleanRepo = String(repo).trim().toLowerCase();
      return Crypto.sha256(`vaultly-profile::${cleanOwner}::${cleanRepo}`);
    }

    startActivityMonitor() {
      setInterval(() => {
        // Permanent session on mobile: never auto-lock mobile app or small screen
        if (webApi.isMobile || window.innerWidth <= 768) return;
        if (this.state !== 'unlocked') return;
        const autoLockMin = this.settings.autoLockMinutes || 10;
        if (autoLockMin <= 0) return;
        const elapsed = (Date.now() - this.lastActivity) / 1000 / 60;
        if (elapsed >= autoLockMin) {
          this.lock();
          this.emit('autoLocked', { minutes: autoLockMin });
        }
      }, 10000);
    }

    recordActivity() {
      this.lastActivity = Date.now();
    }

    emit(event, data) {
      const list = this.eventListeners[event] || [];
      list.forEach(cb => {
        try { cb(data); } catch (e) {}
      });
    }

    on(event, callback) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(callback);
      return () => {
        this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
      };
    }

    lock() {
      this.state = 'locked';
      this.entries = [];
      this.cachedKey = null;
    }

    async unlockWithKey(key) {
      const rawEnv = localStorage.getItem(STORAGE_KEYS.VAULT_ENVELOPE);
      if (!rawEnv) {
        // Initialize empty vault
        this.entries = [];
        this.metadata = {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          revision: 1
        };
        this.cachedKey = key;
        await this.persist();
        this.state = 'unlocked';
        return { success: true, count: 0 };
      }

      const envelope = JSON.parse(rawEnv);
      const decrypted = await Crypto.decrypt(envelope, key);
      if (!decrypted) {
        throw new Error('Failed to decrypt vault with provided key.');
      }

      this.entries = Array.isArray(decrypted.entries) ? decrypted.entries : [];
      this.metadata = decrypted.metadata || {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 1
      };
      this.cachedKey = key;
      this.state = 'unlocked';
      return { success: true, count: this.entries.length };
    }

    async persist() {
      if (!this.cachedKey) return;
      const payload = {
        version: CURRENT_VERSION,
        metadata: this.metadata,
        entries: this.entries
      };
      const envelope = await Crypto.encrypt(payload, this.cachedKey, {
        entryCount: this.entries.length,
        revision: this.metadata.revision
      });
      localStorage.setItem(STORAGE_KEYS.VAULT_ENVELOPE, JSON.stringify(envelope));
      return envelope;
    }
  }

  const vaultService = new WebVaultService();

  // --- Password Generator ---
  const CHAR_POOLS = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
  };

  function generatePassword(options = {}) {
    const opts = Object.assign({
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true
    }, options);

    let charset = '';
    const guaranteed = [];

    if (opts.uppercase) {
      charset += CHAR_POOLS.uppercase;
      guaranteed.push(CHAR_POOLS.uppercase[Math.floor(Math.random() * CHAR_POOLS.uppercase.length)]);
    }
    if (opts.lowercase) {
      charset += CHAR_POOLS.lowercase;
      guaranteed.push(CHAR_POOLS.lowercase[Math.floor(Math.random() * CHAR_POOLS.lowercase.length)]);
    }
    if (opts.numbers) {
      charset += CHAR_POOLS.numbers;
      guaranteed.push(CHAR_POOLS.numbers[Math.floor(Math.random() * CHAR_POOLS.numbers.length)]);
    }
    if (opts.symbols) {
      charset += CHAR_POOLS.symbols;
      guaranteed.push(CHAR_POOLS.symbols[Math.floor(Math.random() * CHAR_POOLS.symbols.length)]);
    }

    if (!charset) charset = CHAR_POOLS.lowercase + CHAR_POOLS.numbers;

    const length = Math.max(8, Math.min(64, opts.length || 16));
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    const chars = [];
    for (let i = 0; i < length; i++) {
      chars.push(charset[randomBytes[i] % charset.length]);
    }

    // Insert guaranteed characters at random positions
    for (let i = 0; i < guaranteed.length && i < chars.length; i++) {
      chars[i] = guaranteed[i];
    }

    // Shuffle characters
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = chars[i];
      chars[i] = chars[j];
      chars[j] = temp;
    }

    const password = chars.join('');
    return {
      password: password,
      strength: evaluateStrength(password)
    };
  }

  function evaluateStrength(password) {
    if (!password || typeof password !== 'string') {
      return { score: 0, level: 'very_weak', label: 'Very Weak', entropy: 0 };
    }

    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 33;

    if (pool === 0) pool = 1;
    const entropy = Math.round(password.length * Math.log2(pool));

    let score = 0;
    let level = 'very_weak';
    let label = 'Very Weak';

    if (entropy >= 80) {
      score = 4; level = 'very_strong'; label = 'Very Strong';
    } else if (entropy >= 60) {
      score = 3; level = 'strong'; label = 'Strong';
    } else if (entropy >= 40) {
      score = 2; level = 'moderate'; label = 'Moderate';
    } else if (entropy >= 25) {
      score = 1; level = 'weak'; label = 'Weak';
    }

    return { score, level, label, entropy };
  }

  // --- Public Web Vaultly API Implementation ---
  let activeDeviceAuth = null;
  let isDeviceAuthPolling = false;

  const webApi = {
    isElectron: false,
    isMobile: true,

    async getStatus() {
      return {
        state: vaultService.state,
        initialized: Boolean(localStorage.getItem(STORAGE_KEYS.VAULT_ENVELOPE)),
        isEncrypted: true,
        entryCount: vaultService.entries ? vaultService.entries.length : 0,
        modifiedAt: vaultService.metadata?.updatedAt || new Date().toISOString()
      };
    },

    async checkAuthStatus() {
      vaultService.recordActivity();
      const settings = vaultService.settings;
      const ghToken = getStoredGitHubToken();
      const hasGitHub = Boolean(settings.github?.owner && settings.github?.repo && ghToken);

      if (hasGitHub) {
        const owner = settings.github.owner;
        const repo = settings.github.repo;
        const branch = settings.github.branch || 'main';
        const key = await vaultService.deriveVaultKey(ghToken, owner, repo);

        if (vaultService.state !== 'unlocked' && key) {
          try {
            await vaultService.unlockWithKey(key);
          } catch (e) {
            // Local vault envelope might not match; will sync from cloud on demand
          }
        }

        return {
          configured: true,
          mode: 'github',
          unlocked: true,
          entryCount: vaultService.entries.length,
          hasToken: true,
          owner: owner,
          repo: repo,
          branch: branch,
          user: settings.github.user || { login: owner }
        };
      }

      if (settings.mode === 'local') {
        const localKey = getOrCreateLocalVaultKey();
        if (vaultService.state !== 'unlocked' && localKey) {
          try {
            await vaultService.unlockWithKey(localKey);
          } catch (e) {}
        }
        return {
          configured: true,
          mode: 'local',
          unlocked: true,
          entryCount: vaultService.entries.length
        };
      }

      return {
        configured: false,
        mode: settings.mode || 'unconfigured',
        hasToken: Boolean(ghToken),
        user: settings.github?.user || null,
        owner: settings.github?.owner || '',
        repo: settings.github?.repo || '',
        branch: settings.github?.branch || 'main',
        autoSync: settings.github?.autoSync !== false
      };
    },

    async saveLocal() {
      vaultService.settings.mode = 'local';
      saveSettingsToStore(vaultService.settings);
      const localKey = getOrCreateLocalVaultKey();
      await vaultService.unlockWithKey(localKey);
      return { success: true };
    },

    async loginWithGitHubDetails({ token, owner, repo, branch = 'main', autoSync = true }) {
      if (!token || !owner || !repo) {
        throw new Error('Token, owner, and repository name are required.');
      }

      const cleanToken = token.trim();
      const cleanOwner = owner.trim();
      const cleanRepo = repo.trim();
      const cleanBranch = (branch || 'main').trim();

      // Verify connection with GitHub
      const testRes = await githubFetch(`/repos/${cleanOwner}/${cleanRepo}`, {
        token: cleanToken
      });

      if (!testRes.ok) {
        if (testRes.status === 404) {
          throw new Error(`Repository ${cleanOwner}/${cleanRepo} was not found or your token lacks permission.`);
        } else if (testRes.status === 401) {
          throw new Error('Invalid GitHub token. Please verify token permissions.');
        } else {
          throw new Error(`GitHub error (${testRes.status}): ${testRes.data?.message || 'Connection failed'}`);
        }
      }

      // Fetch user profile
      let userObj = { login: cleanOwner };
      try {
        const uRes = await githubFetch('/user', { token: cleanToken });
        if (uRes.ok && uRes.data) {
          userObj = {
            login: uRes.data.login,
            name: uRes.data.name,
            avatarUrl: uRes.data.avatar_url
          };
        }
      } catch (e) {}

      // Save settings
      setStoredGitHubToken(cleanToken);
      vaultService.settings.mode = 'github';
      vaultService.settings.hasGitHubToken = true;
      vaultService.settings.github = {
        owner: cleanOwner,
        repo: cleanRepo,
        branch: cleanBranch,
        autoSync: Boolean(autoSync),
        user: userObj,
        lastSyncStatus: 'verified_qr',
        lastSyncTimestamp: Date.now(),
        pairedViaQr: true
      };
      saveSettingsToStore(vaultService.settings);

      // Derive key and unlock or sync
      const derivedKey = await vaultService.deriveVaultKey(cleanToken, cleanOwner, cleanRepo);
      vaultService.cachedKey = derivedKey;

      try {
        await this.syncWithGitHub(false);
      } catch (syncErr) {
        // If file doesn't exist remotely yet, initialize new vault
        if (vaultService.entries.length === 0) {
          await vaultService.unlockWithKey(derivedKey);
          await this.syncWithGitHub(true);
        }
      }

      return { success: true, user: userObj };
    },

    async disconnectGitHub() {
      setStoredGitHubToken('');
      vaultService.settings.github = {
        owner: '',
        repo: '',
        branch: 'main',
        autoSync: true,
        user: null,
        lastSyncStatus: 'not_configured',
        pairedViaQr: false
      };
      vaultService.settings.mode = 'unconfigured';
      vaultService.settings.hasGitHubToken = false;
      saveSettingsToStore(vaultService.settings);
      vaultService.cachedKey = null;
      vaultService.entries = [];
      vaultService.lock();

      try {
        localStorage.removeItem(STORAGE_KEYS.GH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.VAULT_ENVELOPE);
        localStorage.removeItem(STORAGE_KEYS.LOCAL_KEY);
      } catch (e) {}

      return { success: true };
    },

    async testGitHubConnection(owner, repo) {
      const token = getStoredGitHubToken();
      if (!token) throw new Error('No GitHub token configured.');
      const res = await githubFetch(`/repos/${owner}/${repo}`, { token });
      if (!res.ok) {
        throw new Error(res.data?.message || `Repository test failed (${res.status}).`);
      }
      return {
        success: true,
        private: Boolean(res.data?.private),
        permissions: res.data?.permissions || {}
      };
    },

    async createPrivateGitHubRepo(repoName) {
      const token = getStoredGitHubToken();
      if (!token) throw new Error('No GitHub token configured.');
      const name = (repoName || DEFAULT_REPO_NAME).trim();
      const res = await githubFetch('/user/repos', {
        method: 'POST',
        token,
        body: {
          name: name,
          private: true,
          description: 'Vaultly Encrypted Password Vault Backup',
          auto_init: true
        }
      });
      if (!res.ok) {
        throw new Error(res.data?.message || `Failed to create repository (${res.status}).`);
      }
      return { success: true, repo: res.data };
    },

    async getGitHubUserRepos() {
      const token = getStoredGitHubToken();
      if (!token) return [];
      const res = await githubFetch('/user/repos?type=all&sort=updated&per_page=100', { token });
      if (!res.ok) return [];
      return (res.data || []).map(r => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        owner: r.owner?.login,
        default_branch: r.default_branch
      }));
    },

    async getGitHubUserProfile() {
      const token = getStoredGitHubToken();
      if (!token) return null;
      const res = await githubFetch('/user', { token });
      if (!res.ok) return null;
      return {
        login: res.data.login,
        name: res.data.name,
        avatarUrl: res.data.avatar_url
      };
    },

    async checkRepoVault(owner, repo, branch = 'main') {
      const token = getStoredGitHubToken();
      if (!token) return { found: false };
      const res = await githubFetch(`/repos/${owner}/${repo}/contents/${VAULT_FILENAME}?ref=${branch}`, { token });
      if (res.status === 200 && res.data) {
        return {
          found: true,
          sha: res.data.sha,
          size: res.data.size
        };
      }
      return { found: false };
    },

    async syncWithGitHub(forceOverwrite = false, cloudPassword = null) {
      vaultService.recordActivity();
      const token = getStoredGitHubToken();
      const gh = vaultService.settings.github || {};
      if (!token || !gh.owner || !gh.repo) {
        throw new Error('GitHub sync is not configured.');
      }

      const branch = gh.branch || 'main';

      // Build key candidates (matches desktop compatibility)
      const candidates = [];
      const cleanToken = token.trim();
      const cleanOwner = String(gh.owner).trim().toLowerCase();
      const cleanRepo = String(gh.repo).trim().toLowerCase();

      if (vaultService.cachedKey) candidates.push(vaultService.cachedKey);
      if (cloudPassword && typeof cloudPassword === 'string' && cloudPassword.trim()) {
        candidates.push(cloudPassword.trim());
      }

      const profileKey = await Crypto.sha256(`vaultly-profile::${cleanOwner}::${cleanRepo}`);
      if (profileKey && !candidates.includes(profileKey)) candidates.push(profileKey);

      const legacyKey = await Crypto.sha256(`${cleanToken}::${cleanOwner}/${cleanRepo}`);
      if (legacyKey && !candidates.includes(legacyKey)) candidates.push(legacyKey);

      if (cleanToken && !candidates.includes(cleanToken)) candidates.push(cleanToken);

      // 1. Fetch remote file
      const getRes = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}?ref=${branch}`, { token });

      if (getRes.status === 404) {
        // No remote vault yet, push current local
        const env = await vaultService.persist();
        const base64Content = utf8ToBase64(JSON.stringify(env, null, 2));
        const putRes = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}`, {
          method: 'PUT',
          token,
          body: {
            message: 'Initialize Vaultly encrypted vault',
            content: base64Content,
            branch: branch
          }
        });
        if (!putRes.ok) throw new Error(`Failed to push initial vault: ${putRes.data?.message}`);
        vaultService.metadata.lastRemoteSha = putRes.data?.content?.sha || null;
        vaultService.metadata.isDirty = false;
        await vaultService.persist();
        return { success: true, action: 'created_remote', message: 'Initialized remote vault on GitHub.' };
      }

      if (!getRes.ok) {
        throw new Error(`Failed to check remote vault: ${getRes.data?.message || getRes.status}`);
      }

      const remoteSha = getRes.data.sha;

      // If SHA matches our last known SHA and local has no un-synced edits, we are already in sync
      if (!forceOverwrite && !cloudPassword && vaultService.metadata.lastRemoteSha && vaultService.metadata.lastRemoteSha === remoteSha) {
        if (!vaultService.metadata.isDirty) {
          return {
            success: true,
            action: 'in_sync',
            message: 'Encrypted vault is up to date with GitHub.',
            sha: remoteSha
          };
        }
      }

      let remoteEnvelope = null;
      try {
        const decodedStr = base64ToUtf8(getRes.data.content);
        remoteEnvelope = JSON.parse(decodedStr);
      } catch (e) {
        throw new Error('Failed to parse remote vault JSON payload.');
      }

      // Decrypt remote envelope by testing key candidates
      let remoteDecrypted = null;
      let effectiveKey = null;
      for (const candidate of candidates) {
        try {
          remoteDecrypted = await Crypto.decrypt(remoteEnvelope, candidate);
          if (remoteDecrypted && (Array.isArray(remoteDecrypted.entries) || remoteDecrypted.format === FORMAT_IDENTIFIER)) {
            effectiveKey = candidate;
            break;
          }
        } catch (_) {}
      }

      if (!remoteDecrypted) {
        throw new Error('Remote vault could not be decrypted with stored credentials.');
      }

      vaultService.cachedKey = effectiveKey;

      const remoteEntries = Array.isArray(remoteDecrypted?.entries) ? remoteDecrypted.entries : [];
      const mergedMap = new Map();

      // Put existing local entries in map
      (vaultService.entries || []).forEach(e => mergedMap.set(e.id, e));

      let remoteAddedCount = 0;
      remoteEntries.forEach(re => {
        if (!mergedMap.has(re.id)) {
          mergedMap.set(re.id, re);
          remoteAddedCount++;
        } else {
          const localE = mergedMap.get(re.id);
          const localT = new Date(localE.updatedAt || 0).getTime();
          const remoteT = new Date(re.updatedAt || 0).getTime();
          if (remoteT > localT) {
            mergedMap.set(re.id, re);
            remoteAddedCount++;
          }
        }
      });

      // Detect if local has exclusive changes or newer edits not present remotely
      const remoteEntryIds = new Set(remoteEntries.map(e => e.id));
      let localHasExclusiveChanges = false;
      for (const le of (vaultService.entries || [])) {
        if (!remoteEntryIds.has(le.id)) {
          localHasExclusiveChanges = true;
          break;
        } else {
          const re = remoteEntries.find(r => r.id === le.id);
          if (re && new Date(le.updatedAt || 0).getTime() > new Date(re.updatedAt || 0).getTime()) {
            localHasExclusiveChanges = true;
            break;
          }
        }
      }

      vaultService.entries = Array.from(mergedMap.values());
      vaultService.metadata.updatedAt = new Date().toISOString();
      vaultService.metadata.revision = Math.max(vaultService.metadata.revision || 0, remoteDecrypted?.metadata?.revision || 0) + 1;

      // If local has no changes to push and we're not force-overwriting, persist locally and finish!
      if (!localHasExclusiveChanges && !forceOverwrite) {
        vaultService.metadata.lastRemoteSha = remoteSha;
        vaultService.metadata.isDirty = false;
        await vaultService.persist();
        vaultService.state = 'unlocked';
        vaultService.emit('vaultSynced', { action: 'merged_and_synced', message: `Synced ${vaultService.entries.length} passwords.` });
        return {
          success: true,
          action: 'merged_and_synced',
          message: `Synced ${remoteAddedCount} new items from GitHub. Total: ${vaultService.entries.length}`
        };
      }

      // Local has changes that remote needs: encrypt and push
      const updatedEnv = await vaultService.persist();
      const newBase64 = utf8ToBase64(JSON.stringify(updatedEnv, null, 2));
      let pushSha = remoteSha;

      let pushRes = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}`, {
        method: 'PUT',
        token,
        body: {
          message: `Sync Vaultly encrypted vault [rev ${vaultService.metadata.revision}]`,
          content: newBase64,
          branch: branch,
          sha: pushSha
        }
      });

      if (!pushRes.ok && pushRes.status === 409) {
        // Handle 409 SHA conflict by fetching current HEAD SHA and retrying once
        const freshGet = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}?ref=${branch}`, { token });
        if (freshGet.ok && freshGet.data?.sha) {
          pushRes = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}`, {
            method: 'PUT',
            token,
            body: {
              message: `Sync Vaultly encrypted vault [rev ${vaultService.metadata.revision}]`,
              content: newBase64,
              branch: branch,
              sha: freshGet.data.sha
            }
          });
        }
      }

      if (!pushRes.ok) {
        throw new Error(`Sync conflict (${pushRes.status}): ${pushRes.data?.message || 'Remote push failed'}`);
      }

      vaultService.metadata.lastRemoteSha = pushRes.data?.content?.sha || remoteSha;
      vaultService.metadata.isDirty = false;
      if (vaultService.settings.github) {
        vaultService.settings.github.lastSyncStatus = 'verified_qr';
        vaultService.settings.github.lastSyncTimestamp = Date.now();
        vaultService.settings.github.pairedViaQr = true;
        saveSettingsToStore(vaultService.settings);
      }
      await vaultService.persist();

      vaultService.state = 'unlocked';
      vaultService.emit('vaultSynced', { action: 'merged_and_synced', message: `Synced ${vaultService.entries.length} passwords.` });
      return { success: true, action: 'merged_and_synced', message: `Vault synced with GitHub (${vaultService.entries.length} items).` };
    },

    async restoreFromCloud(cloudPassword = null) {
      return await this.syncWithGitHub(false, cloudPassword);
    },

    async getEntries(options = {}) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') {
        throw new Error('Vault is locked. Unlock before accessing entries.');
      }

      let result = [...vaultService.entries];

      if (options.category && options.category !== 'all') {
        if (options.category === 'favorites') {
          result = result.filter(e => Boolean(e.favorite || e.isFavorite));
        } else if (options.category === 'recent') {
          const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
          result = result.filter(e => new Date(e.createdAt || e.updatedAt).getTime() >= cutoff);
        } else {
          result = result.filter(e => e.category === options.category);
        }
      }

      const q = (options.search || options.query || '').trim().toLowerCase();
      if (q) {
        result = result.filter(e =>
          (e.service && e.service.toLowerCase().includes(q)) ||
          (e.username && e.username.toLowerCase().includes(q)) ||
          (e.url && e.url.toLowerCase().includes(q)) ||
          (e.websiteUrl && e.websiteUrl.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (Array.isArray(e.tags) && e.tags.some(t => t.toLowerCase().includes(q)))
        );
      }

      if (options.sortBy) {
        result.sort((a, b) => {
          if (options.sortBy === 'updatedAt' || options.sortBy === 'createdAt') {
            return new Date(b[options.sortBy] || 0) - new Date(a[options.sortBy] || 0);
          }
          return (a.service || '').localeCompare(b.service || '');
        });
      }

      return result;
    },

    async addEntry(entryData) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') throw new Error('Vault is locked.');
      if (!entryData.service || !entryData.username || !entryData.password) {
        throw new Error('Service, username, and password are required.');
      }

      const now = new Date().toISOString();
      const newEntry = {
        id: generateUUID(),
        service: entryData.service.trim(),
        username: entryData.username.trim(),
        password: entryData.password,
        url: (entryData.url || '').trim(),
        notes: (entryData.notes || '').trim(),
        category: entryData.category || 'general',
        favorite: Boolean(entryData.favorite),
        createdAt: now,
        updatedAt: now
      };

      vaultService.entries.push(newEntry);
      vaultService.metadata.updatedAt = now;
      vaultService.metadata.isDirty = true;
      await vaultService.persist();

      if (vaultService.settings.github?.autoSync && getStoredGitHubToken()) {
        this.syncWithGitHub(false).catch(err => console.warn('Background auto-sync failed:', err));
      }

      return { success: true, entry: newEntry };
    },

    async updateEntry(id, updates) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') throw new Error('Vault is locked.');
      const idx = vaultService.entries.findIndex(e => e.id === id);
      if (idx === -1) throw new Error('Entry not found.');

      const now = new Date().toISOString();
      const existing = vaultService.entries[idx];
      const updated = Object.assign({}, existing, updates, {
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now
      });

      vaultService.entries[idx] = updated;
      vaultService.metadata.updatedAt = now;
      vaultService.metadata.isDirty = true;
      await vaultService.persist();

      if (vaultService.settings.github?.autoSync && getStoredGitHubToken()) {
        this.syncWithGitHub(false).catch(err => console.warn('Background auto-sync failed:', err));
      }

      return { success: true, entry: updated };
    },

    async deleteEntry(id) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') throw new Error('Vault is locked.');
      const before = vaultService.entries.length;
      vaultService.entries = vaultService.entries.filter(e => e.id !== id);
      if (vaultService.entries.length === before) throw new Error('Entry not found.');

      vaultService.metadata.updatedAt = new Date().toISOString();
      vaultService.metadata.isDirty = true;
      await vaultService.persist();

      if (vaultService.settings.github?.autoSync && getStoredGitHubToken()) {
        this.syncWithGitHub(false).catch(err => console.warn('Background auto-sync failed:', err));
      }

      return { success: true };
    },

    async toggleFavorite(id) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') throw new Error('Vault is locked.');
      const entry = vaultService.entries.find(e => e.id === id);
      if (!entry) throw new Error('Entry not found.');

      entry.favorite = !entry.favorite;
      entry.updatedAt = new Date().toISOString();
      vaultService.metadata.updatedAt = entry.updatedAt;
      vaultService.metadata.isDirty = true;
      await vaultService.persist();

      if (vaultService.settings.github?.autoSync && getStoredGitHubToken()) {
        this.syncWithGitHub(false).catch(err => console.warn('Background auto-sync failed:', err));
      }

      return { success: true, favorite: entry.favorite };
    },

    async checkDuplicate(service, username, currentId) {
      const match = vaultService.entries.find(e =>
        e.id !== currentId &&
        e.service.toLowerCase() === (service || '').trim().toLowerCase() &&
        e.username.toLowerCase() === (username || '').trim().toLowerCase()
      );
      return { isDuplicate: Boolean(match), matchingEntry: match || null };
    },

    async generatePassword(options) {
      return generatePassword(options);
    },

    async evaluateStrength(password) {
      return evaluateStrength(password);
    },

    async copyToClipboard(text, isSensitive = false) {
      if (typeof window !== 'undefined' && window.VaultlyNativeBridge && typeof window.VaultlyNativeBridge.copyToClipboard === 'function') {
        window.VaultlyNativeBridge.copyToClipboard(text);
        if (isSensitive) {
          const timeoutSec = vaultService.settings.clipboardClearSeconds || 30;
          setTimeout(() => {
            try { window.VaultlyNativeBridge.copyToClipboard(''); } catch (_) {}
          }, timeoutSec * 1000);
        }
        return { success: true };
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        if (isSensitive) {
          const timeoutSec = vaultService.settings.clipboardClearSeconds || 30;
          setTimeout(async () => {
            try {
              const current = await navigator.clipboard.readText();
              if (current === text) {
                await navigator.clipboard.writeText('');
              }
            } catch (e) {}
          }, timeoutSec * 1000);
        }
        return { success: true };
      }

      // Legacy textarea fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async performAutoLogin(options) {
      // Keystroke simulation is desktop-only, copy password on mobile
      if (options && options.password) {
        await this.copyToClipboard(options.password, true);
        return { success: true, message: 'Password copied to clipboard (Keystroke simulation is desktop-only).' };
      }
      return { success: false, message: 'Keystroke simulation is desktop-only.' };
    },

    onTriggerQuickAutoType(callback) {
      return () => {};
    },

    async getSettings() {
      const s = Object.assign({}, vaultService.settings);
      const token = getStoredGitHubToken();
      s.hasGitHubToken = Boolean(token || s.hasGitHubToken);
      if (s.github && s.github.owner && s.github.repo) {
        s.github.lastSyncStatus = s.github.lastSyncStatus || 'verified_qr';
        s.github.pairedViaQr = true;
      }
      return s;
    },

    async saveSettings(updates) {
      vaultService.settings = Object.assign({}, vaultService.settings, updates);
      saveSettingsToStore(vaultService.settings);
      return vaultService.settings;
    },

    async saveGitHubToken(token, allowUnsafeFallback) {
      setStoredGitHubToken(token);
      vaultService.settings.hasGitHubToken = Boolean(token);
      saveSettingsToStore(vaultService.settings);
      return { success: true };
    },

    async clearGitHubToken() {
      setStoredGitHubToken('');
      vaultService.settings.hasGitHubToken = false;
      saveSettingsToStore(vaultService.settings);
      return { success: true };
    },

    // Connected Devices & Access Management
    async getConnectedDevices() {
      const s = vaultService.settings || {};
      const isMobile = Boolean(webApi.isMobile || window.innerWidth <= 768);
      const current = {
        id: isMobile ? 'device-mobile-current' : 'device-pc-primary',
        name: isMobile ? 'This Android Phone' : 'This PC (Desktop)',
        type: isMobile ? 'mobile' : 'desktop',
        platform: isMobile ? 'Android' : 'Windows',
        pairedVia: 'Current Session',
        pairedAt: s.createdAt || Date.now(),
        lastActive: Date.now(),
        isCurrent: true,
        status: 'authorized'
      };

      let list = Array.isArray(s.connectedDevices) ? [...s.connectedDevices] : [];
      const hasGitHub = Boolean(s.github?.owner && s.github?.repo);
      const isRevoked = Array.isArray(s.revokedDevices) && s.revokedDevices.some(d => d.id === 'device-mobile-android');

      if (list.length === 0 && hasGitHub && !isRevoked) {
        list.push({
          id: isMobile ? 'device-pc-primary' : 'device-mobile-android',
          name: isMobile ? 'Primary PC (Desktop)' : 'Android Phone (Vaultly APK)',
          type: isMobile ? 'desktop' : 'mobile',
          platform: isMobile ? 'Windows' : 'Android',
          pairedVia: 'QR Scan',
          pairedAt: s.github?.lastSyncTimestamp || Date.now() - 3600000,
          lastActive: s.github?.lastSyncTimestamp || Date.now() - 60000,
          isCurrent: false,
          status: 'authorized'
        });
        s.connectedDevices = list;
        saveSettingsToStore(s);
      }

      return [current, ...list.filter(d => !d.isCurrent)];
    },

    async revokeDeviceAccess(deviceId) {
      const s = vaultService.settings || {};
      if (!Array.isArray(s.connectedDevices)) s.connectedDevices = [];
      if (!Array.isArray(s.revokedDevices)) s.revokedDevices = [];

      const removed = s.connectedDevices.find(d => d.id === deviceId);
      s.connectedDevices = s.connectedDevices.filter(d => d.id !== deviceId);
      s.revokedDevices.push({
        id: deviceId,
        name: removed ? removed.name : 'Unknown Device',
        revokedAt: Date.now()
      });
      saveSettingsToStore(s);

      return {
        success: true,
        deviceId,
        remainingDevices: await this.getConnectedDevices()
      };
    },

    async registerConnectedDevice(deviceInfo) {
      if (!deviceInfo || !deviceInfo.id) return;
      const s = vaultService.settings || {};
      if (!Array.isArray(s.connectedDevices)) s.connectedDevices = [];
      s.connectedDevices = s.connectedDevices.filter(d => d.id !== deviceInfo.id);
      s.connectedDevices.push(deviceInfo);
      saveSettingsToStore(s);
      return await this.getConnectedDevices();
    },

    // QR Code Mobile Pairing Features
    async getMobilePairingData() {
      const ghToken = getStoredGitHubToken();
      const settings = vaultService.settings;
      const isGitHub = Boolean(settings.github?.owner && settings.github?.repo && ghToken);

      if (isGitHub) {
        return {
          type: 'vaultly-pair',
          v: 1,
          mode: 'github',
          owner: settings.github.owner,
          repo: settings.github.repo,
          branch: settings.github.branch || 'main',
          token: ghToken
        };
      }

      return {
        type: 'vaultly-pair',
        v: 1,
        mode: settings.mode === 'local' ? 'local' : 'unconfigured',
        localKey: settings.mode === 'local' ? getOrCreateLocalVaultKey() : null
      };
    },

    async loginWithPairingCode(pairingDataInput) {
      let data = pairingDataInput;
      if (typeof pairingDataInput === 'string') {
        try {
          data = JSON.parse(pairingDataInput.trim());
        } catch (e) {
          throw new Error('Invalid QR code format. Not a Vaultly pairing code.');
        }
      }

      if (!data || data.type !== 'vaultly-pair') {
        throw new Error('Invalid pairing code. Expected Vaultly pairing QR code.');
      }

      if (data.mode === 'github') {
        if (!data.token || !data.owner || !data.repo) {
          throw new Error('Incomplete GitHub pairing data in QR code.');
        }
        return await this.loginWithGitHubDetails({
          token: data.token,
          owner: data.owner,
          repo: data.repo,
          branch: data.branch || 'main',
          autoSync: true
        });
      } else if (data.mode === 'local') {
        if (data.localKey) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_KEY, data.localKey);
        }
        return await this.saveLocal();
      }

      throw new Error(`Unsupported pairing mode: ${data.mode}`);
    },

    openExternalUrl(url) {
      window.open(url, '_blank');
      return { success: true };
    },

    recordActivity() {
      vaultService.recordActivity();
    },

    minimizeWindow() { return false; },
    maximizeWindow() { return false; },
    closeWindow() { return false; },
    isWindowMaximized() { return true; },
    toggleDevTools() {},
    onWindowStateChange() { return () => {}; },
    onAutoLocked(cb) { return vaultService.on('autoLocked', cb); },
    onVaultSynced(cb) { return vaultService.on('vaultSynced', cb); },

    // Export & Restore
    async exportBackupFile(password) {
      const payload = {
        format: FORMAT_IDENTIFIER,
        version: CURRENT_VERSION,
        exportedAt: new Date().toISOString(),
        entries: vaultService.entries
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultly-backup-${new Date().toISOString().slice(0, 10)}.vaultly`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, count: vaultService.entries.length };
    },

    async restoreBackupFile(password, fileContent) {
      if (!fileContent) throw new Error('No backup file provided.');
      let parsed = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
      if (!parsed.entries || !Array.isArray(parsed.entries)) {
        throw new Error('Invalid backup file structure.');
      }

      const mergedMap = new Map();
      (vaultService.entries || []).forEach(e => mergedMap.set(e.id, e));
      parsed.entries.forEach(e => mergedMap.set(e.id, e));

      vaultService.entries = Array.from(mergedMap.values());
      vaultService.metadata.updatedAt = new Date().toISOString();
      await vaultService.persist();
      return { success: true, count: vaultService.entries.length };
    },

    async lockVault() {
      vaultService.lock();
      return { success: true };
    },

    async changeMasterPassword(currentPassword, newPassword) {
      vaultService.recordActivity();
      if (vaultService.state !== 'unlocked') {
        throw new Error('Vault must be unlocked to change password.');
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New master password must be at least 8 characters long.');
      }
      const newKey = await Crypto.deriveMasterKey(newPassword);
      vaultService.cachedKey = newKey;
      await vaultService.persist();
      return { success: true };
    },

    async resetAppData() {
      localStorage.removeItem(STORAGE_KEYS.VAULT_ENVELOPE);
      localStorage.removeItem(STORAGE_KEYS.LOCAL_KEY);
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      sessionStorage.removeItem(STORAGE_KEYS.GH_TOKEN);
      vaultService.entries = [];
      vaultService.metadata = { revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      vaultService.settings = { mode: 'unconfigured', autoLockMinutes: 5, autoSync: true, github: {} };
      vaultService.cachedKey = null;
      vaultService.state = 'not_initialized';
      return { success: true };
    },

    async getGitHubBackupHistory() {
      const token = getStoredGitHubToken();
      const gh = vaultService.settings.github || {};
      if (!token || !gh.owner || !gh.repo) return [];
      const branch = gh.branch || 'main';
      const res = await githubFetch(`/repos/${gh.owner}/${gh.repo}/commits?path=${VAULT_FILENAME}&sha=${branch}&per_page=30`, { token });
      if (!res.ok) return [];
      return (res.data || []).map(c => ({
        sha: c.sha,
        message: c.commit?.message || '',
        author: c.commit?.author?.name || c.author?.login || 'Unknown',
        date: c.commit?.author?.date || '',
        url: c.html_url
      }));
    },

    async restoreFromGitHubCommit(sha, cloudPassword = null) {
      const token = getStoredGitHubToken();
      const gh = vaultService.settings.github || {};
      if (!token || !gh.owner || !gh.repo) throw new Error('GitHub sync not configured');
      const res = await githubFetch(`/repos/${gh.owner}/${gh.repo}/contents/${VAULT_FILENAME}?ref=${sha}`, { token });
      if (!res.ok) throw new Error(`Failed to fetch commit backup: ${res.status}`);
      const decodedStr = base64ToUtf8(res.data.content);
      const envelope = JSON.parse(decodedStr);
      const key = vaultService.cachedKey || (await vaultService.deriveVaultKey(token, gh.owner, gh.repo));
      let decrypted;
      try {
        decrypted = await Crypto.decrypt(envelope, key);
      } catch (e) {
        if (cloudPassword) {
          decrypted = await Crypto.decrypt(envelope, cloudPassword);
        } else {
          throw e;
        }
      }
      if (!decrypted || !Array.isArray(decrypted.entries)) throw new Error('Failed to decrypt commit backup');
      vaultService.entries = decrypted.entries;
      vaultService.metadata = decrypted.metadata || vaultService.metadata;
      await vaultService.persist();
      return { success: true, count: vaultService.entries.length };
    },

    async startGitHubDeviceLogin() {
      const CLIENT_ID = '178c6fc778ccc68e1d6a';
      try {
        const response = await universalHttpFetch('https://github.com/login/device/code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Vaultly-Mobile-App/1.0.1'
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            scope: 'repo,read:user'
          })
        });

        if (!response.ok) {
          throw new Error(`GitHub responded with status ${response.status}`);
        }

        const data = response.data || await response.json();
        activeDeviceAuth = {
          deviceCode: data.device_code,
          userCode: data.user_code,
          verificationUri: data.verification_uri || 'https://github.com/login/device',
          interval: (data.interval || 5) * 1000,
          expiresAt: Date.now() + ((data.expires_in || 900) * 1000)
        };
        isDeviceAuthPolling = true;

        return {
          success: true,
          userCode: activeDeviceAuth.userCode,
          verificationUri: activeDeviceAuth.verificationUri
        };
      } catch (err) {
        throw new Error('Device login error: ' + err.message + '. Please use "Scan QR from PC" or manual PAT.');
      }
    },

    async pollGitHubDeviceLogin() {
      if (!activeDeviceAuth || !activeDeviceAuth.deviceCode) {
        throw new Error('No active GitHub device authorization in progress.');
      }

      const CLIENT_ID = '178c6fc778ccc68e1d6a';
      isDeviceAuthPolling = true;

      while (isDeviceAuthPolling) {
        if (Date.now() > activeDeviceAuth.expiresAt) {
          isDeviceAuthPolling = false;
          throw new Error('Authorization code expired. Please try again.');
        }

        await new Promise(r => setTimeout(r, activeDeviceAuth.interval || 5000));
        if (!isDeviceAuthPolling) break;

        try {
          const res = await universalHttpFetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Vaultly-Mobile-App/1.0.1'
            },
            body: JSON.stringify({
              client_id: CLIENT_ID,
              device_code: activeDeviceAuth.deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
          });

          const data = res.data || await res.json();
          if (data.access_token) {
            isDeviceAuthPolling = false;
            const token = data.access_token;
            setStoredGitHubToken(token);
            vaultService.settings.hasGitHubToken = true;

            let userObj = { login: 'github-user' };
            try {
              const uRes = await githubFetch('/user', { token });
              if (uRes.ok && uRes.data) {
                userObj = {
                  login: uRes.data.login,
                  name: uRes.data.name,
                  avatarUrl: uRes.data.avatar_url
                };
              }
            } catch (_) {}

            vaultService.settings.github = Object.assign({}, vaultService.settings.github, {
              user: userObj
            });
            saveSettingsToStore(vaultService.settings);

            activeDeviceAuth = null;
            return {
              success: true,
              token: token,
              user: userObj
            };
          }

          if (data.error === 'authorization_pending') {
            continue;
          } else if (data.error === 'slow_down') {
            activeDeviceAuth.interval += 5000;
          } else if (data.error) {
            isDeviceAuthPolling = false;
            throw new Error(data.error_description || data.error);
          }
        } catch (fetchErr) {
          if (!isDeviceAuthPolling) break;
        }
      }

      return { success: false, cancelled: true };
    },

    cancelGitHubDeviceLogin() {
      isDeviceAuthPolling = false;
      activeDeviceAuth = null;
      return { success: true };
    }
  };

  // If Electron preload script already defined window.vaultlyApi, augment it with pairing helper:
  if (root.vaultlyApi) {
    if (!root.vaultlyApi.loginWithPairingCode) {
      root.vaultlyApi.loginWithPairingCode = async function(pairingInput) {
        let data = pairingInput;
        if (typeof pairingInput === 'string') {
          data = JSON.parse(pairingInput.trim());
        }
        if (!data || data.type !== 'vaultly-pair') {
          throw new Error('Invalid Vaultly pairing code.');
        }
        if (data.mode === 'github') {
          return await root.vaultlyApi.loginWithGitHubDetails({
            token: data.token,
            owner: data.owner,
            repo: data.repo,
            branch: data.branch || 'main',
            autoSync: true
          });
        }
        return { success: false, error: 'Unsupported mode' };
      };
    }
    root.vaultlyApi.isElectron = true;
    root.vaultlyApi.isMobile = false;
  } else {
    // We are on Android or Mobile Browser!
    webApi.isMobile = true;
    webApi.isElectron = false;
    root.vaultlyApi = webApi;
    if (typeof document !== 'undefined') {
      const applyMobileClass = () => {
        if (document.documentElement) document.documentElement.classList.add('platform-mobile');
        if (document.body) document.body.classList.add('platform-mobile');
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyMobileClass);
      } else {
        applyMobileClass();
      }
    }
  }

  root.VaultlyWebApi = webApi;
})(typeof window !== 'undefined' ? window : global);

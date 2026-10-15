/**
 * Vaultly - Comprehensive Automated Test Suite
 * Tests crypto roundtrips, wrong password detection, password generator,
 * validation, file storage atomic write, and vault CRUD lifecycle.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cryptoService = require('../src/services/crypto');
const pwdGen = require('../src/services/password-generator');
const validation = require('../src/utils/validation');
const fileStorage = require('../src/utils/file-storage');
const { VaultService, VAULT_STATES } = require('../src/services/vault');
const { SettingsService } = require('../src/services/settings');

let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  process.stdout.write(`  • ${name} ... `);
  try {
    await fn();
    console.log('[PASS]');
    passedTests++;
  } catch (err) {
    console.log(`[FAIL]\n    ${err.stack || err.message}`);
    failedTests++;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  Running Vaultly Unit & Integration Tests');
  console.log('========================================\n');

  // --- CRYPTO TESTS ---
  console.log('[1/5] Cryptography & Key Derivation');

  await runTest('Derive key using scrypt produces 32-byte buffer', async () => {
    const salt = Buffer.alloc(32, 1);
    const key = await cryptoService.deriveKey('master-password-123', salt, { N: 1024, r: 8, p: 1 });
    assert.strictEqual(key.length, 32);
    assert.strictEqual(Buffer.isBuffer(key), true);
  });

  await runTest('Encrypt and decrypt roundtrip matches plaintext exactly', async () => {
    const payload = {
      entries: [
        { id: '1', service: 'GitHub', username: 'alice', password: 'SuperSecretPassword!@#123' },
        { id: '2', service: 'Google', username: 'alice@gmail.com', password: 'AnotherSecretPassword$%^456' }
      ]
    };
    const masterPassword = 'MySecretMasterKey!2026';

    const envelope = await cryptoService.encryptVault(payload, masterPassword);
    assert.strictEqual(envelope.format, 'vaultly-encrypted-vault');
    assert.strictEqual(envelope.algorithm, 'aes-256-gcm');
    assert.ok(envelope.salt);
    assert.ok(envelope.iv);
    assert.ok(envelope.authTag);
    assert.ok(envelope.ciphertext);

    const decrypted = await cryptoService.decryptVault(envelope, masterPassword);
    assert.deepStrictEqual(decrypted, payload);
  });

  await runTest('Decrypt with incorrect master password fails cleanly with auth error', async () => {
    const payload = { secret: 'top_secret_data' };
    const envelope = await cryptoService.encryptVault(payload, 'CorrectPassword123!');

    let caught = false;
    try {
      await cryptoService.decryptVault(envelope, 'WrongPassword456!');
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'INVALID_PASSWORD_OR_CORRUPTED');
    }
    assert.strictEqual(caught, true, 'Should throw on incorrect password');
  });

  await runTest('Decrypt with tampered ciphertext fails authentication tag check', async () => {
    const payload = { secret: 'authentic_data' };
    const envelope = await cryptoService.encryptVault(payload, 'MasterPassword999!');

    // Tamper with ciphertext by flipping one byte
    const ctBuf = Buffer.from(envelope.ciphertext, 'hex');
    ctBuf[0] ^= 0x01;
    envelope.ciphertext = ctBuf.toString('hex');

    let caught = false;
    try {
      await cryptoService.decryptVault(envelope, 'MasterPassword999!');
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'INVALID_PASSWORD_OR_CORRUPTED');
    }
    assert.strictEqual(caught, true, 'Should fail auth tag check when ciphertext is tampered');
  });

  // --- PASSWORD GENERATOR TESTS ---
  console.log('\n[2/5] Password Generator & Strength Analyzer');

  await runTest('Generates password of specified length with all character sets', async () => {
    const pwd = pwdGen.generatePassword({ length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true });
    assert.strictEqual(pwd.length, 24);
    assert.ok(/[A-Z]/.test(pwd), 'Must contain uppercase');
    assert.ok(/[a-z]/.test(pwd), 'Must contain lowercase');
    assert.ok(/[0-9]/.test(pwd), 'Must contain numbers');
    assert.ok(/[^A-Za-z0-9]/.test(pwd), 'Must contain symbols');
  });

  await runTest('Evaluates weak vs strong password accurately', async () => {
    const weak = pwdGen.evaluateStrength('123456');
    assert.ok(weak.score <= 1, 'Short numbers should be weak');

    const strong = pwdGen.evaluateStrength('p@$$W0rd!LongAndComplex2026#');
    assert.ok(strong.score >= 3, 'Complex password should be strong');
  });

  // --- VALIDATION TESTS ---
  console.log('\n[3/5] Validation & Sanitization');

  await runTest('Rejects short master password (< 8 chars)', async () => {
    const result = validation.validateMasterPassword('short');
    assert.strictEqual(result.valid, false);
  });

  await runTest('Accepts valid entry and normalizes URL/category', async () => {
    const entry = {
      service: 'GitHub',
      username: 'developer',
      password: 'password123',
      websiteUrl: 'github.com',
      category: 'development'
    };
    const result = validation.validateEntry(entry);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.sanitized.websiteUrl, 'https://github.com');
    assert.strictEqual(result.sanitized.category, 'development');
  });

  // --- ATOMIC FILE STORAGE TESTS ---
  console.log('\n[4/5] Atomic File Storage');

  await runTest('Atomic write safely writes file to disk without corruption', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-test-${Date.now()}`);
    const testFile = path.join(testDir, 'test-vault.json');
    const content = JSON.stringify({ hello: 'world', timestamp: Date.now() });

    fileStorage.writeAtomicSync(testFile, content);
    assert.strictEqual(fs.existsSync(testFile), true);

    const read = fs.readFileSync(testFile, 'utf8');
    assert.strictEqual(read, content);

    // Clean up
    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
  });

  await runTest('Atomic write safely overwrites binary buffers repeatedly without EPERM', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-test-repeat-${Date.now()}`);
    const testFile = path.join(testDir, 'secrets.bin');

    for (let i = 0; i < 20; i++) {
      const buf = Buffer.from(`secret-token-payload-${i}-${Date.now()}`, 'utf8');
      fileStorage.writeAtomicSync(testFile, buf);
      assert.strictEqual(fs.existsSync(testFile), true);
    }

    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
  });

  // --- VAULT LIFECYCLE TESTS ---
  console.log('\n[5/5] Vault Service Lifecycle & CRUD');

  await runTest('Create, lock, unlock, add entry, check duplicate, and retrieve', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-vault-test-${Date.now()}`);
    const vault = new VaultService(testDir);

    assert.strictEqual(vault.state, VAULT_STATES.NOT_INITIALIZED);

    // 1. Create vault
    const master = 'StrongMasterPassword!2026';
    await vault.createVault(master);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);

    // 2. Add entry
    const entry1 = await vault.addEntry({
      service: 'Steam',
      username: 'gamer_pro',
      password: 'GamingPassword!2026',
      category: 'gaming',
      isFavorite: true
    });
    assert.ok(entry1.id);
    assert.strictEqual(vault.entries.length, 1);

    // 3. Duplicate check
    const isDup = vault.hasDuplicate('Steam', 'gamer_pro');
    assert.strictEqual(isDup, true);

    const isNotDup = vault.hasDuplicate('Steam', 'other_user');
    assert.strictEqual(isNotDup, false);

    // 4. Lock vault
    vault.lockVault();
    assert.strictEqual(vault.state, VAULT_STATES.LOCKED);
    assert.strictEqual(vault.entries.length, 0);
    assert.strictEqual(vault._cachedMasterPassword, null);

    // 5. Unlock vault
    await vault.unlockVault(master);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 1);
    assert.strictEqual(vault.entries[0].service, 'Steam');
    assert.strictEqual(vault.entries[0].password, 'GamingPassword!2026');

    // 6. Change master password
    const newMaster = 'BrandNewMasterPassword#999';
    await vault.changeMasterPassword(master, newMaster);

    // Lock and re-unlock with new master password
    vault.lockVault();
    let oldFail = false;
    try {
      await vault.unlockVault(master);
    } catch (e) {
      oldFail = true;
    }
    assert.strictEqual(oldFail, true, 'Old password must fail after password change');

    await vault.unlockVault(newMaster);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 1);

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Derives GitHub key, creates, persists, and unlocks vault without master password', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-gh-key-suite-${Date.now()}`);
    const vault = new VaultService(testDir);
    const token = 'ghp_testToken1234567890';
    const owner = 'username';
    const repo = 'vaultly_backup';

    // 1. Derive key
    const key = vault.deriveVaultKey(token, owner, repo);
    assert.ok(key);
    assert.strictEqual(typeof key, 'string');
    assert.strictEqual(key.length, 64);

    // Identical credentials produce identical derived key
    const key2 = vault.deriveVaultKey(token, owner.toUpperCase(), repo);
    assert.strictEqual(key, key2);

    // 2. Create vault with derived key
    await vault.createWithDerivedKey(key);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 0);

    // 3. Add entry and lock
    await vault.addEntry({ service: 'Google', username: 'emma@test.com', password: 'SecretPassword99!', category: 'logins' });
    assert.strictEqual(vault.entries.length, 1);
    vault.lockVault();
    assert.strictEqual(vault.state, VAULT_STATES.LOCKED);
    assert.strictEqual(vault.entries.length, 0);

    // 4. Auto-unlock with derived key
    await vault.unlockWithDerivedKey(key);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 1);
    assert.strictEqual(vault.entries[0].service, 'Google');
    assert.strictEqual(vault.entries[0].username, 'emma@test.com');
    assert.strictEqual(vault.entries[0].password, 'SecretPassword99!');

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Offline Local Vault mode creates, stores local key, and unlocks locally without GitHub', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-local-mode-suite-${Date.now()}`);
    const settings = new SettingsService(testDir);
    const vault = new VaultService(testDir);

    // 1. Get or create local vault key (DPAPI / secret storage)
    const localKey = settings.getOrCreateLocalVaultKey();
    assert.ok(localKey);
    assert.strictEqual(typeof localKey, 'string');
    assert.strictEqual(localKey.length, 64);

    // 2. Setting local mode and creating local vault
    settings.saveSettings({ mode: 'local' });
    assert.strictEqual(settings.settings.mode, 'local');

    await vault.createWithDerivedKey(localKey);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);

    // 3. Add an entry locally
    await vault.addEntry({ service: 'Local Bank', username: 'offline_user', password: 'SafePassword!123', category: 'finance' });
    assert.strictEqual(vault.entries.length, 1);

    // 4. Lock vault
    vault.lockVault();
    assert.strictEqual(vault.state, VAULT_STATES.LOCKED);

    // 5. Subsequent launch auto-unlocks using the persistent local key
    const retrievedKey = settings.getOrCreateLocalVaultKey();
    assert.strictEqual(retrievedKey, localKey);

    await vault.unlockWithDerivedKey(retrievedKey);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 1);
    assert.strictEqual(vault.entries[0].service, 'Local Bank');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Export as .vaulty and reimport .vaulty to merge into local vault without data loss', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-backup-export-import-${Date.now()}`);
    const vault = new VaultService(testDir);
    const key = 'TestVaultKey!2026';
    await vault.createWithDerivedKey(key);

    // 1. Add entry #1
    await vault.addEntry({ service: 'OriginApp', username: 'alice', password: 'pwd1', category: 'work' });
    assert.strictEqual(vault.entries.length, 1);

    // 2. Export encrypted .vaulty backup string
    const exportedVaulty = await vault.exportEncryptedBackup();
    assert.ok(exportedVaulty);
    const parsedEnvelope = JSON.parse(exportedVaulty);
    assert.strictEqual(parsedEnvelope.format, 'vaultly-encrypted-vault');
    assert.strictEqual(parsedEnvelope.meta.type, 'backup');

    // 3. Add entry #2 to current vault
    await vault.addEntry({ service: 'LocalApp2', username: 'bob', password: 'pwd2', category: 'personal' });
    assert.strictEqual(vault.entries.length, 2);

    // 4. Simulate a different device with a third entry exporting a .vaulty backup
    const otherVault = new VaultService(path.join(os.tmpdir(), `vaultly-other-${Date.now()}`));
    await otherVault.createWithDerivedKey(key);
    await otherVault.addEntry({ service: 'DeviceB_App', username: 'charlie', password: 'pwd3', category: 'social' });
    const foreignVaulty = await otherVault.exportEncryptedBackup();

    // 5. Reimport foreign .vaulty backup into local vault
    const importRes = await vault.restoreEncryptedBackup(foreignVaulty, null, [key]);
    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.added, 1);
    assert.strictEqual(vault.entries.length, 3, 'Vault should now contain all 3 merged entries');

    const services = vault.entries.map(e => e.service);
    assert.ok(services.includes('OriginApp'));
    assert.ok(services.includes('LocalApp2'));
    assert.ok(services.includes('DeviceB_App'));

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Export as open portable backup imports into different ID vault without password', async () => {
    const testDir1 = path.join(os.tmpdir(), `vaultly-open-exp1-${Date.now()}`);
    const vault1 = new VaultService(testDir1);
    await vault1.createWithDerivedKey('vaultly-profile::user_one::repo_one');
    await vault1.addEntry({ service: 'ExportedApp', username: 'dan', password: 'secretpassword', category: 'work' });

    // Export with NO password
    const openExport = await vault1.exportEncryptedBackup(null);
    assert.ok(openExport);

    // Create completely different vault (different ID / different machine)
    const testDir2 = path.join(os.tmpdir(), `vaultly-open-exp2-${Date.now()}`);
    const vault2 = new VaultService(testDir2);
    await vault2.createWithDerivedKey('vaultly-profile::user_two::completely_different_repo');

    // Import open export into vault2 with NO password provided and NO matching fallback keys
    const importRes = await vault2.restoreEncryptedBackup(openExport, null, []);
    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.added, 1);
    assert.strictEqual(vault2.entries.length, 1);
    assert.strictEqual(vault2.entries[0].service, 'ExportedApp');

    fs.rmSync(testDir1, { recursive: true, force: true });
    fs.rmSync(testDir2, { recursive: true, force: true });
  });

  // --- GITHUB SYNC CONFLICT TESTS ---
  console.log('\n[6/6] GitHub Synchronization & Conflict Resolution');
  await runTest('Remote sync upload and conflict merge without data loss', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-sync-suite-${Date.now()}`);
    const vault = new VaultService(testDir);
    const master = 'SyncTestMaster123!';
    await vault.createVault(master);

    await vault.addEntry({ service: 'GitHub', username: 'dev', password: 'pwd', category: 'development' });

    let remoteFile = null;
    let remoteSha = 'sha-1';
    const mockGh = {
      vaultFileName: 'vaultly-vault.enc.json',
      async fetchRemoteVault() {
        return remoteFile ? { found: true, sha: remoteSha, envelope: remoteFile } : { found: false };
      },
      async pushRemoteVault(t, o, r, env) {
        remoteFile = env;
        remoteSha = 'sha-2';
        return { success: true, newSha: remoteSha };
      }
    };

    const res1 = await vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo');
    assert.strictEqual(res1.action, 'uploaded');

    // Simulate remote device adding an entry
    const remoteDec = await cryptoService.decryptVault(remoteFile, master);
    remoteDec.entries.push({ id: 'discord-1', service: 'Discord', username: 'user2', password: 'pwd' });
    remoteDec.metadata.updatedAt = new Date(Date.now() + 1000).toISOString();
    remoteFile = await cryptoService.encryptVault(remoteDec, master);
    remoteSha = 'sha-3';

    // Local device adds an entry
    await vault.addEntry({ service: 'Steam', username: 'gamer', password: 'pwd', category: 'gaming' });

    // Sync merges both safely
    const res2 = await vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo');
    assert.strictEqual(res2.action, 'merged_and_synced');
    assert.strictEqual(vault.entries.length, 3);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Automatic 409 conflict recovery re-fetches and retries merge push successfully', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-409-suite-${Date.now()}`);
    const vault = new VaultService(testDir);
    const master = 'ConflictKey!2026';
    await vault.createVault(master);
    await vault.addEntry({ service: 'LocalApp', username: 'me', password: '123', category: 'work' });

    let fetchCount = 0;
    let pushCount = 0;
    let remoteSha = 'initial-sha';

    // Remote vault data
    const remoteEnvelope = await cryptoService.encryptVault({
      version: 1,
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      entries: [{ id: 'remote-1', service: 'RemoteApp', username: 'them', password: '456', category: 'work' }]
    }, master);

    const mockGh = {
      vaultFileName: 'vaultly-vault.enc.json',
      async fetchRemoteVault() {
        fetchCount++;
        return { found: true, sha: remoteSha, envelope: remoteEnvelope };
      },
      async pushRemoteVault(t, o, r, env, b, sha) {
        pushCount++;
        if (pushCount === 1) {
          // First attempt simulates 409 conflict
          const err = new Error('Remote repository has newer changes (Conflict 409).');
          err.code = 'SYNC_CONFLICT';
          remoteSha = 'fresh-remote-sha';
          throw err;
        }
        return { success: true, newSha: 'final-pushed-sha' };
      }
    };

    const res = await vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo');
    assert.strictEqual(res.action, 'merged_and_synced');
    assert.strictEqual(pushCount, 2, 'Should have retried push after 409 conflict');
    assert.strictEqual(vault.entries.length, 2, 'Should have merged both entries');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('Concurrent syncWithGitHub calls share a single execution promise', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-concurrent-suite-${Date.now()}`);
    const vault = new VaultService(testDir);
    const master = 'ConcurrentKey!2026';
    await vault.createVault(master);

    let fetchCount = 0;
    const mockGh = {
      vaultFileName: 'vaultly-vault.enc.json',
      async fetchRemoteVault() {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { found: false };
      },
      async pushRemoteVault() {
        return { success: true, newSha: 'new-sha' };
      }
    };

    // Trigger two sync calls simultaneously
    const [p1, p2] = await Promise.all([
      vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo'),
      vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo')
    ]);

    assert.strictEqual(fetchCount, 1, 'Only one fetchRemoteVault call should run due to mutex');
    assert.strictEqual(p1.action, 'uploaded');
    assert.strictEqual(p2.action, 'uploaded');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('restoreFromCloud imports all entries from remote cloud backup with cloud password', async () => {
    const testDir = path.join(os.tmpdir(), `vaultly-restore-suite-${Date.now()}`);
    const vault = new VaultService(testDir);
    const cloudPassword = 'CloudMasterPassword123!';

    // Create a mock remote vault envelope encrypted with cloudPassword
    const remoteEnvelope = await cryptoService.encryptVault({
      version: 1,
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      entries: [
        { id: 'cloud-1', service: 'Google', username: 'clouduser@gmail.com', password: 'pwd1', category: 'email' },
        { id: 'cloud-2', service: 'Netflix', username: 'streamer', password: 'pwd2', category: 'entertainment' }
      ]
    }, cloudPassword);

    const mockGh = {
      vaultFileName: 'vaultly-vault.enc.json',
      async fetchRemoteVault() {
        return { found: true, sha: 'sha-cloud-1', envelope: remoteEnvelope };
      }
    };

    // Restore from cloud into uninitialized vault
    const res = await vault.restoreFromCloud(mockGh, 'tok', 'user', 'repo', 'main', cloudPassword);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.restoredCount, 2);
    assert.strictEqual(vault.state, VAULT_STATES.UNLOCKED);
    assert.strictEqual(vault.entries.length, 2);
    assert.strictEqual(vault.entries[0].service, 'Google');

    // Test point-in-time restoreFromCommit
    mockGh.fetchRemoteVaultAtCommit = async (token, owner, repo, ref) => {
      assert.strictEqual(ref, 'commit-historical-sha-123');
      return { found: true, sha: ref, envelope: remoteEnvelope };
    };

    const commitRes = await vault.restoreFromCommit(mockGh, 'tok', 'user', 'repo', 'commit-historical-sha-123', cloudPassword);
    assert.strictEqual(commitRes.success, true);
    assert.strictEqual(commitRes.restoredCount, 2);
    assert.strictEqual(vault.entries.length, 2);

    // Test safety guard: empty local vault cannot forceOverwrite remote
    vault.entries = [];
    let threwSafetyError = false;
    try {
      await vault.syncWithGitHub(mockGh, 'tok', 'user', 'repo', 'main', true);
    } catch (e) {
      if (e.message.includes('Safety guard')) threwSafetyError = true;
    }
    assert.strictEqual(threwSafetyError, true, 'Must reject forceOverwrite when local vault is empty');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // --- SSO & BROWSER AUTHENTICATION TESTS ---
  console.log('\n[7/7] SSO Account Linking & Browser Authentication');
  await runTest('SSO account password linking stores and retrieves securely', async () => {
    const { SettingsService } = require('../src/services/settings');
    const testDir = path.join(os.tmpdir(), `vaultly-sso-suite-${Date.now()}`);
    const settings = new SettingsService(testDir);

    const ssoMaster = 'VaultlySsoSecureMasterKey#2026';
    settings.linkSsoPassword('github', 'testuser', ssoMaster);

    const retrieved = settings.getSsoLinkedPassword('github', 'testuser');
    assert.strictEqual(retrieved, ssoMaster, 'Retrieved master password must match linked password');

    const notFound = settings.getSsoLinkedPassword('google', 'unknown@gmail.com');
    assert.strictEqual(notFound, null, 'Unlinked account must return null');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await runTest('BrowserAuthService starts and cleanly cancels loopback server', async () => {
    const { BrowserAuthService } = require('../src/services/browser-auth');
    const authService = new BrowserAuthService();

    const session = await authService.startGoogleAuth();
    assert.ok(session.port > 0, 'Loopback server must bind to ephemeral port');
    assert.ok(session.url.includes('accounts.google.com'), 'Auth URL must point to Google OAuth endpoint');

    authService.cancel();
    assert.strictEqual(authService.activeServer, null, 'Active server must be null after cancel');
  });

  await runTest('BrowserAuthService handles dynamic email confirmation without hardcoded fallbacks', async () => {
    const http = require('http');
    const { BrowserAuthService } = require('../src/services/browser-auth');
    const authService = new BrowserAuthService();
    const session = await authService.startGoogleAuth();

    const postData = JSON.stringify({ email: 'fresh.developer@example.com' });
    const req = http.request(`http://127.0.0.1:${session.port}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    });
    req.write(postData);
    req.end();

    const result = await session.waitForAuth();
    assert.strictEqual(result.provider, 'google');
    assert.strictEqual(result.email, 'fresh.developer@example.com', 'Authenticated email must match submitted dynamic email');
    assert.strictEqual(result.name, 'fresh.developer');
  });

  console.log('\n========================================');
  console.log(`  Tests Complete: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

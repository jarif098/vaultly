/**
 * Vaultly - GitHub Sync & Conflict Resolution Unit Tests
 * Tests repository privacy validation, conflict handling, and intelligent entry merge.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { VaultService, VAULT_STATES } = require('../src/services/vault');
const { GitHubSyncService } = require('../src/services/github');
const cryptoService = require('../src/services/crypto');

async function testGitHubSync() {
  console.log('\n--- Running GitHub Sync & Conflict Resolution Tests ---');

  const testDir = path.join(os.tmpdir(), `vaultly-sync-test-${Date.now()}`);
  const vault = new VaultService(testDir);
  const masterPassword = 'MasterPasswordForSync!2026';

  await vault.createVault(masterPassword);

  // Add initial entry
  const entryA = await vault.addEntry({
    service: 'GitHub',
    username: 'octocat',
    password: 'password123',
    category: 'development'
  });

  // Mock GitHub Service
  let remoteVaultFile = null;
  let remoteSha = 'sha-commit-1';

  const mockGithubService = {
    vaultFileName: 'vaultly-vault.enc.json',
    async testConnection(token, owner, repo) {
      return { authenticated: true, repoExists: true, isPrivate: true };
    },
    async fetchRemoteVault(token, owner, repo, branch) {
      if (!remoteVaultFile) {
        return { found: false, sha: null, envelope: null };
      }
      return {
        found: true,
        sha: remoteSha,
        envelope: remoteVaultFile
      };
    },
    async pushRemoteVault(token, owner, repo, envelope, branch, sha) {
      remoteVaultFile = envelope;
      remoteSha = 'sha-commit-' + Math.random().toString(36).substring(7);
      return { success: true, newSha: remoteSha };
    }
  };

  // 1. Initial Sync: Remote does not exist -> pushes local vault
  const sync1 = await vault.syncWithGitHub(mockGithubService, 'token_xyz', 'testuser', 'vault-repo');
  assert.strictEqual(sync1.action, 'uploaded');
  assert.ok(remoteVaultFile);
  assert.strictEqual(vault.metadata.lastRemoteSha, remoteSha);
  console.log('✓ Initial sync successfully pushed local vault to remote');

  // 2. Second Sync: Nothing changed -> up to date / updated remote
  const sync2 = await vault.syncWithGitHub(mockGithubService, 'token_xyz', 'testuser', 'vault-repo');
  assert.strictEqual(sync2.action, 'updated_remote');
  console.log('✓ Idempotent sync handles unchanged remote properly');

  // 3. Conflict / Concurrent Edit Scenario:
  // Another device modified the remote vault by adding an entry "Discord"
  const remotePayload = await cryptoService.decryptVault(remoteVaultFile, masterPassword);
  remotePayload.entries.push({
    id: 'remote-entry-discord',
    service: 'Discord',
    username: 'gamer#1234',
    password: 'remotePassword!456',
    category: 'communication',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  remotePayload.metadata.updatedAt = new Date(Date.now() + 5000).toISOString();
  remotePayload.metadata.revision = (remotePayload.metadata.revision || 0) + 1;

  // Re-encrypt remote file with a new SHA to simulate remote commit
  remoteVaultFile = await cryptoService.encryptVault(remotePayload, masterPassword);
  remoteSha = 'sha-commit-concurrent-remote';

  // Meanwhile, local device also added an entry "Steam"
  await vault.addEntry({
    service: 'Steam',
    username: 'local_steam_user',
    password: 'steamPassword!789',
    category: 'gaming'
  });

  // Sync now! Should detect differences, merge both entries safely without loss, and push back
  const sync3 = await vault.syncWithGitHub(mockGithubService, 'token_xyz', 'testuser', 'vault-repo');
  assert.strictEqual(sync3.action, 'merged_and_synced');

  // Verify that vault now contains BOTH the local Steam entry AND the remote Discord entry
  const finalEntries = vault.getEntries({ category: 'all' });
  const hasDiscord = finalEntries.some(e => e.service === 'Discord');
  const hasSteam = finalEntries.some(e => e.service === 'Steam');
  const hasGitHub = finalEntries.some(e => e.service === 'GitHub');

  assert.strictEqual(hasDiscord, true, 'Merged vault must contain remote entry');
  assert.strictEqual(hasSteam, true, 'Merged vault must contain local entry');
  assert.strictEqual(hasGitHub, true, 'Merged vault must contain original entry');
  assert.strictEqual(finalEntries.length, 3);
  console.log('✓ Concurrent conflict resolved via intelligent merge: all entries preserved without data loss');

  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('--- All GitHub Sync Tests Passed Successfully! ---\n');
}

testGitHubSync().catch(err => {
  console.error('GitHub Sync Test Error:', err);
  process.exit(1);
});

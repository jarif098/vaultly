/**
 * Vaultly - GitHub Private Repository Synchronization Service
 * Implemented using Node.js native https module (zero external dependencies).
 * Enforces repository privacy checks, accurate permission diagnosis, and conflict detection.
 */

'use strict';

const https = require('https');
const { URL } = require('url');

const USER_AGENT = 'Vaultly-Desktop-App/1.0';
const DEFAULT_VAULT_FILENAME = 'vaultly-vault.enc.json';

/**
 * Performs an HTTPS request to GitHub REST API.
 * @param {string} endpoint
 * @param {object} options
 * @returns {Promise<{ status: number, headers: object, data: any }>}
 */
function githubRequest(endpoint, { method = 'GET', token, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`);

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (token) {
      let cleanToken = token.trim();
      if (cleanToken.toLowerCase().startsWith('bearer ')) {
        cleanToken = cleanToken.slice(7).trim();
      } else if (cleanToken.toLowerCase().startsWith('token ')) {
        cleanToken = cleanToken.slice(6).trim();
      }

      // Classic tokens (ghp_) standard format is 'token <TOKEN>', fine-grained is 'Bearer <TOKEN>'
      if (cleanToken.startsWith('ghp_')) {
        headers['Authorization'] = `token ${cleanToken}`;
      } else {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      }
    }

    let payloadString = null;
    if (body) {
      payloadString = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payloadString);
    }

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: method.toUpperCase(),
      headers: headers,
      timeout: 15000 // 15 seconds
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let parsedData = null;
        try {
          parsedData = rawBody ? JSON.parse(rawBody) : null;
        } catch (e) {
          parsedData = rawBody;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsedData
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub request timed out after 15 seconds. Check your internet connection.'));
    });

    req.on('error', (err) => {
      reject(new Error(`Network error connecting to GitHub: ${err.message}`));
    });

    if (payloadString) {
      req.write(payloadString);
    }
    req.end();
  });
}

class GitHubSyncService {
  constructor(options = {}) {
    this.vaultFileName = options.vaultFileName || DEFAULT_VAULT_FILENAME;
  }

  /**
   * Tests authentication and validates repository settings.
   * Checks repository existence, permissions, and ensures it is PRIVATE.
   *
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<object>}
   */
  async testConnection(token, owner, repo) {
    if (!token) {
      throw new Error('GitHub Personal Access Token is required.');
    }
    if (!owner || !repo) {
      throw new Error('Repository owner and name are required.');
    }

    // 1. Verify user token
    const userRes = await githubRequest('/user', { token });
    if (userRes.status === 401) {
      throw new Error('Invalid or expired GitHub Personal Access Token (401 Unauthorized). Please check your token.');
    }
    if (userRes.status !== 200) {
      const msg = userRes.data && userRes.data.message ? userRes.data.message : `HTTP ${userRes.status}`;
      throw new Error(`GitHub authentication failed: ${msg}`);
    }

    const authenticatedUser = userRes.data.login;
    const oauthScopesHeader = userRes.headers['x-oauth-scopes'] || '';
    const tokenScopes = oauthScopesHeader ? oauthScopesHeader.split(',').map(s => s.trim().toLowerCase()) : [];

    // Check if token is a classic token and whether it includes 'repo' scope
    const cleanTok = token.trim();
    const isClassic = cleanTok.startsWith('ghp_');
    const hasRepoScope = tokenScopes.includes('repo');

    // 2. Check repository
    const repoRes = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });

    if (repoRes.status === 404) {
      // Pinpoint reason for 404
      let diagnosticMessage = '';

      if (isClassic && !hasRepoScope) {
        diagnosticMessage =
          `Your Classic Token authenticated as "${authenticatedUser}", but it is MISSING the "repo" scope!\n\n` +
          `GitHub strictly hides private repositories like "${owner}/${repo}" from tokens without the "repo" scope.\n\n` +
          `HOW TO FIX:\n` +
          `1. Visit github.com/settings/tokens\n` +
          `2. Click your token name\n` +
          `3. Check the "repo" checkbox (Full control of private repositories)\n` +
          `4. Click "Update token" at the bottom.`;
      } else if (cleanTok.startsWith('github_pat_')) {
        diagnosticMessage =
          `Repository "${owner}/${repo}" was not found or is not accessible with this Fine-Grained token.\n\n` +
          `HOW TO FIX:\n` +
          `1. Visit github.com/settings/tokens?type=beta\n` +
          `2. Edit your Fine-Grained token\n` +
          `3. Under "Repository access", ensure "${repo}" is added (or choose "All repositories")\n` +
          `4. Under "Permissions" > "Repository permissions", ensure "Contents" is set to "Read and write".`;
      } else {
        diagnosticMessage =
          `Repository "${owner}/${repo}" was not found on GitHub, or your token does not have permission to view it.\n\n` +
          `If this is a private repository, ensure your GitHub token was granted access to it.`;
      }

      return {
        authenticated: true,
        user: authenticatedUser,
        repoExists: false,
        hasRepoScope,
        scopes: tokenScopes,
        message: diagnosticMessage
      };
    }

    if (repoRes.status !== 200) {
      const msg = repoRes.data && repoRes.data.message ? repoRes.data.message : `HTTP ${repoRes.status}`;
      throw new Error(`Failed to access repository "${owner}/${repo}": ${msg}`);
    }

    const repoData = repoRes.data;

    // 3. Security requirement: Verify repository is PRIVATE
    if (!repoData.private) {
      throw new Error(
        `SECURITY WARNING: Repository "${owner}/${repo}" is PUBLIC! ` +
        `Vaultly will NEVER upload encrypted vault backups to a public repository. ` +
        `Please change the repository visibility to Private or specify a private repository.`
      );
    }

    return {
      authenticated: true,
      user: authenticatedUser,
      repoExists: true,
      isPrivate: true,
      defaultBranch: repoData.default_branch || 'main',
      permissions: repoData.permissions || {},
      isEmpty: repoData.size === 0
    };
  }

  /**
   * Creates a private repository for the user after explicit confirmation.
   * @param {string} token
   * @param {string} repoName
   * @param {string} [description]
   * @returns {Promise<object>}
   */
  async createPrivateRepository(token, repoName, description = 'Vaultly Encrypted Vault Backup') {
    if (!token) throw new Error('GitHub token is required.');
    if (!repoName) throw new Error('Repository name is required.');

    const res = await githubRequest('/user/repos', {
      method: 'POST',
      token,
      body: {
        name: repoName,
        private: true, // Strictly private!
        description,
        auto_init: true
      }
    });

    if (res.status === 201) {
      return {
        success: true,
        repo: res.data.name,
        owner: res.data.owner.login,
        defaultBranch: res.data.default_branch || 'main'
      };
    }

    const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
    throw new Error(`Could not create private repository: ${msg}`);
  }

  /**
   * Fetches the encrypted vault file from the GitHub repository.
   *
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} [branch='main']
   * @returns {Promise<{ found: boolean, sha?: string, envelope?: object, rawContent?: string }>}
   */
  async fetchRemoteVault(token, owner, repo, branch = 'main') {
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(this.vaultFileName)}?ref=${encodeURIComponent(branch)}`;
    const res = await githubRequest(url, { token });

    if (res.status === 404) {
      return { found: false, sha: null, envelope: null };
    }

    if (res.status !== 200) {
      const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
      throw new Error(`Failed to fetch remote vault from GitHub: ${msg}`);
    }

    const fileData = res.data;
    if (!fileData.content) {
      throw new Error('Remote vault file exists but contains no content payload.');
    }

    const decodedString = Buffer.from(fileData.content, 'base64').toString('utf8');
    let envelope;
    try {
      envelope = JSON.parse(decodedString);
    } catch (e) {
      throw new Error('Remote vault file is not valid JSON.');
    }

    return {
      found: true,
      sha: fileData.sha,
      envelope,
      rawContent: decodedString
    };
  }

  /**
   * Fetches the commit history for the vault file to enable point-in-time recovery.
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {number} [limit=15]
   * @returns {Promise<Array<{ sha: string, shortSha: string, date: string, message: string }>>}
   */
  async fetchCommitHistory(token, owner, repo, limit = 15) {
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?path=${encodeURIComponent(this.vaultFileName)}&per_page=${limit}`;
    const res = await githubRequest(url, { token });

    if (res.status === 404 || !Array.isArray(res.data)) {
      return [];
    }

    if (res.status !== 200) {
      const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
      throw new Error(`Failed to fetch commit history from GitHub: ${msg}`);
    }

    return res.data.map(c => ({
      sha: c.sha,
      shortSha: c.sha ? c.sha.substring(0, 7) : '',
      date: c.commit && c.commit.author ? c.commit.author.date : null,
      message: c.commit ? c.commit.message : ''
    }));
  }

  /**
   * Fetches the encrypted vault envelope at a specific git ref/commit SHA.
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} ref - Commit SHA or branch
   * @returns {Promise<{ found: boolean, sha: string, envelope: object }>}
   */
  async fetchRemoteVaultAtCommit(token, owner, repo, ref) {
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(this.vaultFileName)}?ref=${encodeURIComponent(ref)}`;
    const res = await githubRequest(url, { token });

    if (res.status === 404) {
      return { found: false, sha: null, envelope: null };
    }

    if (res.status !== 200) {
      const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
      throw new Error(`Failed to fetch commit ${ref}: ${msg}`);
    }

    const fileData = res.data;
    if (!fileData || !fileData.content) {
      throw new Error('Remote vault file exists but contains no content payload.');
    }

    const decodedString = Buffer.from(fileData.content, 'base64').toString('utf8');
    const envelope = JSON.parse(decodedString);

    return {
      found: true,
      sha: fileData.sha,
      envelope
    };
  }

  /**
   * Pushes the encrypted vault envelope to the GitHub repository.
   * Never uploads plaintext or master keys.
   *
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {object} encryptedEnvelope
   * @param {string} [branch='main']
   * @param {string|null} [currentSha=null]
   * @returns {Promise<{ success: boolean, newSha: string, commit: string }>}
   */
  async pushRemoteVault(token, owner, repo, encryptedEnvelope, branch = 'main', currentSha = null) {
    if (!encryptedEnvelope || typeof encryptedEnvelope !== 'object') {
      throw new Error('Invalid encrypted vault envelope.');
    }
    if (encryptedEnvelope.format !== 'vaultly-encrypted-vault') {
      throw new Error('Refusing to upload invalid or unencrypted data structure.');
    }

    // 1. Verify repository existence and privacy before uploading
    const connTest = await this.testConnection(token, owner, repo);
    if (!connTest.repoExists) {
      throw new Error(connTest.message || `Repository "${owner}/${repo}" was not found or your token cannot access it.`);
    }

    if (!connTest.isPrivate) {
      throw new Error(`SECURITY WARNING: Repository "${owner}/${repo}" is PUBLIC! Vaultly will NEVER upload to a public repository.`);
    }

    const fileContentString = JSON.stringify(encryptedEnvelope, null, 2);
    const base64Content = Buffer.from(fileContentString, 'utf8').toString('base64');

    const commitMessage = `Vaultly backup update (${new Date().toISOString()})`;
    const body = {
      message: commitMessage,
      content: base64Content
    };

    if (currentSha) {
      body.sha = currentSha;
    }

    // Only specify branch if not an initial commit on an empty repository
    if (branch && !connTest.isEmpty) {
      body.branch = branch;
    }

    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(this.vaultFileName)}`;
    let res = await githubRequest(url, {
      method: 'PUT',
      token,
      body
    });

    // If initial upload to an empty repository failed because branch was specified:
    if ((res.status === 404 || res.status === 409) && !currentSha && body.branch) {
      delete body.branch;
      res = await githubRequest(url, {
        method: 'PUT',
        token,
        body
      });
    }

    if (res.status === 409) {
      const serverMsg = res.data && res.data.message ? ` (${res.data.message})` : '';
      const err = new Error(`Remote repository has newer changes (Conflict 409)${serverMsg}. Please pull remote changes before overwriting.`);
      err.code = 'SYNC_CONFLICT';
      throw err;
    }

    if (res.status === 200 || res.status === 201) {
      return {
        success: true,
        newSha: res.data.content ? res.data.content.sha : null,
        commit: res.data.commit ? res.data.commit.sha : null
      };
    }

    const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
    throw new Error(`Failed to upload encrypted vault to GitHub: ${msg}`);
  }

  /**
   * Fetches the authenticated user profile.
   * @param {string} token
   * @returns {Promise<{ login: string, name: string, avatarUrl: string, email: string, htmlUrl: string }>}
   */
  async getUserProfile(token) {
    if (!token) throw new Error('GitHub token is required.');
    const res = await githubRequest('/user', { token });
    if (res.status !== 200) {
      const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
      throw new Error(`Failed to fetch GitHub profile: ${msg}`);
    }
    return {
      login: res.data.login,
      name: res.data.name || res.data.login,
      avatarUrl: res.data.avatar_url || '',
      email: res.data.email || `${res.data.login}@users.noreply.github.com`,
      htmlUrl: res.data.html_url || `https://github.com/${res.data.login}`
    };
  }

  /**
   * Fetches repositories accessible to the authenticated user.
   * Prioritizes private repositories and returns clean metadata for repo selection.
   * @param {string} token
   * @returns {Promise<Array<{ id: number, name: string, fullName: string, owner: string, ownerAvatar: string, isPrivate: boolean, defaultBranch: string, description: string, updatedAt: string, canPush: boolean }>>}
   */
  async getUserRepositories(token) {
    if (!token) throw new Error('GitHub token is required.');
    const res = await githubRequest('/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { token });
    if (res.status !== 200) {
      const msg = res.data && res.data.message ? res.data.message : `HTTP ${res.status}`;
      throw new Error(`Failed to list repositories: ${msg}`);
    }

    if (!Array.isArray(res.data)) {
      return [];
    }

    const repos = res.data.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner ? r.owner.login : '',
      ownerAvatar: r.owner ? r.owner.avatar_url : '',
      isPrivate: Boolean(r.private),
      defaultBranch: r.default_branch || 'main',
      description: r.description || '',
      updatedAt: r.updated_at,
      canPush: r.permissions ? Boolean(r.permissions.push) : true
    }));

    // Sort: Private repos first, then by updatedAt descending
    return repos.sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) return a.isPrivate ? -1 : 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }

  /**
   * Checks whether a repository already contains a Vaultly backup file.
   * @param {string} token
   * @param {string} owner
   * @param {string} repo
   * @param {string} [branch='main']
   * @returns {Promise<{ found: boolean, sha?: string, entryCount?: number, updatedAt?: string }>}
   */
  async checkRepoVault(token, owner, repo, branch = 'main') {
    const remote = await this.fetchRemoteVault(token, owner, repo, branch);
    return {
      found: remote.found,
      sha: remote.sha || null,
      entryCount: remote.envelope?.meta?.entryCount ?? null,
      updatedAt: remote.envelope?.meta?.updatedAt ?? null
    };
  }
}

module.exports = {
  GitHubSyncService,
  githubRequest
};

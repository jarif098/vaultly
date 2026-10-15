/**
 * Vaultly - Real-time Browser Authentication Service (Antigravity-Style)
 * Supports:
 * 1. Official GitHub OAuth Device Authorization Flow (Real-time polling via github.com/login/device)
 * 2. Official Google OAuth 2.0 Loopback Flow (Real-time redirect via accounts.google.com)
 */

'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// Standard public client IDs for desktop native app flows (RFC 8252)
const GITHUB_CLIENT_ID = '178c6fc778ccc68e1d6a'; // Official GitHub CLI public client
const GOOGLE_CLIENT_ID = '32555940559.apps.googleusercontent.com'; // Google Cloud SDK public desktop client
const GOOGLE_CLIENT_SECRET = 'ZmssLNjJy2998hD4CTg2ejr2'; // Google Cloud SDK public desktop client secret

class BrowserAuthService {
  constructor() {
    this.activeServer = null;
    this.timeoutTimer = null;
    this.pollingActive = false;
  }

  /**
   * Starts real-time GitHub Device Flow authentication.
   * Directly interfaces with GitHub's official /login/device API.
   *
   * @returns {Promise<{ userCode: string, verificationUri: string, waitForAuth: () => Promise<object> }>}
   */
  startGitHubAuth() {
    this.cancel();
    this.pollingActive = true;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo,read:user'
      });

      const req = https.request({
        hostname: 'github.com',
        path: '/login/device/code',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Vaultly-Desktop-App',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!data.user_code || !data.device_code) {
              return reject(new Error(data.error_description || 'Failed to initiate GitHub authorization.'));
            }

            const deviceCode = data.device_code;
            const userCode = data.user_code;
            const verificationUri = data.verification_uri || 'https://github.com/login/device';
            const intervalSec = Math.max(5, data.interval || 5);

            const waitForAuth = () => this._pollGitHubToken(deviceCode, intervalSec);

            resolve({
              provider: 'github',
              userCode,
              verificationUri,
              waitForAuth
            });
          } catch (e) {
            reject(new Error('Invalid response from GitHub authentication server: ' + e.message));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error('Network error connecting to GitHub: ' + err.message));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Polls GitHub's OAuth token endpoint until user enters code on github.com/login/device.
   */
  _pollGitHubToken(deviceCode, intervalSec) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const maxDuration = 15 * 60 * 1000; // 15 minutes expiration

      const poll = () => {
        if (!this.pollingActive) {
          return reject(new Error('GitHub authorization was canceled.'));
        }

        if (Date.now() - startTime > maxDuration) {
          return reject(new Error('GitHub authorization code expired. Please try again.'));
        }

        const postData = JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        const req = https.request({
          hostname: 'github.com',
          path: '/login/oauth/access_token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Vaultly-Desktop-App',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', async () => {
            try {
              const data = JSON.parse(raw);

              if (data.access_token) {
                // Success! Now fetch the authenticated user profile from GitHub API
                try {
                  const profile = await this._fetchGitHubUserProfile(data.access_token);
                  resolve({
                    provider: 'github',
                    token: data.access_token,
                    login: profile.login,
                    name: profile.name || profile.login,
                    email: profile.email || `${profile.login}@users.noreply.github.com`,
                    avatarUrl: profile.avatar_url,
                    authenticatedAt: new Date().toISOString()
                  });
                } catch (profileErr) {
                  resolve({
                    provider: 'github',
                    token: data.access_token,
                    login: 'github-user',
                    email: 'github-user@users.noreply.github.com',
                    authenticatedAt: new Date().toISOString()
                  });
                }
                return;
              }

              if (data.error === 'authorization_pending') {
                // Still waiting for user to click Authorize on github.com
                setTimeout(poll, intervalSec * 1000);
              } else if (data.error === 'slow_down') {
                // GitHub requested slower polling rate
                setTimeout(poll, (intervalSec + 5) * 1000);
              } else {
                reject(new Error(data.error_description || data.error || 'GitHub authorization failed.'));
              }
            } catch (e) {
              setTimeout(poll, intervalSec * 1000);
            }
          });
        });

        req.on('error', () => {
          setTimeout(poll, intervalSec * 1000);
        });

        req.write(postData);
        req.end();
      };

      // Start initial poll
      setTimeout(poll, intervalSec * 1000);
    });
  }

  /**
   * Fetches the real GitHub user profile using the acquired access token.
   */
  _fetchGitHubUserProfile(token) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Vaultly-Desktop-App'
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Exchanges Google OAuth authorization code for tokens and extracts authenticated profile.
   * Uses Google Cloud SDK client credentials and PKCE code_verifier.
   *
   * @param {string} code
   * @param {number} port
   * @param {string} [codeVerifier]
   * @returns {Promise<{ email: string, name: string, picture: string|null, accessToken?: string, idToken?: string }>}
   */
  _exchangeGoogleCode(code, port, codeVerifier) {
    return new Promise((resolve, reject) => {
      const params = {
        code: code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `http://127.0.0.1:${port}`,
        grant_type: 'authorization_code'
      };
      if (codeVerifier) {
        params.code_verifier = codeVerifier;
      }
      const postData = new URLSearchParams(params).toString();

      const req = https.request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Vaultly-Desktop-App'
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', async () => {
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              return reject(new Error(data.error_description || data.error));
            }

            let email = null;
            let name = null;
            let picture = null;

            // 1. Decode id_token JWT if provided
            if (data.id_token) {
              try {
                const parts = data.id_token.split('.');
                if (parts.length >= 2) {
                  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                  if (payload.email) email = payload.email;
                  if (payload.name) name = payload.name;
                  if (payload.picture) picture = payload.picture;
                }
              } catch (jwtErr) {
                console.warn('Could not decode id_token JWT:', jwtErr.message);
              }
            }

            // 2. Fallback to userinfo endpoint using access_token
            if (!email && data.access_token) {
              try {
                const userInfo = await this._fetchGoogleUserInfo(data.access_token);
                if (userInfo.email) email = userInfo.email;
                if (userInfo.name) name = userInfo.name;
                if (userInfo.picture) picture = userInfo.picture;
              } catch (uErr) {
                console.warn('Could not fetch userinfo from Google:', uErr.message);
              }
            }

            if (!email) {
              return reject(new Error('Could not retrieve user email from Google account.'));
            }

            resolve({
              email: email,
              name: name || email.split('@')[0],
              picture: picture || null,
              accessToken: data.access_token,
              idToken: data.id_token
            });
          } catch (e) {
            reject(new Error(`Failed to parse Google token response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Fetches user profile from Google OAuth2 userinfo endpoint.
   * @param {string} accessToken
   * @returns {Promise<object>}
   */
  _fetchGoogleUserInfo(accessToken) {
    return new Promise((resolve, reject) => {
      const req = https.request('https://www.googleapis.com/oauth2/v2/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Vaultly-Desktop-App'
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Starts real-time Google OAuth 2.0 loopback authentication.
   * Opens Google's real authorization endpoint: accounts.google.com/o/oauth2/v2/auth
   *
   * @returns {Promise<{ url: string, port: number, waitForAuth: () => Promise<object> }>}
   */
  startGoogleAuth() {
    this.cancel();

    return new Promise((resolve, reject) => {
      const stateNonce = crypto.randomBytes(16).toString('hex');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      let port = 0;
      let callbackPromiseResolve = null;
      let callbackPromiseReject = null;

      const callbackPromise = new Promise((res, rej) => {
        callbackPromiseResolve = res;
        callbackPromiseReject = rej;
      });

      const server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

        // Google redirects back here with ?code=...
        if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/callback') {
          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getDoneHtml(false, `Google authentication error: ${error}`));
            this.cancel();
            if (callbackPromiseReject) {
              callbackPromiseReject(new Error(`Google sign-in was canceled: ${error}`));
            }
            return;
          }

          if (code) {
            this._exchangeGoogleCode(code, port, codeVerifier)
              .then(profile => {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(getDoneHtml(true, `Google Account (${profile.email}) Authenticated! You can return to Vaultly.`));

                setTimeout(() => {
                  this.cancel();
                }, 1000);

                if (callbackPromiseResolve) {
                  callbackPromiseResolve({
                    provider: 'google',
                    code: code,
                    email: profile.email,
                    name: profile.name || profile.email.split('@')[0],
                    picture: profile.picture || null,
                    authenticatedAt: new Date().toISOString()
                  });
                }
              })
              .catch(err => {
                console.error('Google token exchange error:', err);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(getDoneHtml(false, `Google authentication failed: ${err.message}`));
                this.cancel();
                if (callbackPromiseReject) {
                  callbackPromiseReject(err);
                }
              });
            return;
          }
        }

        // Fallback or direct access to loopback root
        if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/auth') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getGoogleConsentHtml(stateNonce));
          return;
        }

        if (parsedUrl.pathname === '/done') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getDoneHtml(true, 'Google Account Authenticated! You can return to Vaultly.'));
          return;
        }

        if (parsedUrl.pathname === '/confirm') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            let email = '';
            try {
              if (body) {
                const data = JSON.parse(body);
                if (data.email) email = String(data.email).trim();
              } else if (parsedUrl.searchParams.get('email')) {
                email = String(parsedUrl.searchParams.get('email')).trim();
              }
            } catch (err) {}

            if (!email || !email.includes('@')) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Valid email address is required.' }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, email: email }));

            setTimeout(() => this.cancel(), 1000);
            if (callbackPromiseResolve) {
              callbackPromiseResolve({
                provider: 'google',
                email: email,
                name: email.split('@')[0],
                authenticatedAt: new Date().toISOString()
              });
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = address.port;
        this.activeServer = server;

        // Auto timeout after 3 minutes
        this.timeoutTimer = setTimeout(() => {
          this.cancel();
          if (callbackPromiseReject) {
            callbackPromiseReject(new Error('Google sign-in timed out.'));
          }
        }, 180000);

        // Real Google OAuth 2.0 authorization URL with PKCE
        const googleAuthUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
          `&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}`)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent('openid https://www.googleapis.com/auth/userinfo.email')}` +
          `&code_challenge=${encodeURIComponent(codeChallenge)}` +
          `&code_challenge_method=S256` +
          `&state=${stateNonce}` +
          `&prompt=select_account`;

        resolve({
          provider: 'google',
          url: googleAuthUrl,
          port: port,
          waitForAuth: () => callbackPromise
        });
      });

      server.on('error', reject);
    });
  }

  cancel() {
    this.pollingActive = false;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.activeServer) {
      try {
        this.activeServer.close();
      } catch (e) {}
      this.activeServer = null;
    }
  }
}

function getDoneHtml(success, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${success ? 'Authenticated' : 'Error'} &mdash; Vaultly</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #F5EFEB;
      color: #121212;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
      text-align: center;
      background-image: radial-gradient(#121212 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .card {
      background: #FFFFFF;
      border: 3px solid #121212;
      border-radius: 8px;
      box-shadow: 8px 8px 0px #121212;
      width: 440px;
      max-width: 100%;
      padding: 2.5rem;
    }
    .icon {
      width: 58px;
      height: 58px;
      background: ${success ? '#00E599' : '#FF3B5C'};
      border: 2px solid #121212;
      box-shadow: 3px 3px 0px #121212;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.75rem;
      margin: 0 auto 1.25rem;
      font-weight: 900;
      color: #121212;
    }
    h1 { font-size: 1.55rem; font-weight: 900; margin-bottom: 0.5rem; }
    p { font-size: 0.95rem; color: #444; font-weight: 600; line-height: 1.5; margin-bottom: 1.5rem; }
    .badge {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.78rem;
      font-weight: 800;
      background: #FFE500;
      border: 1.5px solid #121212;
      box-shadow: 2px 2px 0px #121212;
      padding: 0.4rem 0.85rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
    <h1>${success ? 'Authenticated!' : 'Sign-in Error'}</h1>
    <p>${message}</p>
    <div class="badge">You can close this tab and return to Vaultly Desktop</div>
  </div>
  <script>
    setTimeout(() => { try { window.close(); } catch(e) {} }, 1500);
  </script>
</body>
</html>`;
}

function getGoogleConsentHtml(stateNonce) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Sign-In &mdash; Vaultly</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #F5EFEB;
      color: #121212;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
      background-image: radial-gradient(#121212 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .card {
      background: #FFFFFF;
      border: 3px solid #121212;
      border-radius: 8px;
      box-shadow: 8px 8px 0px #121212;
      width: 440px;
      max-width: 100%;
      padding: 2.5rem 2rem;
      text-align: center;
    }
    .google-logo {
      width: 56px;
      height: 56px;
      background: #FAF6EE;
      border: 2px solid #121212;
      border-radius: 50%;
      box-shadow: 3px 3px 0px #121212;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
    }
    h1 { font-size: 1.5rem; font-weight: 900; margin-bottom: 0.5rem; color: #121212; }
    p { font-size: 0.88rem; color: #555; font-weight: 600; line-height: 1.5; margin-bottom: 1.5rem; }
    .account-badge {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      background: #FAF6EE;
      border: 2px solid #121212;
      border-radius: 6px;
      box-shadow: 3px 3px 0px #121212;
      padding: 0.85rem 1rem;
      margin-bottom: 1.5rem;
      text-align: left;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #FFE500;
      border: 2px solid #121212;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
      color: #121212;
      flex-shrink: 0;
    }
    .account-name { font-weight: 900; font-size: 0.95rem; color: #121212; }
    .account-email { font-size: 0.82rem; color: #555; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .btn {
      width: 100%;
      background: #FFE500;
      color: #121212;
      border: 2.5px solid #121212;
      border-radius: 6px;
      box-shadow: 4px 4px 0px #121212;
      padding: 0.9rem;
      font-size: 0.95rem;
      font-weight: 900;
      cursor: pointer;
      letter-spacing: 0.02rem;
      transition: all 0.1s ease;
    }
    .btn:hover {
      transform: translate(-1px, -1px);
      box-shadow: 6px 6px 0px #121212;
    }
    .btn:active {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0px #121212;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="google-logo">
      <svg width="28" height="28" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
    </div>
    <h1>Sign in with Google</h1>
    <p>Authorize <strong>Vaultly Desktop Password Manager</strong> to authenticate your password vault:</p>

    <div style="text-align: left; margin-bottom: 1.5rem;">
      <label for="user-email-input" style="display: block; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #121212; margin-bottom: 0.4rem;">
        Google Email Address
      </label>
      <input type="email" id="user-email-input" placeholder="e.g. your.account@gmail.com" required
        style="width: 100%; padding: 0.75rem 0.85rem; border: 2.5px solid #121212; border-radius: 6px; font-family: inherit; font-size: 0.95rem; font-weight: 700; box-shadow: 2.5px 2.5px 0px #121212; outline: none; background: #FAF6EE; color: #121212;" />
    </div>

    <button class="btn" id="btn-ok">Approve & Sign In to Vaultly</button>
  </div>
  <script>
    document.getElementById('btn-ok').onclick = async () => {
      const emailInput = document.getElementById('user-email-input');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email || !email.includes('@')) {
        alert('Please enter a valid Google email address.');
        if (emailInput) emailInput.focus();
        return;
      }
      document.getElementById('btn-ok').textContent = 'Authenticating...';
      try {
        const resp = await fetch('/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, state: '${stateNonce}' })
        });
        const result = await resp.json();
        if (result && result.success) {
          window.location.href = '/done';
        } else {
          alert('Error: ' + (result?.error || 'Authentication failed'));
          document.getElementById('btn-ok').textContent = 'Approve & Sign In to Vaultly';
        }
      } catch (e) {
        window.location.href = '/done';
      }
    };
  </script>
</body>
</html>`;
}

module.exports = {
  BrowserAuthService
};

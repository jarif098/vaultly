# Vaultly - Lightweight Desktop Password Manager for Windows

**Vaultly** is a fast, lightweight, and security-focused desktop password manager designed specifically for Windows 10 and Windows 11. It delivers a modern, dark-charcoal productivity experience with a minimal memory footprint (~65–85 MB RAM) and cold startup times under 350 ms, while maintaining cryptographic rigor.

---

## Key Features

- **Blazing Fast & Lightweight**: Pure CommonJS, native Node.js modules, and vanilla HTML/CSS/JS. Zero heavy front-end frameworks (no React, Next, Vue, or Tailwind) and no native node-gyp database engines.
- **Enterprise-Grade Cryptography**:
  - **AES-256-GCM**: Authenticated encryption with unique 96-bit nonces and 128-bit authentication tags for every write.
  - **scrypt KDF**: Derived key generation using 256-bit random salts and calibrated parameters ($N=32768, r=8, p=1$).
  - **Memory Hygiene**: Master passwords and decrypted entries are wiped from memory on lock.
- **Windows DPAPI Secret Protection**: GitHub Personal Access Tokens are isolated from the encrypted vault and protected using Electron `safeStorage` (backed by Windows Data Protection API).
- **Atomic File Storage**: Safe write-to-temp-then-rename operations protect against corrupted vaults during unexpected OS shutdowns.
- **38+ Built-in Services with Brand Icons**: Recognizable inline SVG icons for Google, GitHub, Steam, Discord, Netflix, Spotify, Amazon, PayPal, and more, plus support for custom services.
- **Smart Password Generator**: Uses Node.js `crypto.randomInt()` with configurable length, character sets, and entropy-based strength scoring.
- **Auto-Clearing Clipboard**: Safely copies credentials and automatically purges the clipboard after a configurable delay (default: 30 seconds).
- **GitHub Private Repository Sync**: Optional zero-knowledge remote backup and multi-device sync via GitHub REST API with privacy enforcement and concurrent conflict merge.
- **Auto-Lock & Quick Lock**: Inactivity timeout monitor (configurable from 1 to 30 min) and instant lock shortcut (`Ctrl+L`).
- **Encrypted Export & Restore**: Portable `.vaultly` backups protected by AES-256-GCM.

---

## Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Runtime | Node.js (CommonJS) | Native speed, minimal runtime overhead |
| Desktop Shell | Electron (Windows 10/11) | Native OS integration, context isolation, sandboxing |
| Frontend | Vanilla HTML5, CSS3, JavaScript | Sub-millisecond rendering, ~75 MB RAM baseline |
| Encryption | Node.js `crypto` (`scrypt` + `aes-256-gcm`) | Cryptographically verified standard libraries |
| Secret Storage | Electron `safeStorage` | Windows DPAPI hardware-backed encryption |
| Cloud Sync | Native `https` via GitHub REST API | Zero external dependencies, privacy verified |
| File Storage | JSON with atomic temp-swap | Human-inspectable, crash-resilient |

---

## Quick Start & Installation

### Prerequisites

- **Windows 10 or Windows 11** (64-bit)
- **Node.js** v18, v20, v22, or v24 LTS
- **npm** (bundled with Node.js)

### 1. Clone & Install Dependencies

```powershell
# Navigate to the repository
git clone https://github.com/Raktakto/vaultly

# Install dependencies (only Electron and Electron-Builder)
npm install
```

### 2. Run in Development Mode

```powershell
npm start
```

### 3. Run Automated Tests

Vaultly includes a comprehensive unit and integration test suite covering scrypt derivation, AES-GCM roundtrips, tampering detection, password generation, atomic file storage, and GitHub conflict resolution:

```powershell
npm test
```

### 4. Build Windows Installer & Portable Executable

```powershell
# Run pre-packaging verification
npm run build

# Package Windows NSIS installer and Portable executable
npm run dist

# Or package only the portable .exe:
npm run dist:portable
```

Built executables will be output to the `dist/` directory:
- `dist/Vaultly Setup 1.0.1.exe` (Windows Installer)
- `dist/Vaultly 1.0.1.exe` (Portable Single-file Executable)

---

## Configuration (`config.json`)

Vaultly ships with an example `config.json` defining defaults:

```json
{
  "appName": "Vaultly",
  "version": "1.0.1",
  "defaultSettings": {
    "theme": "dark",
    "accentColor": "#10b981",
    "lockTimeoutMinutes": 5,
    "clipboardClearSeconds": 30,
    "startMinimized": false,
    "autoSync": true,
    "generator": {
      "length": 16,
      "uppercase": true,
      "lowercase": true,
      "numbers": true,
      "symbols": true
    }
  },
  "security": {
    "kdf": "scrypt",
    "kdfCost": 32768,
    "kdfBlockSize": 8,
    "kdfParallelization": 1,
    "keyLength": 32,
    "saltLength": 32,
    "ivLength": 12,
    "algorithm": "aes-256-gcm"
  },
  "githubSync": {
    "apiBaseUrl": "https://api.github.com",
    "defaultBranch": "main",
    "vaultFileName": "vaultly-vault.enc.json",
    "userAgent": "Vaultly-Password-Manager/1.0.1"
  }
}
```

---

## GitHub Synchronization Setup

GitHub synchronization is **100% optional**; Vaultly works fully offline out of the box. If enabled, your vault is always encrypted locally before being transmitted to GitHub.

### Step 1: Create a Personal Access Token (PAT)

1. Sign in to your [GitHub account](https://github.com).
2. Go to **Settings** → **Developer Settings** → **Personal Access Tokens** → **Fine-grained tokens** (or **Tokens (classic)**).
3. Click **Generate new token**.
4. Set token parameters:
   - **Token name**: `Vaultly Desktop Sync`
   - **Expiration**: Select your preferred duration (e.g., 90 days or 1 year)
   - **Repository access**: Select **Only select repositories** or your private vault repo.
   - **Permissions**:
     - **Contents**: `Read and write` (to upload and fetch `vaultly-vault.enc.json`)
     - **Administration** (optional): `Read and write` if you want Vaultly to create the private repository automatically.
5. Copy the generated token (`ghp_...` or `github_pat_...`).

### Step 2: Configure Vaultly

1. In Vaultly, click **Settings** at the bottom of the sidebar.
2. Scroll to **GitHub Cloud Backup & Synchronization**.
3. Paste your Personal Access Token.
4. Enter your GitHub **Repository Owner** (e.g. `your-username`) and **Private Repository Name** (e.g. `my-vaultly-backup`).
5. Click **Test Connection**.
   - If the repository does not exist, Vaultly will ask if you want to create it as a **Strictly Private** repository.
   - Vaultly enforces that the target repository is **private**. It will actively refuse to upload encrypted vaults to public repositories!
6. Click **Sync Now** to upload your initial encrypted backup.

---

## Desktop Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + F` | Focus global search bar |
| `Ctrl + N` | Open "Add Password" modal |
| `Ctrl + L` | Immediately lock the vault and purge decrypted memory |
| `Escape` | Dismiss modal dialogs or close details panel |

---

## Security Architecture & Cryptographic Design

```
                     ┌───────────────────────────────┐
                     │        Master Password        │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                ┌─────────────────────────────────────────┐
                │   Node.js crypto.scrypt (256-bit Salt)  │
                │     N=32768, r=8, p=1, maxmem=64MB      │
                └────────────────────┬────────────────────┘
                                     │
                              256-bit Derived Key
                                     │
                                     ▼
               ┌───────────────────────────────────────────┐
               │    AES-256-GCM Authenticated Encryption   │
               │   • Random 96-bit Nonce (IV) per save    │
               │   • 128-bit Authentication Tag           │
               │   • Additional Authenticated Data (AAD)  │
               └─────────────────────┬─────────────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │  Encrypted Vault Payload  │
                       │   (Stored locally / git)  │
                       └───────────────────────────┘
```

1. **Zero-Knowledge Architecture**: The master password is never saved to disk, transmitted over IPC in plaintext, or sent to GitHub.
2. **Authenticated Ciphertext (GCM)**: If a single bit of the vault is tampered with or modified by malware, the authentication tag fails and the file will not decrypt.
3. **OS Credential Isolation (DPAPI)**: GitHub tokens are never stored inside the vault file or plaintext settings. They are encrypted using Windows DPAPI keys unique to the local Windows user account.
4. **Strict Context Isolation**: The Electron renderer executes inside a sandboxed browser context with `nodeIntegration: false`, `contextIsolation: true`, and a restrictive Content Security Policy (`connect-src 'none'`). Renderer code cannot make direct network requests.

---

## Security Limitations & Threat Model

While Vaultly implements strict cryptography, no desktop software can defend against an inherently untrusted host environment. Users should understand these fundamental constraints:

1. **Compromised Operating System**: If your Windows machine is infected with kernel-level rootkits, active keyloggers, or memory inspection trojans, any application can be monitored while the user is actively typing their master password.
2. **Loss of Master Password**: Because Vaultly uses true zero-knowledge encryption with no backdoors, **there is no master password reset mechanism**. If you lose your master password, your vault data cannot be recovered.
3. **Physical Access**: Always lock your Windows workstation (`Win + L`) when leaving your desk, or use Vaultly's auto-lock feature to prevent unauthorized access to an unlocked session.
4. **Token Permissions**: Use GitHub Fine-Grained Personal Access Tokens scoped exclusively to your private backup repository with minimum necessary permissions.

---

## License

Vaultly is open-source software licensed under the **[MIT License](LICENSE)**.

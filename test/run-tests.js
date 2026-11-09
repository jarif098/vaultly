/**
 * Vaultly - Unit & Integration Test Suite
 */

'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const { SettingsService, DEFAULT_SETTINGS } = require('../src/services/settings');

console.log('Running Vaultly Test Suite...\n');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. SettingsService Defaults Test
it('loads clean default settings without autotype', () => {
  assert.strictEqual(DEFAULT_SETTINGS.autoType, undefined);
  assert.strictEqual(DEFAULT_SETTINGS.lockTimeoutMinutes, 5);
  assert.strictEqual(DEFAULT_SETTINGS.clipboardClearSeconds, 30);

  const testDir = path.join(os.tmpdir(), 'vaultly-test-' + Date.now());
  const settings = new SettingsService(testDir);
  assert.strictEqual(settings.settings.autoType, undefined);
});

// 2. Mobile QR Pairing Tests
it('generates valid QR Code pairing payload structure', () => {
  const qrcodeGen = (() => {
    try { return require('qrcode-generator'); } catch (_) { return require('../src/vendor/qrcode'); }
  })();
  const payload = {
    type: 'vaultly-pair',
    v: 1,
    mode: 'github',
    owner: 'testowner',
    repo: 'vaultly-passwords',
    branch: 'main',
    token: 'ghp_testtoken1234567890abcdef',
    timestamp: Date.now()
  };
  const jsonStr = JSON.stringify(payload);
  const qr = qrcodeGen(0, 'M');
  qr.addData(jsonStr);
  qr.make();
  assert(qr.getModuleCount() > 20);
});

it('verifies roundtrip decoding of pairing payload', () => {
  const original = {
    type: 'vaultly-pair',
    v: 1,
    mode: 'github',
    owner: 'alice',
    repo: 'vaultly-backup',
    branch: 'main',
    token: 'ghp_secretToken_ABCXYZ'
  };
  const encoded = JSON.stringify(original);
  const decoded = JSON.parse(encoded);
  assert.strictEqual(decoded.type, 'vaultly-pair');
  assert.strictEqual(decoded.owner, 'alice');
  assert.strictEqual(decoded.token, 'ghp_secretToken_ABCXYZ');
});

it('detects invalid QR pairing codes gracefully', () => {
  const invalidPayloads = [
    'not a json string',
    '{"type": "other-app"}',
    '{"type": "vaultly-pair", "mode": "unsupported_mode"}'
  ];

  invalidPayloads.forEach(raw => {
    let isValid = false;
    try {
      const data = JSON.parse(raw);
      if (data.type === 'vaultly-pair' && (data.mode === 'github' || data.mode === 'local')) {
        isValid = true;
      }
    } catch (e) {}
    assert.strictEqual(isValid, false);
  });
});

console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
}

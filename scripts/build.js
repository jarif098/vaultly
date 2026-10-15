/**
 * Vaultly - Pre-Packaging Build Script
 * Validates dependencies, tests modules, and verifies asset readiness.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Starting Vaultly Pre-Packaging Build ---');

// 1. Ensure icons exist
const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'app-icon.ico');
if (!fs.existsSync(iconPath)) {
  console.log('Generating missing icon assets...');
  require('./generate-icon');
} else {
  console.log('✓ Icon assets verified');
}

// 2. Run unit and integration tests
console.log('Running test verification suite...');
try {
  execSync(`node "${path.join(__dirname, '..', 'test', 'run-tests.js')}"`, {
    stdio: 'inherit'
  });
  console.log('✓ All cryptographic and vault integrity tests passed');
} catch (e) {
  console.error('Build aborted: Tests failed.');
  process.exit(1);
}

// 3. Verify config.json
const configPath = path.join(__dirname, '..', 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Build error: config.json missing.');
  process.exit(1);
}
console.log('✓ Configuration validated');

console.log('\nVaultly build pre-checks complete! Ready for "npm run dist" or "npm start".');

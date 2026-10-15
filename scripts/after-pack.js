/**
 * Vaultly - electron-builder afterPack hook
 * Injects multi-resolution custom icon directly into the Windows executable
 * without requiring admin privileges or failing on macOS symlinks in winCodeSign.
 */

'use strict';

const { rcedit } = require('rcedit');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName === 'win32') {
    const exeName = `${context.packager.appInfo.productFilename}.exe`;
    const exePath = path.join(context.appOutDir, exeName);
    const iconPath = path.resolve(__dirname, '..', 'assets', 'icons', 'app-icon.ico');

    console.log(`[afterPack] Injecting custom icon into ${exePath}...`);
    await rcedit(exePath, {
      icon: iconPath,
      'version-string': {
        ProductName: 'Vaultly',
        FileDescription: 'Vaultly Password Manager',
        CompanyName: 'Raktakto',
        LegalCopyright: 'Copyright © 2026 Raktakto'
      }
    });
    console.log('[afterPack] Successfully embedded custom icon into Windows executable!');
  }
};

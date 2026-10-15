/**
 * Vaultly - Pure Node.js 256x256 PNG & ICO Generator
 * Uses native zlib and crypto modules to generate a valid 256x256 icon
 * compliant with Windows 10/11 and electron-builder specifications.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const fileStorage = require('../src/utils/file-storage');

const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');
fileStorage.ensureDirSync(ICONS_DIR);

/**
 * Calculates standard CRC32 for PNG chunks.
 */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a PNG chunk.
 */
function createChunk(type, data) {
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcInput);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a crisp 256x256 RGBA PNG image with Vaultly brand colors.
 */
function generate256Png() {
  const width = 256;
  const height = 256;

  // 1. Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR Chunk (13 bytes)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // Color type 6: RGBA
  ihdrData.writeUInt8(0, 10); // Compression deflate
  ihdrData.writeUInt8(0, 11); // Filter default
  ihdrData.writeUInt8(0, 12); // Interlace none
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // 3. Raw Scanline Data (width * 4 + 1 filter byte per row)
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;

  const centerX = 128;
  const centerY = 128;
  const cornerRadius = 48;

  for (let y = 0; y < height; y++) {
    scanlines[pos++] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      // Rounded dark charcoal container (#0b0f19)
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);

      // Check if inside rounded squircle
      let insideSquircle = false;
      const cornerDx = Math.max(0, dx - (112 - cornerRadius));
      const cornerDy = Math.max(0, dy - (112 - cornerRadius));
      if (cornerDx * cornerDx + cornerDy * cornerDy <= cornerRadius * cornerRadius) {
        insideSquircle = true;
      }

      if (!insideSquircle) {
        // Transparent outer border
        scanlines[pos++] = 0;
        scanlines[pos++] = 0;
        scanlines[pos++] = 0;
        scanlines[pos++] = 0;
      } else {
        // Distance to center
        const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        // Vaultly Shield / Lock silhouette in center with emerald color (#10b981)
        const inShield = (distFromCenter < 56) ||
                         (y >= 100 && y <= 160 && x >= 90 && x <= 166);

        if (inShield) {
          // Emerald accent (#10b981)
          scanlines[pos++] = 0x10; // R
          scanlines[pos++] = 0xb9; // G
          scanlines[pos++] = 0x81; // B
          scanlines[pos++] = 255;  // A
        } else {
          // Charcoal background (#0f172a)
          scanlines[pos++] = 0x0f; // R
          scanlines[pos++] = 0x17; // G
          scanlines[pos++] = 0x2a; // B
          scanlines[pos++] = 255;  // A
        }
      }
    }
  }

  // Deflate compress scanlines
  const compressedData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', compressedData);

  // 4. IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Generates valid Windows .ico wrapping 256x256 PNG data.
 */
function createWindows256Ico(icoPath, pngBuffer) {
  // ICO Header: 6 bytes
  const header = Buffer.from([0, 0, 1, 0, 1, 0]);

  // Directory Entry: 16 bytes
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0); // 0 means 256 width in ICO format
  dirEntry.writeUInt8(0, 1); // 0 means 256 height in ICO format
  dirEntry.writeUInt8(0, 2); // Color palette
  dirEntry.writeUInt8(0, 3); // Reserved
  dirEntry.writeUInt16LE(1, 4); // Planes
  dirEntry.writeUInt16LE(32, 6); // 32 bpp
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Size of image data
  dirEntry.writeUInt32LE(22, 12); // Offset (6 + 16 = 22)

  const icoBuffer = Buffer.concat([header, dirEntry, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Generated 256x256 Windows ICO at: ${icoPath}`);
}

const pngBuf = generate256Png();
const pngPath = path.join(ICONS_DIR, 'app-icon.png');
fs.writeFileSync(pngPath, pngBuf);
console.log(`Generated 256x256 PNG at: ${pngPath}`);

const icoPath = path.join(ICONS_DIR, 'app-icon.ico');
createWindows256Ico(icoPath, pngBuf);

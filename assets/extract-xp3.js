/**
 * XP3 Archive Extractor for Node.js
 * Supports KiriKiri engine (krkr2/krkrz) .xp3 files
 * Usage: node extract-xp3.js <input.xp3> [output-dir]
 */

const fs = require('fs');
const path = require('path');

// ============ Binary Reader Helper ============
class BinaryReader {
  constructor(buf) { this.buf = buf; this.off = 0; }
  read(len) { const v = this.buf.subarray(this.off, this.off + len); this.off += len; return v; }
  uint8() { return this.buf.readUInt8(this.off++); }
  uint32LE() { const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  uint64LE() { const lo = this.uint32LE(), hi = this.uint32LE(); return lo + hi * 0x100000000; }
  str(len) { return this.read(len).toString('utf8'); }
  skip(n) { this.off += n; }
  tell() { return this.off; }
  seek(pos) { this.off = pos; }
  get length() { return this.buf.length; }
}

// ============ XP3 Parser ============
function parseXP3(buffer) {
  const reader = new BinaryReader(buffer);

  // Magic: "XP3\r\n"
  const magic = reader.str(5);
  if (magic !== 'XP3\r\n') {
    throw new Error(`Not a valid XP3 file (magic: ${JSON.stringify(magic)})`);
  }

  // Skip version/flags bytes
  while (reader.tell() < reader.length) {
    // Read section name (null-terminated, padded to 4 bytes)
    let name = '';
    while (reader.tell() < reader.length) {
      const ch = reader.uint8();
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }

    if (name === '' && reader.tell() >= reader.length) break;
    if (!name) continue;

    // Align to 4 bytes
    while (reader.tell() % 4 !== 0) reader.skip(1);

    const infoSize = reader.uint64LE();
    const dataSize = reader.uint64LE();
    const infoData = reader.read(infoSize);
    const fileData = reader.read(dataSize);

    // Process known section types
    if (name === 'file') {
      return parseFileSection(infoData, fileData, buffer);
    } else if (name === 'info' || name === 'prot') {
      // Skip these sections
    } else {
      // Unknown section, try to continue
    }
  }

  throw new Error('No "file" section found in XP3 archive');
}

function parseFileSection(infoData, fileData, fullBuffer) {
  const info = new BinaryReader(infoData);
  const files = [];

  // Check if info contains file index or if each entry is in data
  // Usually "file" section's info contains the file count and offsets
  // And data contains the actual file entries

  // Try parsing as newer format: info has count, data has entries
  // Or older format where info IS the file listing

  try {
    // First bytes of info might be file count (uint32) or something else
    // Let's try the approach where we iterate through the data looking for entries

    const data = new BinaryReader(fileData);

    while (data.tell() < data.length - 4) {
      // File name (null-terminated UTF-8)
      const nameStart = data.tell();
      let nameBytes = [];
      while (data.tell() < data.length) {
        const b = data.uint8();
        if (b === 0) break;
        nameBytes.push(b);
      }
      const fileName = Buffer.from(nameBytes).toString('utf8');
      if (!fileName) break;

      // Align to 4 bytes
      while (data.tell() % 4 !== 0) data.skip(1);

      // After name: file offset and size
      const fileOffset = data.uint64LE();
      const fileSize = data.uint64LE();

      // Sometimes there's a CRC32 (4 bytes) after size
      // Or just padding

      files.push({
        name: fileName.replace(/\\/g, '/'),
        offset: fileOffset,
        size: fileSize,
        data: fullBuffer.subarray(fileOffset, fileOffset + fileSize)
      });
    }

    return files;
  } catch (e) {
    console.error('Error parsing file entries:', e.message);
    return [];
  }
}

// ============ Main ============
const inputFile = process.argv[2];
const outputDir = process.argv[3] || './extracted';

if (!inputFile) {
  console.log('Usage: node extract-xp3.js <input.xp3> [output-dir]');
  process.exit(1);
}

console.log(`Reading: ${inputFile}`);
const buffer = fs.readFileSync(inputFile);

try {
  const files = parseXP3(buffer);
  console.log(`Found ${files.length} files.`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  let extracted = 0;
  for (const file of files) {
    const outPath = path.join(outputDir, file.name);
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, file.data);
    extracted++;

    if (extracted <= 5 || extracted % 100 === 0) {
      console.log(`  [${extracted}/${files.length}] ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
    }
  }

  console.log(`\n✅ Done! ${extracted} files extracted to: ${outputDir}`);
} catch (e) {
  console.error('❌ Error:', e.message);
  console.log('\nDumping raw structure for debugging...');
  dumpStructure(buffer);
}

function dumpStructure(buffer) {
  const reader = new BinaryReader(buffer);
  const magic = reader.str(5);
  console.log(`Magic: ${JSON.stringify(magic)}`);
  console.log(`Next bytes: ${buffer.subarray(5, 20).toString('hex')}`);

  // Try to find sections by looking for null-terminated names
  let pos = 5;
  while (pos < Math.min(buffer.length, 200)) {
    const slice = buffer.subarray(pos, pos + 20);
    const text = slice.toString('ascii').replace(/[^ -~]/g, '.');
    const hex = slice.toString('hex');
    console.log(`@${pos}: ${hex} | ${text}`);
    pos += 20;
  }
}

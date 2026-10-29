import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AvatarStore, avatarSchemaSql } from '../src/avatars.ts';
import { normalizeAvatarBase64 } from '../src/avatar-codec.ts';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(name, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function makePng({ width = 2, height = 2, colorType = 6, filters, metadata = false, compressed } = {}) {
  const channels = colorType === 6 ? 4 : 3;
  const rows = Buffer.alloc((width * channels + 1) * height);
  const stride = width * channels;
  for (let y = 0; y < height; y++) {
    const filter = filters?.[y] ?? 0;
    rows[y * (stride + 1)] = filter;
    const pixel = Buffer.alloc(stride);
    for (let j = 0; j < stride; j++) pixel[j] = (j * 29 + y * 47 + 13) & 255;
    for (let x = 0; x < stride; x++) {
      // A row-dependent ramp exercises left/up/upper-left reconstruction.
      const raw = pixel[x];
      const left = x >= channels ? pixel[x - channels] : 0;
      const up = y ? ((x * 29 + (y - 1) * 47 + 13) & 255) : 0;
      const upperLeft = y && x >= channels ? (((x - channels) * 29 + (y - 1) * 47 + 13) & 255) : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      }
      rows[y * (stride + 1) + 1 + x] = (raw - predictor) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  const parts = [signature, chunk('IHDR', ihdr)];
  if (metadata) parts.push(chunk('tEXt', Buffer.from('note\0remove me')));
  parts.push(chunk('IDAT', compressed ?? deflateSync(rows)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
function outputPixels(png) {
  let offset = 8, width, height, channels, compressed;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 6 ? 4 : 3; }
    if (type === 'IDAT') compressed = data;
    offset += length + 12;
  }
  const raw = inflateSync(compressed), pixels = Buffer.alloc(width * height * channels);
  const stride = width * channels;
  for (let y = 0; y < height; y++) raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  return { width, height, channels, pixels };
}

test('PNG normalization reconstructs all five filters and supports RGB/RGBA', () => {
  for (const colorType of [2, 6]) {
    const image = normalizeAvatarBase64(makePng({ width: 2, height: 5, colorType, filters: [0, 1, 2, 3, 4] }).toString('base64'));
    assert.deepEqual(outputPixels(image.png).pixels, outputPixels(makePng({ width: 2, height: 5, colorType, filters: [0, 0, 0, 0, 0] })).pixels);
  }
});

test('normalization strips metadata and emits only IHDR, IDAT, IEND', () => {
  const out = normalizeAvatarBase64(makePng({ metadata: true }).toString('base64'));
  const types = [];
  for (let at = 8; at < out.png.length;) { const n = out.png.readUInt32BE(at); types.push(out.png.toString('ascii', at + 4, at + 8)); at += n + 12; }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
});

test('1024 square boundary is accepted and safely scaled to 256 square', () => {
  const raw = Buffer.alloc((1024 * 4 + 1) * 1024);
  const image = normalizeAvatarBase64(makePng({ width: 1024, height: 1024, compressed: deflateSync(raw) }).toString('base64'));
  assert.equal(image.width, 256);
  assert.equal(image.height, 256);
  assert.ok(image.png.length <= 320 * 1024);
});

test('2 MiB input boundary is inclusive', () => {
  const base = makePng();
  const ancillaryLength = 2 * 1024 * 1024 - base.length - 12;
  const withMetadata = Buffer.concat([base.subarray(0, 33), chunk('tEXt', Buffer.alloc(ancillaryLength)), base.subarray(33)]);
  assert.equal(withMetadata.length, 2 * 1024 * 1024);
  assert.equal(normalizeAvatarBase64(withMetadata.toString('base64')).width, 2);
});

test('oversize inputs and dimensions have explicit refusals', () => {
  assert.throws(() => normalizeAvatarBase64(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')), { code: 'avatar-input-too-large' });
  assert.throws(() => normalizeAvatarBase64(makePng({ width: 1025, height: 1 }).toString('base64')), { code: 'avatar-dimensions-too-large' });
  assert.throws(() => normalizeAvatarBase64(makePng({ width: 1024, height: 1025 }).toString('base64')), { code: 'avatar-dimensions-too-large' });
});

test('rejects non-PNG, unsupported encodings, malformed chunks, animation and bad CRC', () => {
  assert.throws(() => normalizeAvatarBase64(Buffer.from('<svg/>').toString('base64')), { code: 'invalid-avatar-format' });
  assert.throws(() => normalizeAvatarBase64('bm90IGEgcG5n'), { code: 'invalid-avatar-format' });
  assert.throws(() => normalizeAvatarBase64('YWJj\n'), { code: 'invalid-avatar-base64' });
  const badCrc = makePng(); badCrc[badCrc.length - 5] ^= 1;
  assert.throws(() => normalizeAvatarBase64(badCrc.toString('base64')), { code: 'invalid-avatar-image' });
  const png = makePng();
  const ihdr = png.subarray(8, 33);
  const repeated = Buffer.concat([signature, ihdr, ihdr, png.subarray(33)]);
  assert.throws(() => normalizeAvatarBase64(repeated.toString('base64')), { code: 'invalid-avatar-image' });
  const highBitChunkName = makePng();
  highBitChunkName[12] |= 0x80;
  highBitChunkName.writeUInt32BE(crc32(highBitChunkName.subarray(12, 29)), 29);
  assert.throws(() => normalizeAvatarBase64(highBitChunkName.toString('base64')), { code: 'invalid-avatar-image' });
  assert.throws(() => normalizeAvatarBase64(png.subarray(0, png.length - 1).toString('base64')), { code: 'invalid-avatar-image' });
  const corruptZlib = makePng({ compressed: Buffer.from([1, 2, 3, 4]) });
  assert.throws(() => normalizeAvatarBase64(corruptZlib.toString('base64')), { code: 'invalid-avatar-image' });
  const apng = Buffer.concat([signature, png.subarray(8, png.length - 12), chunk('acTL', Buffer.alloc(8)), png.subarray(png.length - 12)]);
  assert.throws(() => normalizeAvatarBase64(apng.toString('base64')), { code: 'invalid-avatar-image' });
  assert.throws(() => normalizeAvatarBase64(makePng({ colorType: 3 }).toString('base64')), { code: 'unsupported-avatar-png' });
});

test('inflation is bounded by IHDR-derived scanline size', () => {
  const bomb = makePng({ width: 1, height: 1, compressed: deflateSync(Buffer.alloc(100_000)) });
  assert.throws(() => normalizeAvatarBase64(bomb.toString('base64')), { code: 'invalid-avatar-image' });
});

test('SQLite store isolates Bots, replaces atomically and enforces expected revision', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-test-'));
  const db = new DatabaseSync(join(dir, 'fixture.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE bots(id TEXT PRIMARY KEY);');
  db.exec(avatarSchemaSql);
  db.prepare('INSERT INTO bots(id) VALUES(?),(?)').run('bot-a', 'bot-b');
  const storage = {
    db,
    transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  const store = new AvatarStore(storage);
  const first = makePng({ filters: [0, 1] }).toString('base64');
  const second = makePng({ colorType: 2, filters: [4, 3] }).toString('base64');
  const a1 = store.set('bot-a', first);
  const b1 = store.set('bot-b', first);
  assert.equal(store.read('bot-a').revision, a1.revision);
  assert.equal(store.read('bot-b').revision, b1.revision);
  assert.equal(store.read('bot-a').pngBase64, normalizeAvatarBase64(first).png.toString('base64'));
  assert.throws(() => store.set('bot-a', second, '0'.repeat(64)), { code: 'avatar-revision-conflict', status: 409 });
  assert.equal(store.read('bot-a').revision, a1.revision);
  const a2 = store.set('bot-a', second, a1.revision);
  assert.notEqual(a2.revision, a1.revision);
  assert.equal(store.read('bot-b').revision, b1.revision);
  assert.deepEqual(store.delete('bot-a', a2.revision), { deleted: true });
  assert.equal(store.read('bot-a'), null);
  assert.equal(store.read('bot-b').revision, b1.revision);
  assert.deepEqual(store.delete('bot-a'), { deleted: false });
  assert.throws(() => store.read('missing'), { code: 'not-found', status: 404 });
  assert.equal(db.prepare('SELECT count(*) AS n FROM bot_avatars').get().n, 1);
  assert.equal(db.prepare('SELECT revision FROM bot_avatars WHERE bot_id=?').get('bot-b').revision,
    createHash('sha256').update(normalizeAvatarBase64(first).png).digest('hex'));
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
});

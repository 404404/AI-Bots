import { inflateSync, deflateSync } from 'node:zlib';
import { BotError, requireValue } from './errors.ts';

export const AVATAR_INPUT_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_WIDTH_MAX = 1024;
export const AVATAR_HEIGHT_MAX = 1024;
export const AVATAR_PIXELS_MAX = 1_048_576;
export const AVATAR_OUTPUT_MAX_BYTES = 320 * 1024;
export const AVATAR_EDGE_MAX = 256;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type DecodedAvatar = { png: Buffer; width: number; height: number };

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function invalidPng(): never {
  throw new BotError('invalid-avatar-image', '头像必须是完整、有效的 PNG 图片。');
}

function parsePng(input: Buffer) {
  if (input.length > AVATAR_INPUT_MAX_BYTES)
    throw new BotError('avatar-input-too-large', '头像 PNG 输入不能超过 2 MiB。');
  if (input.length < SIGNATURE.length || !input.subarray(0, 8).equals(SIGNATURE))
    throw new BotError('invalid-avatar-format', '首版只接受 PNG 图片。');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let sawHeader = false;
  let sawData = false;
  let dataEnded = false;
  let sawEnd = false;
  let sawPalette = false;
  const data: Buffer[] = [];

  while (offset < input.length) {
    if (input.length - offset < 12) invalidPng();
    const length = input.readUInt32BE(offset);
    if (length > input.length - offset - 12) invalidPng();
    const typeBytes = input.subarray(offset + 4, offset + 8);
    for (const byte of typeBytes) {
      if (!((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))) invalidPng();
    }
    const type = typeBytes.toString('ascii');
    // PNG reserves the third chunk-name byte; it must be uppercase in conforming files.
    if ((typeBytes[2]! & 0x20) !== 0) invalidPng();
    const chunkData = input.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = input.readUInt32BE(offset + 8 + length);
    if (crc32(input.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) invalidPng();
    offset += length + 12;

    const critical = (typeBytes[0]! & 0x20) === 0;
    if (critical && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)) invalidPng();
    if (['acTL', 'fcTL', 'fdAT', 'tRNS'].includes(type)) invalidPng();
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) invalidPng();
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      const bitDepth = chunkData[8]!;
      colorType = chunkData[9]!;
      if (
        !width || !height || width > AVATAR_WIDTH_MAX || height > AVATAR_HEIGHT_MAX ||
        width * height > AVATAR_PIXELS_MAX
      ) throw new BotError('avatar-dimensions-too-large', '头像尺寸最多为 1024×1024 且总像素不超过 1048576。');
      if (bitDepth !== 8 || ![2, 6].includes(colorType) || chunkData[10] !== 0 || chunkData[11] !== 0 || chunkData[12] !== 0)
        throw new BotError('unsupported-avatar-png', '头像仅支持 8 位 RGB/RGBA、非交错 PNG。');
      sawHeader = true;
      continue;
    }
    if (type === 'IHDR') invalidPng();
    if (type === 'PLTE') {
      if (sawPalette || sawData || length < 3 || length > 768 || length % 3 !== 0) invalidPng();
      sawPalette = true;
      continue;
    }
    if (type === 'IEND') {
      if (length !== 0 || !sawData || sawEnd) invalidPng();
      sawEnd = true;
      if (offset !== input.length) invalidPng();
      break;
    }
    if (type === 'IDAT') {
      if (dataEnded || sawEnd) invalidPng();
      sawData = true;
      data.push(chunkData);
      continue;
    }
    if (sawData) dataEnded = true;
    // Unknown ancillary chunks are CRC-checked, then discarded by re-encoding.
  }
  if (!sawHeader || !sawData || !sawEnd) invalidPng();
  return { width, height, colorType, compressed: Buffer.concat(data) };
}

function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const pixels = Buffer.allocUnsafe(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++]!;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source++]!;
      const left = x >= channels ? pixels[rowStart + x - channels]! : 0;
      const up = y > 0 ? pixels[rowStart + x - stride]! : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowStart + x - stride - channels]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else if (filter !== 0) invalidPng();
      pixels[rowStart + x] = (value + predictor) & 0xff;
    }
  }
  return pixels;
}

function resizeNearest(source: Buffer, width: number, height: number, channels: number) {
  const scale = Math.min(1, AVATAR_EDGE_MAX / Math.max(width, height));
  const outWidth = Math.max(1, Math.floor(width * scale));
  const outHeight = Math.max(1, Math.floor(height * scale));
  if (outWidth === width && outHeight === height) return { pixels: source, width, height };
  const target = Buffer.allocUnsafe(outWidth * outHeight * channels);
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / outWidth));
      const from = (sy * width + sx) * channels;
      const to = (y * outWidth + x) * channels;
      source.copy(target, to, from, from + channels);
    }
  }
  return { pixels: target, width: outWidth, height: outHeight };
}

function encode(pixels: Buffer, width: number, height: number, channels: number, colorType: number) {
  const stride = width * channels;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    scanlines[at] = 0;
    pixels.copy(scanlines, at + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const compressed = deflateSync(scanlines, { level: 9 });
  const output = Buffer.concat([SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
  requireValue(output.length <= AVATAR_OUTPUT_MAX_BYTES, 'avatar-output-too-large', '头像转换结果超过 320 KiB。');
  return output;
}

/** Validate an uploaded base64 PNG and return a metadata-free, bounded PNG. */
export function normalizeAvatarBase64(value: unknown): DecodedAvatar {
  requireValue(typeof value === 'string' && value.length > 0, 'invalid-avatar-base64', '头像须使用标准 Base64 编码。');
  const encoded = value as string;
  requireValue(encoded.length <= Math.ceil(AVATAR_INPUT_MAX_BYTES / 3) * 4, 'avatar-input-too-large', '头像 PNG 输入不能超过 2 MiB。');
  requireValue(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded), 'invalid-avatar-base64', '头像须使用无空白、规范填充的标准 Base64。');
  const input = Buffer.from(encoded, 'base64');
  requireValue(input.toString('base64') === encoded, 'invalid-avatar-base64', '头像须使用规范 Base64 编码。');
  const parsed = parsePng(input);
  const channels = parsed.colorType === 6 ? 4 : 3;
  const expected = (parsed.width * channels + 1) * parsed.height;
  let decoded: Buffer;
  try {
    const result = inflateSync(parsed.compressed, { maxOutputLength: expected, info: true });
    if (result.engine.bytesWritten !== parsed.compressed.length) invalidPng();
    decoded = result.buffer;
  } catch {
    invalidPng();
  }
  if (decoded.length !== expected) invalidPng();
  const pixels = unfilter(decoded, parsed.width, parsed.height, channels);
  const resized = resizeNearest(pixels, parsed.width, parsed.height, channels);
  return {
    png: encode(resized.pixels, resized.width, resized.height, channels, parsed.colorType),
    width: resized.width,
    height: resized.height,
  };
}

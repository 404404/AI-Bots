import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  CLOCK_BITS,
  clockAge,
  decodeFrame,
  decodePng,
  readClock,
  summarize,
} from '../computer-frame-bench.mjs';

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}

function clockPng(value, cell, width = 1200, height = 120) {
  const pixels = Buffer.alloc(width * height * 3, 0xf4);
  const paint = (index, rgb) => {
    const x0 = Math.round(10 + cell * index);
    const x1 = Math.round(10 + cell * (index + 1));
    for (let y = 10; y < 10 + Math.round(cell); y += 1)
      for (let x = x0; x < x1 && x < width; x += 1) pixels.set(rgb, (y * width + x) * 3);
  };
  paint(0, [255, 0, 0]);
  for (let i = 0; i < CLOCK_BITS; i += 1) {
    const bit = Math.floor(value / 2 ** (CLOCK_BITS - 1 - i)) % 2;
    paint(i + 1, bit ? [0, 0, 0] : [255, 255, 255]);
  }
  paint(CLOCK_BITS + 1, [255, 0, 0]);
  const rows = [];
  for (let y = 0; y < height; y += 1)
    rows.push(
      Buffer.from([y % 2 === 0 ? 0 : 2]),
      y % 2 === 0
        ? pixels.subarray(y * width * 3, (y + 1) * width * 3)
        : Buffer.from(
            pixels
              .subarray(y * width * 3, (y + 1) * width * 3)
              .map((v, x) => (v - pixels[(y - 1) * width * 3 + x] + 256) & 255),
          ),
    );
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Computer frame benchmark', () => {
  it('reads the clock strip from a frame at standard and Retina scale', () => {
    expect(readClock(decodePng(clockPng(12_345_678, 32)))).toBe(12_345_678);
    expect(readClock(decodePng(clockPng(9_876, 64, 1800)))).toBe(9_876);
    expect(readClock(decodePng(clockPng(8_376_856, 17.41)))).toBe(8_376_856);
  });

  it('reads the clock strip from a JPEG frame', async () => {
    const require = createRequire(new URL('../../packages/computer/package.json', import.meta.url));
    const { default: sharp } = await import(require.resolve('sharp'));
    const jpeg = await sharp(clockPng(4_242_424, 18), { failOn: 'none' })
      .jpeg({ quality: 70 })
      .toBuffer();
    expect(readClock(await decodeFrame(jpeg, 'image/jpeg'))).toBe(4_242_424);
  });

  it('measures age across the clock wrap and summarizes a run', () => {
    expect(clockAge(2 ** CLOCK_BITS + 40, 2 ** CLOCK_BITS - 60)).toBe(100);
    expect(summarize([300, 100, 200], 4, 4096, 2)).toEqual({
      frames: 4,
      fps: 2,
      readable: 3,
      latencyMs: { p50: 200, p90: 300, p99: 300 },
      avgFrameKB: 1,
      mbps: 0.02,
    });
  });
});

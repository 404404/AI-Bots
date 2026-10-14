#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inflateSync } from 'node:zlib';

export const CLOCK_BITS = 24;
const CLOCK_MODULO = 2 ** CLOCK_BITS;

export const usage = `Usage: node scripts/computer-frame-bench.mjs [--name <instance>] [--seconds <n>] [--scene <label>]
       node scripts/computer-frame-bench.mjs --write-clock

Measure the Computer frame stream (GET /api/computer/frame) of an isolated Host started with
scripts/verify-app.mjs. Show the clock page full screen (or at the top-left) on the Computer
desktop first: --write-clock writes it and prints its file URL; add ?scene=busy for a moving
screen. Each frame's age is read from the clock strip drawn into the screen, so the latency is
capture plus transfer, as a phone would see it. Prints one JSON line.`;

export const CLOCK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Frame clock</title><style>
html,body{margin:0;height:100%;background:#f4f4f2;overflow:hidden}
#strip{position:fixed;left:0;top:0;display:flex;background:#fff;padding:8px}
#strip i{width:32px;height:32px;display:block}
#busy{position:fixed;left:0;top:60px;right:0;bottom:0}
</style></head><body><div id="strip"></div><canvas id="busy"></canvas><script>
const BITS=${CLOCK_BITS};const strip=document.getElementById('strip');const cells=[];
const marker=document.createElement('i');marker.style.background='#ff0000';strip.appendChild(marker);
for(let i=0;i<BITS;i++){const c=document.createElement('i');strip.appendChild(c);cells.push(c)}
const end=document.createElement('i');end.style.background='#ff0000';strip.appendChild(end);
const busy=new URLSearchParams(location.search).get('scene')==='busy';
const cv=document.getElementById('busy');const g=cv.getContext('2d');
function size(){cv.width=innerWidth;cv.height=innerHeight-60}size();addEventListener('resize',size);
const lines=[];for(let i=0;i<60;i++)lines.push('Line '+i+' The quick brown fox jumps over the lazy dog 0123456789 '.repeat(2));
function draw(t){const now=Date.now()%${CLOCK_MODULO};
for(let i=0;i<BITS;i++)cells[i].style.background=Math.floor(now/2**(BITS-1-i))%2?'#000':'#fff';
g.fillStyle='#f4f4f2';g.fillRect(0,0,cv.width,cv.height);
if(busy)for(let k=0;k<6;k++){const gr=g.createLinearGradient(0,0,cv.width,0);gr.addColorStop(0,'hsl('+((t/20+k*60)%360)+',70%,60%)');gr.addColorStop(1,'hsl('+((t/20+k*60+120)%360)+',70%,40%)');g.fillStyle=gr;g.beginPath();g.arc((Math.sin(t/900+k)*0.4+0.5)*cv.width,(Math.cos(t/700+k*2)*0.4+0.5)*cv.height,90+k*25,0,7);g.fill()}
g.fillStyle='#222';g.font='15px monospace';const off=busy?Math.floor(t/50)%60:0;
for(let i=0;i<40;i++)g.fillText(lines[(i+off)%60],12,22+i*20);
requestAnimationFrame(draw)}
requestAnimationFrame(draw);
</script></body></html>
`;

export function decodePng(bytes, maxRows = 800) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let depth = 8;
  let palette = Buffer.alloc(0);
  const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    }
    if (type === 'PLTE') palette = Buffer.from(data);
    if (type === 'IDAT') chunks.push(data);
    offset += 12 + length;
  }
  const packed = colorType === 0 || colorType === 3;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined || (!packed && depth !== 8))
    throw new Error(`unsupported PNG color type ${colorType} depth ${depth}`);
  const bpp = packed ? 1 : channels;
  const stride = packed ? Math.ceil((width * depth) / 8) : width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  const rows = Math.min(height, maxRows);
  const out = Buffer.alloc(stride * rows);
  for (let y = 0; y < rows; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = value & 255;
    }
  }
  const sample = (x, y) => {
    const bit = x * depth;
    const byte = out[y * stride + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  return {
    width,
    height,
    rows,
    pixel(x, y) {
      if (colorType === 0) {
        const v = (sample(x, y) * 255) / ((1 << depth) - 1);
        return [v, v, v];
      }
      if (colorType === 3) {
        const index = sample(x, y);
        return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
      }
      const i = y * stride + x * channels;
      if (colorType === 4) return [out[i], out[i], out[i]];
      return [out[i], out[i + 1], out[i + 2]];
    },
  };
}

export async function decodeFrame(bytes, mimeType) {
  if (mimeType !== 'image/jpeg') return decodePng(bytes);
  const require = createRequire(new URL('../packages/computer/package.json', import.meta.url));
  const { default: sharp } = await import(require.resolve('sharp'));
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    rows: info.height,
    pixel(x, y) {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
}

export function readClock(image, bits = CLOCK_BITS) {
  const red = (x, y) => {
    const [r, g, b] = image.pixel(x, y);
    return r > 200 && g < 60 && b < 60;
  };
  for (let y = 0; y < Math.min(image.rows, 700); y += 4)
    for (let x = 0; x < Math.min(image.width, 1400); x += 4) {
      if (!red(x, y)) continue;
      let x0 = x;
      while (x0 > 0 && red(x0 - 1, y)) x0 -= 1;
      let y0 = y;
      while (y0 > 0 && red(x0, y0 - 1)) y0 -= 1;
      let x1 = x0;
      while (x1 + 1 < image.width && red(x1 + 1, y0 + 2)) x1 += 1;
      const measured = x1 - x0 + 1;
      if (measured < 12 || y0 + measured >= image.rows) continue;
      const middle = Math.round(y0 + measured / 2);
      let end = x1 + 1;
      while (end < image.width && !red(end, middle)) end += 1;
      const cell = end < image.width ? (end - x0) / (bits + 1) : measured;
      let value = 0;
      for (let i = 0; i < bits; i += 1) {
        const cx = Math.round(x0 + cell * (i + 1) + cell / 2);
        if (cx >= image.width) return undefined;
        const [r, g, b] = image.pixel(cx, middle);
        value = value * 2 + ((r + g + b) / 3 < 128 ? 1 : 0);
      }
      return value;
    }
  return undefined;
}

export function clockAge(receivedAt, clock) {
  return ((receivedAt % CLOCK_MODULO) - clock + CLOCK_MODULO) % CLOCK_MODULO;
}

export function summarize(samples, frames, bytes, seconds) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) =>
    sorted.length === 0
      ? undefined
      : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    frames,
    fps: Number((frames / seconds).toFixed(2)),
    readable: sorted.length,
    latencyMs: { p50: at(0.5), p90: at(0.9), p99: at(0.99) },
    avgFrameKB: Math.round(bytes / Math.max(1, frames) / 1024),
    mbps: Number(((bytes * 8) / seconds / 1e6).toFixed(2)),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string', default: 'default' },
      seconds: { type: 'string', default: '20' },
      scene: { type: 'string', default: 'static' },
      'write-clock': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return console.log(usage);
  if (values['write-clock']) {
    const dir = join(tmpdir(), 'botharness-frame-clock');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'clock.html');
    writeFileSync(file, CLOCK_PAGE);
    return console.log(`file://${file}`);
  }
  const instance = JSON.parse(
    readFileSync(resolve('.humanlayer', 'verify', values.name, 'instance.json'), 'utf8'),
  );
  const url = new URL(instance.url);
  const login = await fetch(`${url.origin}/?token=${url.searchParams.get('token')}`, {
    redirect: 'manual',
  });
  const cookie = login.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
  const seconds = Number(values.seconds);
  const samples = [];
  let frames = 0;
  let bytes = 0;
  let after;
  let size = '';
  let target = '';
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    const answer = await fetch(
      `${url.origin}/api/computer/frame${after === undefined ? '' : `?after=${after}`}`,
      { headers: { cookie } },
    );
    if (answer.status === 204) continue;
    const text = await answer.text();
    if (!answer.ok) throw new Error(`frame request failed ${answer.status}: ${text.slice(0, 200)}`);
    const receivedAt = Date.now();
    const body = JSON.parse(text);
    if (body.ok !== true) throw new Error(`frame refused: ${text.slice(0, 200)}`);
    after = body.seq;
    frames += 1;
    bytes += text.length;
    size = `${body.width}x${body.height}`;
    target = body.target;
    const clock = readClock(await decodeFrame(Buffer.from(body.data, 'base64'), body.mimeType));
    if (clock === undefined) continue;
    const age = clockAge(receivedAt, clock);
    if (age < 60_000) samples.push(age);
  }
  const elapsed = (Date.now() - started) / 1000;
  console.log(
    JSON.stringify({
      arm: 'screenshot-stream',
      platform: process.platform,
      target,
      scene: values.scene,
      size,
      seconds: elapsed,
      ...summarize(samples, frames, bytes, elapsed),
    }),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();

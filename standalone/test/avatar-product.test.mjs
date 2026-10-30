import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BotApplication } from '../src/application.ts';
import { startServer } from '../src/server.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'avatar-product-'));
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(metadataSize = 0, color = [40, 120, 80, 255]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [signature, chunk('IHDR', ihdr)];
  if (metadataSize) parts.push(chunk('tEXt', Buffer.alloc(metadataSize, 65)));
  parts.push(chunk('IDAT', deflateSync(Buffer.from([0, ...color]))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const owner = (app, command, params = {}) => app.execute(command, params, { kind: 'owner' });

test('schema 4 fixture migrates transactionally to schema 5 without changing Bot identity', async (t) => {
  const root = dir();
  let app = new BotApplication(root);
  const bot = await owner(app, 'bots.create', { slug: 'avatar-migration', name: 'Avatar fixture' });
  const main = (await owner(app, 'main.get')).bot.id;
  await app.close();

  const db = new DatabaseSync(join(root, 'bot.sqlite'));
  db.exec('DROP TABLE bot_avatars; PRAGMA user_version=4;');
  db.close();
  app = new BotApplication(root);
  try {
    assert.equal(app.storage.db.prepare('PRAGMA user_version').get().user_version, 5);
    assert.equal((await owner(app, 'bots.get', { botId: bot.id })).id, bot.id);
    assert.equal((await owner(app, 'main.get')).bot.id, main);
    assert.equal((await owner(app, 'avatars.get', { botId: bot.id })).avatar, null);
    assert.equal(app.storage.db.prepare('SELECT count(*) AS n FROM bot_avatars').get().n, 0);
  } finally {
    await app.close();
    t.after(() => rmSync(root, { recursive: true, force: true }));
  }
});

test('authenticated bounded HTTP upload, revision reads, delete and CLI file path share AvatarStore', async (t) => {
  const root = dir();
  const probe = await import('node:net');
  const netServer = probe.createServer();
  await new Promise((resolve) => netServer.listen(0, '127.0.0.1', resolve));
  const port = netServer.address().port;
  await new Promise((resolve) => netServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const runtime = await startServer({ dataDir: root, port, host: '127.0.0.1', publicUrl: base });
  t.after(async () => { await runtime.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/favicon.ico`)).status, 204);
  const post = (path, body, cookie) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${base}/api/v1/bots/none/avatar/${'0'.repeat(64)}`)).status, 401);
  assert.equal((await post('/api/v1/avatar', { botId: 'none', pngBase64: png().toString('base64') })).status, 401);
  const accessCode = readFileSync(join(root, 'secrets', 'access-code'), 'utf8').trim();
  const login = await post('/api/v1/session', { code: accessCode });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const command = async (name, params = {}) => {
    const response = await post('/api/v1/command', { command: name, params }, cookie);
    return { response, body: await response.json() };
  };
  const bot = (await command('bots.create', { slug: 'avatar-http', name: 'HTTP avatar' })).body.result;
  const image = png(60_000).toString('base64');
  const ordinary = await post('/api/v1/command', { command: 'avatars.set', params: { botId: bot.id, pngBase64: image } }, cookie);
  assert.equal(ordinary.status, 413, 'the regular command endpoint keeps its 49 KiB request limit');
  const upload = await post('/api/v1/avatar', { botId: bot.id, pngBase64: image, expectedRevision: null }, cookie);
  assert.equal(upload.status, 200);
  const first = (await upload.json()).result;
  assert.equal(first.width, 1); assert.equal(first.height, 1);
  const metadata = (await command('bots.get', { botId: bot.id })).body.result.avatar;
  assert.equal(metadata.revision, first.revision);
  const avatarInfo = (await command('avatars.get', { botId: bot.id })).body.result;
  assert.equal(avatarInfo.url, `/api/v1/bots/${bot.id}/avatar/${first.revision}`);
  assert(!avatarInfo.url.includes(root));
  assert.equal((await command('main.catalog')).body.result.items.find((item) => item.id === bot.id).avatar.revision, first.revision);
  const readUrl = `${base}/api/v1/bots/${bot.id}/avatar/${first.revision}`;
  const read = await fetch(readUrl, { headers: { cookie } });
  assert.equal(read.status, 200); assert.equal(read.headers.get('content-type'), 'image/png');
  const normalized = Buffer.from(await read.arrayBuffer());
  assert(normalized.length <= 320 * 1024);
  assert.deepEqual(normalized.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const imageFile = join(root, 'input.png');
  writeFileSync(imageFile, png(0, [200, 20, 30, 255]));
  const sessionFile = join(root, 'cli-session');
  writeFileSync(sessionFile, cookie, { mode: 0o600 });
  const cli = spawn(process.execPath, ['--experimental-strip-types', 'src/cli.ts', 'avatar.set', '--bot-id', bot.id, '--image-file', imageFile, '--expected-revision', first.revision], {
    cwd: process.cwd(), env: { ...process.env, BOT_URL: base, BOT_SESSION_FILE: sessionFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  cli.stdout.on('data', (data) => output += data);
  const exit = await new Promise((resolve) => cli.on('exit', resolve));
  assert.equal(exit, 0, output);
  const second = JSON.parse(output).result;
  assert.notEqual(second.revision, first.revision);
  assert.equal((await fetch(readUrl, { headers: { cookie } })).status, 404, 'old revision URL is no longer readable');

  const symlinkFile = join(root, 'avatar-link.png');
  symlinkSync(imageFile, symlinkFile);
  const unsafeCli = spawn(process.execPath, ['--experimental-strip-types', 'src/cli.ts', 'avatar.set', '--bot-id', bot.id, '--image-file', symlinkFile], {
    cwd: process.cwd(), env: { ...process.env, BOT_URL: base, BOT_SESSION_FILE: sessionFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let unsafeOutput = '';
  unsafeCli.stdout.on('data', (data) => unsafeOutput += data);
  assert.equal(await new Promise((resolve) => unsafeCli.on('exit', resolve)), 1);
  assert.equal(JSON.parse(unsafeOutput).error.code, 'unsafe-avatar-file');

  const oversizedFile = join(root, 'oversized.png');
  writeFileSync(oversizedFile, Buffer.alloc(2 * 1024 * 1024 + 1));
  const oversizedCli = spawn(process.execPath, ['--experimental-strip-types', 'src/cli.ts', 'avatar.set', '--bot-id', bot.id, '--image-file', oversizedFile], {
    cwd: process.cwd(), env: { ...process.env, BOT_URL: base, BOT_SESSION_FILE: sessionFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let oversizedOutput = '';
  oversizedCli.stdout.on('data', (data) => oversizedOutput += data);
  assert.equal(await new Promise((resolve) => oversizedCli.on('exit', resolve)), 1);
  assert.equal(JSON.parse(oversizedOutput).error.code, 'avatar-input-too-large');

  const conflict = await post('/api/v1/avatar', { botId: bot.id, pngBase64: png().toString('base64'), expectedRevision: first.revision }, cookie);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, 'avatar-revision-conflict');
  const activeAvatar = (await command('bots.get', { botId: bot.id })).body.result.avatar;
  const invalid = await post('/api/v1/avatar', { botId: bot.id, pngBase64: Buffer.from('<svg/>').toString('base64'), expectedRevision: activeAvatar.revision }, cookie);
  assert.equal(invalid.status, 400);
  assert.equal((await command('bots.get', { botId: bot.id })).body.result.avatar.revision, activeAvatar.revision);
  const removed = await command('avatars.delete', { botId: bot.id, expectedRevision: second.revision });
  assert.equal(removed.body.result.deleted, true);
  assert.equal((await command('bots.get', { botId: bot.id })).body.result.avatar, null);
});

test('avatar UI snapshots selection revision and keeps bounded task trace state', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const upload = app.slice(app.indexOf('async function uploadAvatar()'), app.indexOf('async function deleteAvatar()'));
  assert(upload.indexOf('const botId = bot.id') < upload.indexOf('await readAvatarFile(file)'));
  assert(upload.indexOf('const expectedRevision = bot.avatar?.revision ?? null') < upload.indexOf('await readAvatarFile(file)'));
  assert.match(upload, /JSON\.stringify\(\{ botId, pngBase64, expectedRevision \}\)/u);
  assert.match(app, /async function refreshAvatarSurfaces\(botId\)/u);
  assert.match(app, /querySelectorAll\('\.avatar\[data-bot-id\]'\)/u);
  assert.match(html, /<details id="task-trace"/u);
  assert.match(app, /const traceOpen = trace\.open/u);
  assert.match(app, /trace\.open = traceOpen/u);
  assert.match(app, /details\.task-result\[open\]/u);
  assert.match(app, /result\.open = openResults\.has\(task\.id\)/u);
  assert.match(app, /result\.append\(node\('summary', `\$\{task\.parentId \? '工作任务结果' : '任务结果'\}/u);
  assert.match(css, /\.task-trace\s*\{[^}]*max-height:\s*190px;[^}]*overflow:\s*auto;/su);
  assert.match(css, /\.messages\s*\{[^}]*min-height:\s*0;/su);
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertChildAlive, captureProcessIdentity, closeRelayWhenChildExits, createReservedLoopbackRelay, isProcessIdentityAlive, parseLinuxProcessStat, parseServerReadyLine, prepareEmptyOutputDir } from './harness.mjs';

test('relay owns its kernel-assigned loopback port and forwards only to its fixed child port', async () => {
  const relay = await createReservedLoopbackRelay();
  const backendSockets = new Set();
  const backend = net.createServer((socket) => {
    backendSockets.add(socket);
    socket.once('close', () => backendSockets.delete(socket));
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\nchild-server');
  });
  try {
    const contender = net.createServer();
    await assert.rejects(new Promise((resolveListen, reject) =>
      contender.listen(relay.port, '127.0.0.1', resolveListen).once('error', reject)), { code: 'EADDRINUSE' });
    await new Promise((resolveListen, reject) => backend.listen(0, '127.0.0.1', resolveListen).once('error', reject));
    relay.setTarget(backend.address().port, () => true);
    const response = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'child-server');
  } finally {
    await relay.close();
    for (const socket of backendSockets) socket.destroy();
    await new Promise((resolveClose) => backend.close(() => resolveClose()));
  }
});

test('relay sends no client bytes to a replacement listener after child identity is gone', async () => {
  const relay = await createReservedLoopbackRelay();
  let received = '';
  const replacement = net.createServer((socket) => {
    socket.on('data', (chunk) => { received += chunk.toString('utf8'); });
  });
  let client;
  try {
    await new Promise((resolve, reject) => replacement.listen(0, '127.0.0.1', resolve).once('error', reject));
    relay.setTarget(replacement.address().port, () => false);
    client = net.connect({ host: '127.0.0.1', port: relay.port });
    const clientClosed = new Promise((resolve) => client.once('close', resolve));
    await new Promise((resolve, reject) => client.once('connect', resolve).once('error', reject));
    client.write('GET /session HTTP/1.1\r\nHost: test\r\n\r\n');
    let timer;
    await Promise.race([clientClosed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('relay did not close guarded client')), 1000);
      timer.unref();
    })]);
    clearTimeout(timer);
    assert.equal(received, '');
  } finally {
    client?.destroy();
    await relay.close();
    await new Promise((resolve, reject) => replacement.close((error) => error ? reject(error) : resolve()));
  }
});

test('real child exit closes the relay before a replacement can serve its old port', async () => {
  const child = spawn(process.execPath, ['-e', "const net=require('node:net');const s=net.createServer(()=>{});s.listen(0,'127.0.0.1',()=>process.stdout.write(String(s.address().port)+'\\n'));setInterval(()=>{},1000)"]);
  let relay;
  let replacement;
  let client;
  try {
    const childPort = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('test child did not report its bound port')), 5000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8');
        const newline = output.indexOf('\n');
        if (newline >= 0) {
          clearTimeout(timer);
          resolve(Number(output.slice(0, newline)));
        }
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('test child exited before reporting its port')));
    });
    const identity = await captureProcessIdentity(child.pid);
    relay = await createReservedLoopbackRelay();
    relay.setTarget(childPort, () => isProcessIdentityAlive(identity, child));
    let relayClosed;
    const closeOnExit = closeRelayWhenChildExits(child, relay, (closed) => { relayClosed = closed; });
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await closeOnExit();
    assert.equal(relayClosed, true);

    let replacementReceived = '';
    replacement = net.createServer((socket) => socket.on('data', (chunk) => { replacementReceived += chunk.toString('utf8'); }));
    await new Promise((resolve, reject) => replacement.listen(childPort, '127.0.0.1', resolve).once('error', reject));
    client = net.connect({ host: '127.0.0.1', port: relay.port });
    const refused = new Promise((resolve, reject) => {
      client.once('error', (error) => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
      client.once('connect', () => reject(new Error('closed relay accepted a connection')));
    });
    await refused;
    assert.equal(replacementReceived, '');
  } finally {
    client?.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    if (relay) await relay.close();
    if (replacement?.listening) await new Promise((resolve, reject) => replacement.close((error) => error ? reject(error) : resolve()));
  }
});

test('readiness handshake validates the launched PID and bound port', () => {
  assert.equal(parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 42, port: 51823 }), 42), 51823);
  assert.throws(() => parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 43, port: 51823 }), 42), /launched process/u);
  assert.throws(() => parseServerReadyLine('{not json', 42), /invalid JSON/u);
  assert.throws(() => parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 42, port: 0 }), 42), /invalid bound port/u);
});

test('real UI QA server emits readiness on fd 3 despite startup diagnostics on stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'standalone-ui-qa-server-test-'));
  await chmod(root, 0o700);
  const dataDir = join(root, 'data');
  const relay = await createReservedLoopbackRelay();
  const origin = `http://127.0.0.1:${relay.port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: root,
      TMPDIR: root,
      BOT_DATA_DIR: dataDir,
      UI_QA_PUBLIC_URL: origin,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'ignore', 'pipe'],
  });
  let identity;
  let closeOnExit;
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  try {
    identity = await captureProcessIdentity(child.pid);
    closeOnExit = closeRelayWhenChildExits(child, relay);
    const line = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('child readiness line timed out')), 5000);
      child.stdio[3].on('data', (chunk) => {
        output += chunk.toString('utf8');
        const newline = output.indexOf('\n');
        if (newline >= 0) {
          clearTimeout(timer);
          resolve(output.slice(0, newline));
        }
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('child exited before readiness')));
    });
    const port = parseServerReadyLine(line, child.pid);
    assert.notEqual(port, 0);
    relay.setTarget(port, () => isProcessIdentityAlive(identity, child));
    const response = await fetch(`${origin}/healthz`);
    assert.equal(response.status, 200);
    const logUntil = Date.now() + 2000;
    while (!stdout.includes('"event":"startup"') && Date.now() < logUntil) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(stdout, /"event":"startup"/u);
    assert.equal(isProcessIdentityAlive(identity, child), true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    if (closeOnExit) await closeOnExit();
    else await relay.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('output directory preparation accepts only a fresh or empty location', async () => {
  const root = await mkdtemp(join(tmpdir(), 'standalone-ui-qa-output-test-'));
  const empty = join(root, 'empty');
  const occupied = join(root, 'occupied');
  try {
    await prepareEmptyOutputDir(empty);
    await mkdir(occupied);
    await writeFile(join(occupied, 'old.png'), 'old evidence');
    await assert.rejects(prepareEmptyOutputDir(occupied), /must be empty/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('child liveness guard refuses a process that exited or was signaled', () => {
  assert.doesNotThrow(() => assertChildAlive({ exitCode: null, signalCode: null }, 'test'));
  assert.throws(() => assertChildAlive({ exitCode: 0, signalCode: null }, 'test'), /not alive/u);
  assert.throws(() => assertChildAlive({ exitCode: null, signalCode: 'SIGTERM' }, 'test'), /not alive/u);
});

test('process identity includes Linux start time and detects a different process', async () => {
  const identity = await captureProcessIdentity(process.pid);
  assert.equal(isProcessIdentityAlive(identity, { pid: process.pid, exitCode: null, signalCode: null }), true);
  assert.equal(isProcessIdentityAlive({ ...identity, startTime: 'different' }, { pid: process.pid, exitCode: null, signalCode: null }), false);
});

test('Linux process identity parser exposes zombie and dead states', () => {
  for (const state of ['Z', 'X', 'x']) {
    const fields = Array(20).fill('0');
    fields[0] = state;
    fields[19] = '9988';
    assert.deepEqual(parseLinuxProcessStat(`123 (child (qa)) ${fields.join(' ')}`), { state, startTime: '9988' });
  }
});

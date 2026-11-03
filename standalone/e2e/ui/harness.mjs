import net from 'node:net';
import { readFileSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';

export async function prepareEmptyOutputDir(path) {
  await mkdir(path, { recursive: true });
  if ((await readdir(path)).length !== 0) throw new Error('UI QA output directory must be empty.');
}

export function assertChildAlive(child, phase) {
  if (!child || child.exitCode !== null || child.signalCode !== null)
    throw new Error(`Isolated server process is not alive during ${phase}.`);
}

export async function captureProcessIdentity(pid) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    try {
      const parsed = parseLinuxProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
      if (parsed.startTime && !['Z', 'X', 'x'].includes(parsed.state)) return { pid, startTime: parsed.startTime };
    } catch { /* spawned process may not have entered procfs yet */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Could not capture the isolated server process identity.');
}

export function parseLinuxProcessStat(stat) {
  const fieldsAfterCommand = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u);
  return { state: fieldsAfterCommand[0], startTime: fieldsAfterCommand[19] };
}

export function isProcessIdentityAlive(identity, child) {
  if (!identity || !child || child.pid !== identity.pid || child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(identity.pid, 0);
    const parsed = parseLinuxProcessStat(readFileSync(`/proc/${identity.pid}/stat`, 'utf8'));
    return !['Z', 'X', 'x'].includes(parsed.state) && parsed.startTime === identity.startTime;
  } catch {
    return false;
  }
}

export async function createReservedLoopbackRelay() {
  let targetPort = null;
  let targetAlive = null;
  let closePromise;
  const sockets = new Set();
  const server = net.createServer((client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    if (targetPort === null) {
      client.destroy();
      return;
    }
    if (!targetAlive()) {
      client.destroy();
      return;
    }
    const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    upstream.once('connect', () => {
      if (!targetAlive()) {
        client.destroy();
        upstream.destroy();
        return;
      }
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1', resolveListen).once('error', reject));
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || !Number.isInteger(address.port) || address.port < 1)
    throw new Error('Loopback relay did not receive a valid bound address.');
  return {
    port: address.port,
    setTarget(port, isAlive) {
      if (targetPort !== null) throw new Error('Loopback relay target is already fixed.');
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Child server port is invalid.');
      if (typeof isAlive !== 'function') throw new Error('Child server liveness guard is required.');
      targetPort = port;
      targetAlive = isAlive;
    },
    async close() {
      if (closePromise) return closePromise;
      closePromise = closeRelay();
      return closePromise;
    },
  };

  async function closeRelay() {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

export function closeRelayWhenChildExits(child, relay, onClosed = () => {}) {
  let closing;
  const close = () => {
    closing ??= relay.close().then(() => onClosed(true), (error) => {
      onClosed(false);
      throw error;
    });
    return closing;
  };
  child.once('exit', () => { void close().catch(() => undefined); });
  if (child.exitCode !== null || child.signalCode !== null) void close().catch(() => undefined);
  return close;
}

export function parseServerReadyLine(line, expectedPid) {
  let record;
  try { record = JSON.parse(line); }
  catch { throw new Error('Child server readiness channel returned invalid JSON.'); }
  if (!record || record.event !== 'ready' || record.pid !== expectedPid || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535)
    throw new Error('Child server readiness record did not match its launched process.');
  return record.port;
}

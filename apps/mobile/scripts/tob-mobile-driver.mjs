import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { argsOf, privateFile } from './tob-uat-session.mjs';

export function fixtureExpression(mode, state) {
  if (!['inject', 'checkpoint', 'signed-out'].includes(mode) || state.config.environment !== 'uat')
    throw Error('UAT_FIXTURE_REQUIRED');
  return `(async () => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) throw Error('DEBUG_ONLY');
    const modules = [...globalThis.__r.getModules().values()];
    const matches = modules.filter(m => m.isInitialized && m.publicModule?.exports?.cloudClient?.getSnapshot);
    if (matches.length !== 1) throw Error('CLOUD_MODULE_AMBIGUOUS');
    const client = matches[0].publicModule.exports.cloudClient;
    await client.load();
    if (client.getSnapshot().busy) throw Error('SESSION_BUSY');
    const expected = ${JSON.stringify({ config: state.config, userId: state.userId, ...(mode === 'inject' ? { accessToken: state.accessToken, refreshToken: state.refreshToken } : {}) })};
    const vault = JSON.parse(await client.rt.read());
    if (vault.version !== 1 || !Array.isArray(vault.entries)) throw Error('INVALID_VAULT');
    const stable = v => v && typeof v === 'object' ? Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
    const entries = vault.entries.filter(e => e.config.instanceId === expected.config.instanceId);
    if (entries.length !== 1 || JSON.stringify(stable(entries[0].config)) !== JSON.stringify(stable(expected.config))) throw Error('TRUSTED_IMPORT_REQUIRED');
    const entry = entries[0];
    if (${JSON.stringify(mode)} === 'inject') {
      if (entry.session) throw Error('EXISTING_SESSION_REFUSED');
      entry.session = { accessToken: expected.accessToken, refreshToken: expected.refreshToken, userId: expected.userId };
      await client.rt.write(JSON.stringify(vault));
      return { injected: true, restartRequired: true };
    }
    if (${JSON.stringify(mode)} === 'signed-out') {
      if (entry.session || client.getSnapshot().rows.some(r => r.config.instanceId === expected.config.instanceId && r.hasSession)) throw Error('LOCAL_SESSION_REMAINS');
      return { signedOut: true, configRetained: true };
    }
    const row = client.getSnapshot().rows.find(r => r.config.instanceId === expected.config.instanceId);
    if (!entry.session || row?.identity?.userId !== expected.userId || row.identity.instanceRole !== 'admin') throw Error('VERIFIED_NATIVE_IDENTITY_REQUIRED');
    return { accessToken: entry.session.accessToken, refreshToken: entry.session.refreshToken };
  })()`;
}
async function connect(port, targetId) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_METRO_PORT');
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  ).json();
  const target = targets.find((t) => t.id === targetId);
  if (!target) throw Error('EXPLICIT_INSPECTOR_TARGET_REQUIRED');
  const url = new URL(target.webSocketDebuggerUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== String(port) ||
    url.protocol !== 'ws:'
  )
    throw Error('LOOPBACK_DEBUGGER_REQUIRED');
  url.hostname = '127.0.0.1';
  const WebSocket = createRequire(import.meta.url)('ws');
  const ws = new WebSocket(url, { origin: `http://127.0.0.1:${port}` });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const r = JSON.parse(String(raw));
    const p = pending.get(r.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(r.id);
    if (r.error || r.result?.exceptionDetails) p.reject(Error('INSPECTOR_EVALUATION_FAILED'));
    else p.resolve(r.result);
  });
  ws.on('close', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('INSPECTOR_CLOSED'));
    }
    pending.clear();
  });
  return {
    send: (method, params) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        const timer = setTimeout(() => {
          pending.delete(n);
          reject(Error('INSPECTOR_TIMEOUT'));
        }, 20000);
        pending.set(n, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    close: () => ws.close(),
  };
}
export async function main(mode, args) {
  const state = JSON.parse(privateFile(args.session));
  const sims = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }),
  );
  if (
    !Object.values(sims.devices)
      .flat()
      .some((d) => d.udid === args.simulator && d.state === 'Booted')
  )
    throw Error('ASSIGNED_SIMULATOR_REQUIRED');
  const c = await connect(Number(args.metro), args.target);
  try {
    const r = await c.send('Runtime.evaluate', {
      expression: fixtureExpression(mode, state),
      awaitPromise: true,
      returnByValue: true,
    });
    const result = r.result.value;
    if (mode === 'checkpoint') {
      if (!result?.accessToken || !result.refreshToken) throw Error('NATIVE_SESSION_REQUIRED');
      const sid = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url')).sid;
      if (sid !== state.sid) throw Error('SESSION_IDENTITY_CHANGED');
      const hash = createHash('sha256').update(result.refreshToken).digest('hex');
      const previous = createHash('sha256').update(state.refreshToken).digest('hex');
      writeFileSync(args.session, JSON.stringify({ ...state, ...result, checkpoint: true }), {
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          event: 'native_checkpoint',
          verifiedAdmin: true,
          sameSession: true,
          refreshChangedSinceCheckpoint: hash !== previous,
        }),
      );
    } else console.log(JSON.stringify({ event: 'native_fixture', ...result }));
  } finally {
    c.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], argsOf(process.argv.slice(3))).catch((error) => {
    console.error(
      JSON.stringify({
        event: 'native_fixture_failed',
        code: /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED',
      }),
    );
    process.exitCode = 1;
  });
}

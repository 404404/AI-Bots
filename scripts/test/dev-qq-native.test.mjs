import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeQqOperation,
  qqConnectionRequest,
  qqIdentity,
  readQqCredential,
  strictQqSshArguments,
} from '../dev-qq-native.mjs';

const directories = [];
const appId = '100001';
const identity = qqIdentity(appId);
const input = {
  appId,
  botId: identity.botId,
  host: 'http://127.0.0.1:31971',
  tokenFile: '/synthetic/token',
  connect: true,
  appSecret: 'SYNTHETIC_QQ_SECRET',
};
const connected = {
  bots: [
    { botId: identity.botId, connected: true, state: 'connected', ignoredSecret: input.appSecret },
  ],
};
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'bh-qq-native-'));
  directories.push(home);
  mkdirSync(join(home, 'integrations/dsh-qq'), { recursive: true });
  writeFileSync(
    join(home, 'integrations/dsh-qq/config.json'),
    JSON.stringify({ bots: [{ appId, ...identity }] }),
  );
  writeFileSync(
    join(home, '.credentials.yaml'),
    `refs:\n  ${identity.secretRef}: SYNTHETIC_QQ_SECRET\n  UNRELATED: NEVER_COPY\n`,
    { mode: 0o600 },
  );
  return home;
}
function carrier(initial = { bots: [] }, refusal = false) {
  const operations = [];
  const fetcher = vi.fn(async (url, init) => {
    if (new URL(url).pathname === '/')
      return new Response(null, {
        status: 302,
        headers: { 'set-cookie': 'owner=SYNTHETIC_COOKIE; HttpOnly', location: '/' },
      });
    const envelope = JSON.parse(init.body);
    operations.push(envelope);
    return Response.json({
      type: 'server-response',
      rpcId: envelope.rpcId,
      result: refusal
        ? { ok: false, error: { message: input.appSecret } }
        : {
            ok: true,
            value: envelope.payload.method === 'connection.status' ? initial : connected,
          },
    });
  });
  return { fetcher, operations };
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
describe('selected native QQ authorization reuse', () => {
  it('selects only the App-specific native credential without writing either Profile', () => {
    const home = fixture();
    const before = readFileSync(join(home, '.credentials.yaml'), 'utf8');
    expect(readQqCredential(home, appId, true)).toBe(input.appSecret);
    expect(readFileSync(join(home, '.credentials.yaml'), 'utf8')).toBe(before);
    expect(() => readQqCredential(home, appId, false)).toThrow('source receiver');
    expect(() => readQqCredential(home, '100002', true)).toThrow('identity');
    mkdirSync(join(home, 'botharness.writer.json'));
    expect(() => readQqCredential(home, appId, true)).toThrow('writer record');
  });
  it('refuses mismatched identity and hides malformed YAML contents', () => {
    const home = fixture();
    writeFileSync(
      join(home, 'integrations/dsh-qq/config.json'),
      JSON.stringify({ bots: [{ appId, ...identity, secretRef: 'UNRELATED' }] }),
    );
    expect(() => readQqCredential(home, appId, true)).toThrow('identity');
    writeFileSync(join(home, '.credentials.yaml'), '[SYNTHETIC_QQ_SECRET');
    expect(() => readQqCredential(home, appId, true)).toThrow('Cannot read');
  });
  it('uses Owner authentication and qualified management envelopes, returning no credential material', async () => {
    const { fetcher, operations } = carrier();
    const result = await nativeQqOperation(input, fetcher, async () => 'SYNTHETIC_TOKEN');
    expect(result).toEqual({
      configured: true,
      connected: true,
      state: 'connected',
      botId: identity.botId,
    });
    expect(operations.map((value) => value.payload.method)).toEqual([
      'connection.status',
      'bot.bind-credentials',
    ]);
    expect(operations[1]).toMatchObject({
      method: 'dsh-im/qq',
      payload: { payload: { appId, appSecret: input.appSecret } },
    });
    expect(fetcher.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|TOKEN|COOKIE|NEVER_COPY/u);
  });
  it('reuses an existing native authorization without replacing it', async () => {
    const { fetcher, operations } = carrier(connected);
    await nativeQqOperation(input, fetcher, async () => 'SYNTHETIC_TOKEN');
    expect(operations).toHaveLength(1);
  });
  it('refuses another App and exposes only a fixed failure when Provider errors contain secrets', async () => {
    const other = carrier({ bots: [{ botId: 'other' }] });
    await expect(nativeQqOperation(input, other.fetcher, async () => 'token')).rejects.toThrow(
      'qq-target-has-another-app',
    );
    expect(other.operations).toHaveLength(1);
    const refused = carrier({ bots: [] }, true);
    await expect(nativeQqOperation(input, refused.fetcher, async () => 'token')).rejects.toThrow(
      'qq-provider-request-refused',
    );
    expect(refused.operations).toHaveLength(1);
  });
  it('rejects non-loopback targets before reading or sending credentials', async () => {
    const fetcher = vi.fn();
    const readToken = vi.fn();
    await expect(
      nativeQqOperation({ ...input, host: 'https://example.com' }, fetcher, readToken),
    ).rejects.toThrow('invalid-loopback');
    expect(readToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires the selected home token and verified strict SSH with no secrets in argv', () => {
    const home = fixture();
    expect(() =>
      qqConnectionRequest(
        { appId, home, location: 'local' },
        { port: 31971, tokenFile: join(home, '../other-token') },
      ),
    ).toThrow('claimed DSH home');
    expect(() =>
      qqConnectionRequest(
        { appId, home: '/qa', location: 'remote' },
        { port: 31971, tokenFile: '/qa/../other-token' },
      ),
    ).toThrow('claimed DSH home');
    const key = join(home, 'synthetic-key');
    const hosts = join(home, 'synthetic-hosts');
    writeFileSync(key, 'synthetic');
    writeFileSync(hosts, 'synthetic');
    const args = strictQqSshArguments(
      { host: 'example.test', user: 'test', identityFile: key, knownHostsFile: hosts },
      '/opt/task/bin/node',
    );
    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args).toContain('BatchMode=yes');
    expect(args.join(' ')).not.toMatch(/SYNTHETIC_QQ_SECRET|SYNTHETIC_TOKEN/u);
    expect(() =>
      strictQqSshArguments(
        { host: '-oProxyCommand=bad', user: 'test', identityFile: key, knownHostsFile: hosts },
        '/opt/task/bin/node',
      ),
    ).toThrow('Invalid');
  });
});

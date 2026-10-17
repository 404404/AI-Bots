import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPairedDeviceCommand } from '../src/bots/cli-devices.js';
import { parseAgentDevices } from '../src/bots/cli-agent-devices.js';
import { deviceIdentity } from '../src/devices/views.js';
const device = { id: 'paired-device-1', name: 'QA phone', pairedAt: '2026-10-18T00:00:00Z' };
function fixture() {
  const calls: unknown[] = [];
  const connect = async () => ({
    http: async (path: string, body?: unknown) => {
      calls.push({ path, body });
      const value = path.endsWith('/offer')
        ? {
            receiptId: 'safe-receipt',
            link: 'deepseekbot://pair?p=confidential',
            expiresAt: '2026-10-18T01:00:00Z',
            reachable: false,
          }
        : path.endsWith('/revoke')
          ? { revoked: true, closedStreams: 1 }
          : path.includes('/offer-status')
            ? { receiptId: 'safe-receipt', status: 'expired', credential: 'never-output' }
            : {
                host: { id: 'host', name: 'QA Host' },
                devices: [{ ...device, credential: 'never-output' }],
                routes: { routes: [], tailscale: 'missing', serveCommand: 'diagnostic-only' },
              };
      return { bytes: Buffer.from(JSON.stringify(value)), response: Response.json(value) };
    },
  });
  return { connect, calls };
}
describe('paired device CLI', () => {
  it('projects safe device identities and reports route failures explicitly', async () => {
    const f = fixture();
    const listed = await runPairedDeviceCommand('devices', [], {}, f.connect);
    expect(listed).toMatchObject({ devices: [{ identity: deviceIdentity(device) }] });
    expect(JSON.stringify(listed)).not.toContain('never-output');
    expect(await runPairedDeviceCommand('device-routes', [], {}, f.connect)).toMatchObject({
      tailscale: 'missing',
    });
    const status = await runPairedDeviceCommand(
      'device-offer-status',
      ['safe-receipt'],
      {},
      f.connect,
    );
    expect(status).toMatchObject({ status: 'expired' });
    expect(JSON.stringify(status)).not.toContain('never-output');
  });
  it('writes the link exclusively to a new private file and prints only a safe receipt', async () => {
    const f = fixture(),
      dir = mkdtempSync(join(tmpdir(), 'device-cli-')),
      out = join(dir, 'offer.json');
    const value = await runPairedDeviceCommand('device-offer', [], { out }, f.connect);
    expect(JSON.stringify(value)).not.toContain('confidential');
    expect(JSON.stringify(value)).not.toContain('deepseekbot://');
    expect(readFileSync(out, 'utf8')).toContain('confidential');
    expect(statSync(out).mode & 0o777).toBe(0o600);
    writeFileSync(out, 'keep');
    await expect(
      runPairedDeviceCommand('device-offer', [], { out }, f.connect),
    ).rejects.toMatchObject({ code: 'protected-output-unavailable' });
    expect(readFileSync(out, 'utf8')).toBe('keep');
    expect(f.calls).toHaveLength(1);
  });
  it('refuses unclear revocation before contacting the Host', async () => {
    const f = fixture();
    await expect(
      runPairedDeviceCommand('device-revoke', [device.id], {}, f.connect),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(f.calls).toHaveLength(0);
    await runPairedDeviceCommand(
      'device-revoke',
      [device.id],
      { confirm: true, 'expected-device': deviceIdentity(device) },
      f.connect,
    );
    expect(f.calls).toEqual([
      {
        path: '/api/botharness/devices/revoke',
        body: { deviceId: device.id, expectedDevice: deviceIdentity(device) },
      },
    ]);
  });
  it('forbids model-visible local output and admin authority overrides', () => {
    expect(parseAgentDevices('device-offer', [], {})).toMatchObject({ write: true, args: {} });
    for (const values of [
      { out: '/tmp/link' },
      { host: 'http://host' },
      { 'token-file': '/tmp/token' },
    ])
      expect(() => parseAgentDevices('device-offer', [], values)).toThrow(
        expect.objectContaining({ code: 'agent-scope-denied' }),
      );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createTobImSetupOperations } from '../src/tob/cli-im-setup-operations.js';
import { parseAgentImSetup } from '../src/bots/cli-agent-im-setup.js';
import { TobError } from '../src/tob/service.js';

function fixture() {
  let owner = 'human-one:tob-one:incarnation-one';
  let time = Date.now();
  let state = 'pending';
  let responseFailure = false;
  const nativeId = 'native-attempt-private-reference';
  const secret = 'private-qr-sentinel';
  const descriptor = {
    version: 1 as const,
    platform: 'weixin' as const,
    providerId: 'dsh-im/weixin',
    endpoint: 'dsh-im/app-setup' as const,
    kind: 'qr' as const,
  };
  const calls: string[] = [];
  const apps = vi.fn(async () => ({ apps: [], setups: [descriptor] }));
  const native = vi.fn(async (request: Request) => {
    expect(request.url).toBe('http://localhost/api/dsh-im/app-setup');
    expect(request.method).toBe('POST');
    expect(request.headers.get('host')).toBe('localhost');
    expect(request.headers.get('authorization')).toBeNull();
    const envelope = await request.json();
    expect(envelope.method).toBe('dsh-im/app-setup');
    expect(Object.keys(envelope.payload).sort()).toEqual(['method', 'payload']);
    const method = envelope.payload.method;
    calls.push(method);
    if (method === 'setup.start') expect(envelope.payload.payload).toEqual({ channel: 'weixin' });
    else expect(envelope.payload.payload).toEqual({ attemptId: nativeId });
    if (method === 'setup.cancel' && state !== 'ready') state = 'cancelled';
    const result = responseFailure
      ? {
          ok: false,
          error: { code: 'arbitrary-error', message: secret, details: { qrDataUrl: secret } },
        }
      : {
          ok: true,
          value: {
            version: 1,
            attemptId: nativeId,
            channel: 'weixin',
            state,
            expiresAt: time + 60_000,
            qrDataUrl: 'data:image/png;base64,' + Buffer.from(secret).toString('base64'),
            next: secret,
            password: secret,
            ...(state === 'ready'
              ? {
                  accountRef: 'account-one',
                  description: {
                    version: 1,
                    channel: 'weixin',
                    botId: 'account-one',
                    connected: true,
                    account: { fingerprint: 'a'.repeat(64), name: secret },
                  },
                }
              : {}),
          },
        };
    return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result });
  });
  const service = createTobImSetupOperations({ apps, owner: () => owner, native, now: () => time });
  const read = async (command: string, target?: string) => {
    const operation = (await service.prepare(command, target ? { target } : {}))!;
    return (await operation.run(() => {})) as Record<string, unknown>;
  };
  const start = async () => {
    const before = await read('im-apps');
    const operation = (await service.prepare('im-authorize', {
      target: 'weixin',
      expectedState: before.stateFingerprint,
    }))!;
    expect(operation.proposal).toMatchObject({ command: 'im-authorize', requireHumanReview: true });
    return (await operation.run(() => {})) as {
      receiptId: string;
      stateFingerprint: string;
      platform: string;
      state: string;
      expiresAt: number;
    };
  };
  return {
    service,
    start,
    read,
    calls,
    native,
    secret,
    nativeId,
    setState: (value: string) => {
      state = value;
    },
    setOwner: (value: string) => {
      owner = value;
    },
    expire: () => {
      time += 600_000;
    },
    fail: () => {
      responseFailure = true;
    },
  };
}

describe('Tob reuses the qualified native setup owner', () => {
  it('starts once with Human review and returns only an owned opaque receipt; Human resumes that exact attempt', async () => {
    const f = fixture();
    const started = await f.start();
    expect(started).toMatchObject({
      state: 'pending',
      platform: 'weixin',
      handoff: 'applications-settings',
    });
    expect(started.receiptId).not.toBe(f.nativeId);
    const status = await f.read('pairing-status', started.receiptId);
    const listing = await f.read('im-apps');
    for (const result of [started, status, listing]) {
      expect(JSON.stringify(result)).not.toContain(f.secret);
      expect(JSON.stringify(result)).not.toContain(f.nativeId);
      expect(JSON.stringify(result)).not.toContain('qrDataUrl');
      expect(JSON.stringify(result)).not.toContain('next');
    }
    expect(await f.service.resume(started.receiptId)).toMatchObject({
      attemptId: f.nativeId,
      descriptor: { platform: 'weixin' },
      receipt: { receiptId: started.receiptId },
    });
    expect(f.calls.filter((method) => method === 'setup.start')).toHaveLength(1);
    await expect(f.start()).rejects.toThrow('setup-already-pending');
  });

  it('refuses unknown or foreign receipts before native status calls and invalidates expired references', async () => {
    const f = fixture();
    await expect(f.service.prepare('pairing-status', { target: f.nativeId })).rejects.toThrow(
      'setup-unknown-receipt',
    );
    expect(f.calls).toEqual([]);
    const started = await f.start();
    f.setOwner('different-human');
    const count = f.calls.length;
    await expect(f.service.resume(started.receiptId)).rejects.toThrow('setup-owner-changed');
    expect(f.calls).toHaveLength(count);
    f.setOwner('human-one:tob-one:incarnation-one');
    f.expire();
    await expect(
      f.service.prepare('pairing-status', { target: started.receiptId }),
    ).rejects.toThrow('setup-expired');
    expect(f.calls).toHaveLength(count);
  });

  it('binds cancellation to the owned platform and freshly observed native state', async () => {
    const f = fixture();
    const started = await f.start();
    const operation = (await f.service.prepare('im-cancel', {
      target: started.receiptId,
      expectedState: started.stateFingerprint,
    }))!;
    expect(operation.proposal).toMatchObject({
      requireHumanReview: true,
      patch: { platform: 'weixin', cancelled: true },
    });
    f.setState('scanned');
    await expect(operation.run(() => {})).rejects.toThrow('stale-policy');
    expect(f.calls).not.toContain('setup.cancel');
    const current = await f.read('pairing-status', started.receiptId);
    const cancel = (await f.service.prepare('im-cancel', {
      target: started.receiptId,
      expectedState: current.stateFingerprint,
    }))!;
    expect(await cancel.run(() => {})).toMatchObject({
      receiptId: started.receiptId,
      state: 'cancelled',
    });
    expect(f.calls.filter((method) => method === 'setup.cancel')).toHaveLength(1);
    expect(await f.read('pairing-status', started.receiptId)).toMatchObject({
      receiptId: started.receiptId,
      state: 'cancelled',
    });
  });

  it('rechecks authority around asynchronous calls and scrubs arbitrary Provider errors', async () => {
    const f = fixture();
    const started = await f.start();
    const status = (await f.service.prepare('pairing-status', { target: started.receiptId }))!;
    let checks = 0;
    await expect(
      status.run(() => {
        if (++checks > 2) throw new TobError('agent-context-expired');
      }),
    ).rejects.toThrow('agent-context-expired');
    f.fail();
    let error: unknown;
    try {
      await status.run(() => {});
    } catch (failure) {
      error = failure;
    }
    expect(error).toMatchObject({ code: 'setup-failed', message: 'setup-failed' });
    expect(String(error)).not.toContain(f.secret);
    expect(await f.service.prepare('im-credentials', {})).toBeUndefined();
    expect(
      await f.service.prepare('im-setup-resume', { target: started.receiptId }),
    ).toBeUndefined();
  });

  it('refuses absent Providers instead of inventing setup capability', async () => {
    const native = vi.fn();
    const service = createTobImSetupOperations({
      apps: async () => ({ apps: [], setups: [] }),
      owner: () => 'human',
      native,
    });
    const current = (await (await service.prepare('im-apps', {}))!.run(() => {})) as {
      stateFingerprint: string;
    };
    await expect(
      service.prepare('im-authorize', {
        target: 'weixin',
        expectedState: current.stateFingerprint,
      }),
    ).rejects.toThrow('capability-unavailable');
    expect(native).not.toHaveBeenCalled();
  });
});

it('admits exact scoped nonsecret setup syntax and refuses credential/transport overrides', () => {
  expect(parseAgentImSetup('pairing-status', ['owned-receipt'], {})).toMatchObject({
    write: false,
    args: { target: 'owned-receipt' },
  });
  expect(() =>
    parseAgentImSetup('im-authorize', ['weixin'], {
      'expected-state': 'a'.repeat(64),
      'credentials-stdin': true,
    }),
  ).toThrow();
  expect(() => parseAgentImSetup('pairing-status', ['owned-receipt'], { wait: true })).toThrow();
  expect(parseAgentImSetup('im-verify', [], {})).toBeUndefined();
});

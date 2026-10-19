import { afterEach, describe, it, expect, vi } from 'vitest';
import { createAppearanceControl } from '../src/appearance/control.js';
const request = (body: unknown) =>
  new Request('http://localhost/api/botharness/appearance-control', {
    method: 'POST',
    body: JSON.stringify(body),
  });
afterEach(() => vi.useRealTimers());
describe('explicit Client appearance delivery', () => {
  it('delivers only to the selected leased Client, relays storage refusal, and drops targets on disposal', async () => {
    const host = createAppearanceControl();
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    const b = await (await host.fetch(request({ action: 'register', platform: 'desktop' }))).json();
    const ap = host.fetch(request({ action: 'poll', ...a }));
    const bp = host.fetch(request({ action: 'poll', ...b }));
    await Promise.resolve();
    const result = host.fetch(
      request({
        action: 'request',
        clientId: a.clientId,
        patch: { preference: 'dark' },
        expectedRevision: 'initial',
      }),
    );
    const { command } = await (await ap).json();
    expect(command.patch).toEqual({ preference: 'dark' });
    await host.fetch(
      request({
        action: 'reply',
        ...a,
        requestId: command.id,
        result: { error: { code: 'appearance-storage-unavailable' } },
      }),
    );
    expect((await result).status).toBe(409);
    host.dispose();
    expect(await (await bp).json()).toEqual({ command: null });
    expect(await (await host.fetch(new Request('http://localhost'))).json()).toEqual({
      clients: [],
    });
  });
  it('refuses missing, stale, unavailable and wrong-token targets', async () => {
    const host = createAppearanceControl();
    expect((await host.fetch(request({ action: 'request' }))).status).toBe(400);
    expect((await host.fetch(request({ action: 'request', clientId: 'old' }))).status).toBe(404);
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    expect((await host.fetch(request({ action: 'request', clientId: a.clientId }))).status).toBe(
      409,
    );
    expect((await host.fetch(request({ action: 'poll', ...a, token: 'wrong' }))).status).toBe(403);
    expect(
      (
        await host.fetch(
          request({ action: 'request', clientId: a.clientId, patch: { preference: 'dark' } }),
        )
      ).status,
    ).toBe(400);
    host.dispose();
  });
  it('expires unacknowledged commands and rejects late replies without replaying', async () => {
    vi.useFakeTimers();
    const host = createAppearanceControl();
    const a = await (await host.fetch(request({ action: 'register', platform: 'web' }))).json();
    const poll = host.fetch(request({ action: 'poll', ...a }));
    await Promise.resolve();
    const result = host.fetch(request({ action: 'request', clientId: a.clientId }));
    const { command } = await (await poll).json();
    await vi.advanceTimersByTimeAsync(8001);
    expect((await (await result).json()).error.code).toBe('appearance-client-timeout');
    expect(
      (
        await host.fetch(
          request({ action: 'reply', ...a, requestId: command.id, result: { snapshot: {} } }),
        )
      ).status,
    ).toBe(409);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await (await host.fetch(new Request('http://localhost'))).json()).toEqual({
      clients: [],
    });
    host.dispose();
  });
});

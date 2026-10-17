import { expect, it, vi } from 'vitest';
import {
  createClientPreferenceHandlers,
  createClientTarget,
  mountClientControl,
} from '../src/client/client-control.js';
import {
  mountNotificationPreferenceSync,
  DESKTOP_NOTIFICATIONS_KEY,
  DesktopNotificationPrefs,
  type DesktopNotificationApi,
} from '../src/client/desktop-notifications.js';
function fixture(permission: 'granted' | 'denied' | 'default' | 'unsupported' = 'granted') {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const request = vi.fn(async () => 'granted' as const);
  const api: DesktopNotificationApi | undefined =
    permission === 'unsupported'
      ? undefined
      : { permission: () => permission, requestPermission: request, show: vi.fn() };
  const notifications = new DesktopNotificationPrefs(storage, api, async (run) => await run());
  const handlers = createClientPreferenceHandlers({
    readTheme: () => 'system',
    readLocale: () => 'en',
    notifications,
  });
  const read = () =>
    handlers.get('preferences')!({}) as { stateFingerprint: string; value: unknown };
  return { values, storage, api, notifications, handlers, read, request };
}
it('retains one target identity per tab while replacing its generation', () => {
  const f = fixture();
  const a = createClientTarget(f.storage),
    b = createClientTarget(f.storage);
  expect(a.clientId).toBe(b.clientId);
  expect(a.generation).not.toBe(b.generation);
});
it('uses the existing local owner and survives restart without changing a second context', async () => {
  const a = fixture(),
    b = fixture();
  a.values.set('unrelated', 'keep');
  await a.handlers.get('preferences-set')!({
    scope: 'browser-origin',
    expectedState: a.read().stateFingerprint,
    patch: { notifications: true },
  });
  expect(a.values.get(DESKTOP_NOTIFICATIONS_KEY)).toBe('on');
  expect(a.values.get('unrelated')).toBe('keep');
  expect(new DesktopNotificationPrefs(a.storage, a.api).getSnapshot().enabled).toBe(true);
  expect(b.notifications.getSnapshot().enabled).toBe(false);
  expect(b.values.size).toBe(0);
});
it('refuses stale UI state, shared Host controls and multi-field partial writes', async () => {
  const f = fixture();
  const old = f.read().stateFingerprint;
  await f.notifications.setEnabled(true);
  await expect(
    f.handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: old,
      patch: { notifications: false },
    }),
  ).rejects.toThrow('stale-client-preferences');
  await expect(
    f.handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: f.read().stateFingerprint,
      patch: { theme: 'dark' },
    }),
  ).rejects.toThrow('host-scope-required');
  await expect(
    f.handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: f.read().stateFingerprint,
      patch: { notifications: false, locale: 'en' },
    }),
  ).rejects.toThrow('one-preference-required');
  expect(f.notifications.getSnapshot().enabled).toBe(true);
});
it.each(['default', 'denied', 'unsupported'] as const)(
  'reports %s permission without claiming granted or invoking a background permission prompt',
  async (permission) => {
    const f = fixture(permission);
    const result = await f.handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: f.read().stateFingerprint,
      patch: { notifications: true },
    });
    expect(result).toMatchObject({
      changed: false,
      outcome: permission === 'default' ? 'permission-pending' : `permission-${permission}`,
    });
    expect(f.notifications.getSnapshot().enabled).toBe(false);
    expect(f.request).not.toHaveBeenCalled();
  },
);

it('reports unavailable persistence and never requests permission if the OS state changes during a CLI write', async () => {
  let reads = 0;
  const requestPermission = vi.fn(async () => 'granted' as const);
  const notifications = new DesktopNotificationPrefs(
    undefined,
    {
      permission: () => (++reads < 4 ? 'granted' : 'default'),
      requestPermission,
      show: vi.fn(),
    },
    async (run) => await run(),
  );
  const handlers = createClientPreferenceHandlers({
    readTheme: () => 'system',
    readLocale: () => 'en',
    notifications,
  });
  const before = (await handlers.get('preferences')!({})) as { stateFingerprint: string };
  await expect(
    handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: before.stateFingerprint,
      patch: { notifications: true },
    }),
  ).rejects.toThrow('stale-client-preferences');
  expect(requestPermission).not.toHaveBeenCalled();
});

it('serializes UI and scoped writes across two owners and rejects an old review after a peer edit', async () => {
  const f = fixture();
  let tail = Promise.resolve();
  const lock = (run: () => Promise<void>): Promise<void> => {
    const next = tail.then(run);
    tail = next.catch(() => {});
    return next;
  };
  const a = new DesktopNotificationPrefs(f.storage, f.api, lock);
  const b = new DesktopNotificationPrefs(f.storage, f.api, lock);
  const handlers = createClientPreferenceHandlers({
    readTheme: () => 'system',
    readLocale: () => 'en',
    notifications: a,
  });
  const old = (await handlers.get('preferences')!({})) as { stateFingerprint: string };
  let release!: () => void;
  const held = lock(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  const ui = b.setEnabled(true);
  const scoped = handlers.get('preferences-set')!({
    scope: 'browser-origin',
    expectedState: old.stateFingerprint,
    patch: { notifications: false },
  });
  const stale = expect(scoped).rejects.toThrow('stale-client-preferences');
  release();
  await held;
  await ui;
  await stale;
  expect(f.values.get(DESKTOP_NOTIFICATIONS_KEY)).toBe('on');
  expect(await handlers.get('preferences')!({})).toMatchObject({
    value: { notifications: { enabled: true } },
  });
});
it('reconciles peer-tab storage events through the same notification owner', async () => {
  const f = fixture();
  const events = new EventTarget();
  const stop = mountNotificationPreferenceSync(f.notifications, events as unknown as Window);
  const changed = vi.fn();
  const unsubscribe = f.notifications.subscribe(changed);
  f.values.set(DESKTOP_NOTIFICATIONS_KEY, 'on');
  events.dispatchEvent(Object.assign(new Event('storage'), { key: DESKTOP_NOTIFICATIONS_KEY }));
  expect(f.notifications.getSnapshot().enabled).toBe(true);
  expect(changed).toHaveBeenCalledOnce();
  stop();
  unsubscribe();
});
it('refuses scoped CAS without a shared browser lock while ordinary UI still uses its owner', async () => {
  const f = fixture();
  const notifications = new DesktopNotificationPrefs(f.storage, f.api, undefined);
  const handlers = createClientPreferenceHandlers({
    readTheme: () => 'system',
    readLocale: () => 'en',
    notifications,
  });
  const before = (await handlers.get('preferences')!({})) as { stateFingerprint: string };
  await expect(
    handlers.get('preferences-set')!({
      scope: 'browser-origin',
      expectedState: before.stateFingerprint,
      patch: { notifications: true },
    }),
  ).rejects.toThrow('client-concurrency-unavailable');
  await notifications.setEnabled(true);
  expect(notifications.getSnapshot().enabled).toBe(true);
});

it('keeps the visible owner value when local persistence refuses a write', async () => {
  const f = fixture();
  const storage = {
    getItem: f.storage.getItem,
    setItem: () => {
      throw new Error('quota');
    },
  };
  const notifications = new DesktopNotificationPrefs(storage, f.api, async (run) => await run());
  await expect(notifications.setEnabled(true)).rejects.toThrow('client-persistence-unavailable');
  expect(notifications.getSnapshot().enabled).toBe(false);
});

it('aborts queued application when its Client mount is disposed before replacement registration', async () => {
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let polled = false,
    applied = false,
    authorizations = 0;
  const call: import('../src/client/bridge.js').BridgeCall = async (_method, args) => {
    if (args.action === 'poll') {
      const commands = polled
        ? []
        : [
            {
              id: 'test-command',
              operation: 'blocked-set',
              args: {},
              expiresAt: Date.now() + 10_000,
            },
          ];
      polled = true;
      return { ok: true, value: { commands } };
    }
    if (args.action === 'authorize') authorizations++;
    return { ok: true, value: { accepted: true } };
  };
  const stop = mountClientControl({
    call,
    kind: 'web',
    target: { clientId: 'client-test', generation: 'generation-test' },
    handlers: new Map([
      [
        'blocked-set',
        async (_args, context) => {
          entered();
          await blocked;
          await context!.authorize();
          applied = true;
        },
      ],
    ]),
  });
  await started;
  stop();
  release();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(applied).toBe(false);
  expect(authorizations).toBe(1);
});

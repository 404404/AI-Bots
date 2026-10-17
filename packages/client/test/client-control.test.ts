import { expect, it, vi } from 'vitest';
import {
  createClientPreferenceHandlers,
  createClientTarget,
} from '../src/client/client-control.js';
import {
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
  const notifications = new DesktopNotificationPrefs(storage, api);
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
  const notifications = new DesktopNotificationPrefs(undefined, {
    permission: () => (++reads < 4 ? 'granted' : 'default'),
    requestPermission,
    show: vi.fn(),
  });
  const handlers = createClientPreferenceHandlers({
    readTheme: () => 'system',
    readLocale: () => 'en',
    notifications,
  });
  const before = (await handlers.get('preferences')!({})) as { stateFingerprint: string };
  const result = await handlers.get('preferences-set')!({
    scope: 'browser-origin',
    expectedState: before.stateFingerprint,
    patch: { notifications: true },
  });
  expect(result).toMatchObject({
    outcome: 'permission-pending',
    changed: false,
    persistence: 'unavailable',
  });
  expect(requestPermission).not.toHaveBeenCalled();
});

import { afterEach, expect, it, vi } from 'vitest';
import { ClientControlService } from '../src/client-control/service.js';
import { createTobClientPreferenceOperations } from '../src/tob/cli-client-preferences.js';
import { parseClientPreferences } from '../src/bots/cli-client-preferences.js';
import type { BotCreateCliIo } from '../src/bots/bot-create-cli.js';
const a = { clientId: 'client-aaa', generation: 'generation-aaa' };
const b = { clientId: 'client-bbb', generation: 'generation-bbb' };
const services: ClientControlService[] = [];
function fixture() {
  const owner = new ClientControlService();
  services.push(owner);
  return owner;
}
afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  vi.useRealTimers();
});
it('requires an explicit live incarnation and routes to one Client', async () => {
  const service = fixture();
  expect(() => service.require(a)).toThrow('no-connected-client');
  service.register(a, 'web');
  service.register(b, 'web');
  const read = service.request(a, 'preferences', {});
  expect(service.poll(b).commands).toEqual([]);
  const command = service.poll(a).commands[0]!;
  service.complete(a, command.id, { ok: true, value: { selected: 'a' } });
  await expect(read).resolves.toEqual({ selected: 'a' });
  expect(service.poll(a).commands).toEqual([]);
  const newer = { ...a, generation: 'generation-new' };
  service.register(newer, 'web');
  expect(() => service.require(a)).toThrow('client-target-replaced');
});
it('rechecks authority immediately before dispatch and never repeats delivered writes', async () => {
  const service = fixture();
  service.register(a, 'web');
  let allowed = true;
  const before = vi.fn();
  const write = service.request(
    a,
    'preferences-set',
    {},
    () => {
      if (!allowed) throw new Error('human-dm-required');
    },
    before,
  );
  const refused = expect(write).rejects.toThrow('human-dm-required');
  allowed = false;
  expect(service.poll(a).commands).toEqual([]);
  await refused;
  expect(before).not.toHaveBeenCalled();
  allowed = true;
  const next = service.request(a, 'preferences-set', {}, () => {}, before);
  const command = service.poll(a).commands[0]!;
  expect(service.poll(a).commands).toEqual([]);
  service.complete(a, command.id, { ok: true, value: 'saved' });
  await expect(next).resolves.toBe('saved');
  expect(before).toHaveBeenCalledOnce();
});
it('distinguishes stale leases, undispatched timeouts and uncertain delivered writes', async () => {
  vi.useFakeTimers();
  const service = fixture();
  service.register(a, 'web');
  const unseen = service.request(a, 'preferences-set', {});
  const unseenFailure = expect(unseen).rejects.toThrow('client-unresponsive');
  await vi.advanceTimersByTimeAsync(10_000);
  await unseenFailure;
  service.poll(a);
  const delivered = service.request(a, 'preferences-set', {});
  const uncertain = expect(delivered).rejects.toThrow('client-outcome-uncertain');
  service.poll(a);
  await vi.advanceTimersByTimeAsync(10_000);
  await uncertain;
  await vi.advanceTimersByTimeAsync(5_001);
  expect(service.targets()).toEqual([]);
  expect(() => service.require(a)).toThrow('client-target-stale');
});
it('binds current to captured source and refuses changed targets after Human review', async () => {
  const service = fixture();
  service.register(a, 'web');
  service.register(b, 'web');
  let current = a;
  const prepare = createTobClientPreferenceOperations(service, () => current);
  const preparing = prepare('client-preferences-set', {
    current: true,
    expectedState: 'old',
    scope: 'browser-origin',
    patch: { notifications: false },
  });
  await Promise.resolve();
  service.complete(a, service.poll(a).commands[0]!.id, {
    ok: true,
    value: { stateFingerprint: 'old', value: { notifications: true } },
  });
  const operation = (await preparing)!;
  expect(operation.proposal).toMatchObject({ patch: { sharedWithSameOriginTabs: true } });
  current = b;
  expect(() => operation.run(() => {})).toThrow('current-client-unavailable');
  await expect(
    prepare('client-preferences-set', {
      current: true,
      scope: 'browser-origin',
      expectedState: 'old',
      patch: { theme: 'dark' },
    }),
  ).rejects.toThrow('host-scope-required');
});
it('parser rejects implicit targets and model-supplied current generations', async () => {
  const io = { readStdin: async () => '{"notifications":false}' } as BotCreateCliIo;
  await expect(parseClientPreferences('client-preferences', [], {}, io)).rejects.toThrow(
    'Choose exactly one',
  );
  await expect(parseClientPreferences('client-preferences', ['current'], {}, io)).rejects.toThrow(
    'current is derived',
  );
  await expect(
    parseClientPreferences(
      'client-preferences',
      ['current'],
      { generation: 'generation-aaa' },
      io,
      true,
    ),
  ).rejects.toThrow('current is derived');
  expect(
    await parseClientPreferences(
      'client-preferences-set',
      ['current'],
      { scope: 'browser-origin', 'patch-stdin': true, 'expected-state': 'old' },
      io,
      true,
    ),
  ).toMatchObject({ args: { current: true, patch: { notifications: false } } });
});

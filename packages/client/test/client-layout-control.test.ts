import { expect, it } from 'vitest';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { createClientLayoutHandlers } from '../src/client/client-layout-control.js';
import { validateLayoutEdit } from '../../core/src/client-control/layout.js';

it('refuses invalid geometry and unknown fields before the owner changes', () => {
  expect(() =>
    validateLayoutEdit({ type: 'child-resize', channelId: 'a', path: '2', ratio: 0.5 }),
  ).toThrow('invalid-layout-edit');
  expect(() =>
    validateLayoutEdit({ type: 'child-resize', channelId: 'a', path: '', ratio: 0.9 }),
  ).toThrow('invalid-layout-edit');
  expect(() => validateLayoutEdit({ type: 'gap', gap: 4, reset: true })).toThrow(
    'invalid-layout-edit',
  );
  expect(() => validateLayoutEdit({ type: 'rail-order', order: ['x', 'x'] })).toThrow(
    'invalid-layout-edit',
  );
});
it('hashes the mounted owner snapshot and rejects a concurrent edit before applying', async () => {
  const registry = createDockPanelRegistry();
  let value = { channelId: 'a', gap: 4 };
  const detach = registry.attach({
    open() {},
    close() {},
    readLayout: () => value,
    editLayout(patch, expected) {
      if (JSON.stringify(value) !== expected) throw new Error('stale-client-layout');
      if (patch.type === 'gap') value = { ...value, gap: patch.gap };
    },
  });
  const handlers = createClientLayoutHandlers(registry);
  const before = (await handlers.get('layout')!({})) as { stateFingerprint: string };
  value = { ...value, channelId: 'b' };
  await expect(
    handlers.get('layout-set')!({
      scope: 'browser-origin',
      expectedState: before.stateFingerprint,
      patch: { type: 'gap', gap: 8 },
    }),
  ).rejects.toThrow('stale-client-layout');
  const current = (await handlers.get('layout')!({})) as { stateFingerprint: string };
  await handlers.get('layout-set')!({
    scope: 'browser-origin',
    expectedState: current.stateFingerprint,
    patch: { type: 'gap', gap: 8 },
  });
  expect(value).toEqual({ channelId: 'b', gap: 8 });
  detach();
  await expect(handlers.get('layout')!({})).rejects.toThrow('client-layout-unavailable');
});

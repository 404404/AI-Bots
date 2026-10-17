import { Context } from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { expect, it, vi } from 'vitest';
import type { BridgeMethods } from '../../core/src/bridge/methods.js';
import { registerBridge } from '../../core/src/bridge/rpc.js';
import type { HomeDashboard } from '../../core/src/home/dashboard.js';

it('dispatches Home through the installed gateway SRC parser with optional and explicit ranges', async () => {
  const ctx = new Context();
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [] },
  } as unknown as Context['typert']);
  const dashboard: HomeDashboard = {
    readAt: '2026-10-18T00:00:00.000Z',
    attention: { status: 'unavailable' },
    working: { status: 'unavailable' },
    usage: { status: 'unavailable' },
    recent: { status: 'unavailable' },
  };
  const homeDashboard = vi.fn(async () => ({ ok: true as const, value: dashboard }));
  registerBridge(ctx, { homeDashboard } as unknown as BridgeMethods);
  const gateway = new TypertGatewayService(ctx, {});
  try {
    for (const args of [{}, { range: '24h' }, { range: '7d' }, { range: '30d' }]) {
      await expect(
        gateway.invoke({ namespace: 'botharness', method: 'homeDashboard', args }),
      ).resolves.toEqual(dashboard);
    }
    expect(homeDashboard.mock.calls).toEqual([
      [{ range: '24h' }],
      [{ range: '24h' }],
      [{ range: '7d' }],
      [{ range: '30d' }],
    ]);
  } finally {
    await ctx.fiber.dispose();
  }
});

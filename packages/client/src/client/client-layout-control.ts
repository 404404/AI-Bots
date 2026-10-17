import { validateLayoutEdit } from '../../../core/src/client-control/layout.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { ClientControlHandler, ClientControlContext } from './client-control.js';

export async function clientStateFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function createClientLayoutHandlers(
  registry: DockPanelRegistry,
): Map<string, ClientControlHandler> {
  const read = async () => {
    const value = structuredClone(registry.readLayout());
    return {
      scope: 'browser-origin',
      value,
      stateFingerprint: await clientStateFingerprint(value),
    };
  };
  return new Map<string, ClientControlHandler>([
    ['layout', read],
    [
      'layout-set',
      async (args: Record<string, unknown>, context?: ClientControlContext) => {
        if (args.scope !== 'browser-origin') throw new Error('client-scope-mismatch');
        const patch = validateLayoutEdit(args.patch);
        const before = structuredClone(registry.readLayout());
        if ((await clientStateFingerprint(before)) !== args.expectedState)
          throw new Error('stale-client-layout');
        await context?.authorize();
        if (context?.signal.aborted) throw new Error('client-command-expired');
        const outcome = registry.editLayout(patch, JSON.stringify(before)) ?? 'applied';
        return { ...(await read()), outcome, persisted: true };
      },
    ],
  ]);
}

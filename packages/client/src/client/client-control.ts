import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import {
  isClientTarget,
  preferenceState,
  validateClientPatch,
  type ClientControlCommand,
  type ClientPreferences,
  type ClientTarget,
} from '../../../core/src/client-control/contracts.js';
import type { BridgeCall } from './bridge.js';
import type { DesktopNotificationPrefs } from './desktop-notifications.js';

const targetOwners = new WeakMap<ClientTarget, string>();
export function createClientTarget(storage: Pick<Storage, 'getItem' | 'setItem'>): ClientTarget {
  const key = 'botharness.client-control-id.v1';
  let clientId = storage.getItem(key);
  if (!clientId || !/^[a-zA-Z0-9-]{8,80}$/u.test(clientId)) {
    clientId = crypto.randomUUID();
    storage.setItem(key, clientId);
  }
  const secretKey = 'botharness.client-control-owner.v1';
  let ownerProof = storage.getItem(secretKey);
  if (!ownerProof || !/^[a-zA-Z0-9-]{16,80}$/u.test(ownerProof)) {
    ownerProof = crypto.randomUUID();
    storage.setItem(secretKey, ownerProof);
  }
  const target = { clientId, generation: crypto.randomUUID() };
  targetOwners.set(target, ownerProof);
  return target;
}
export type ClientControlHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
const origins = new WeakMap<BridgeCall, () => ClientTarget | undefined>();
const proofs = new WeakMap<BridgeCall, () => string | undefined>();
export function currentClientProof(call: BridgeCall): string | undefined {
  return proofs.get(call)?.();
}
export function currentClientTarget(call: BridgeCall): ClientTarget | undefined {
  return origins.get(call)?.();
}
export function mountClientControl(input: {
  call: BridgeCall;
  kind: 'web' | 'desktop';
  target: ClientTarget;
  handlers: ReadonlyMap<string, ClientControlHandler>;
  intervalMs?: number;
}): () => void {
  const proof = crypto.randomUUID();
  const ownerProof = targetOwners.get(input.target) ?? crypto.randomUUID();
  let active = true;
  let registered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  origins.set(input.call, () => (registered ? input.target : undefined));
  proofs.set(input.call, () => (registered ? proof : undefined));
  const invoke = async (args: Record<string, unknown>): Promise<unknown> => {
    const response = (await input.call('clientControl', { ...args, proof })) as {
      ok: boolean;
      value?: unknown;
      error?: { code?: string };
    };
    if (!response.ok) throw new Error(response.error?.code ?? 'client-control-unavailable');
    return response.value;
  };
  const tick = async (): Promise<void> => {
    try {
      if (!registered) {
        await invoke({ action: 'register', target: input.target, kind: input.kind, ownerProof });
        registered = true;
      }
      const response = (await invoke({ action: 'poll', target: input.target })) as {
        commands: ClientControlCommand[];
      };
      for (const command of response.commands) {
        if (!active) break;
        let result: unknown;
        try {
          if (Date.now() >= command.expiresAt) throw new Error('client-command-expired');
          const handler = input.handlers.get(command.operation);
          if (!handler) throw new Error('client-control-unsupported');
          result = { ok: true, value: await handler(command.args) };
        } catch (error) {
          result = {
            ok: false,
            code: error instanceof Error ? error.message : 'client-operation-failed',
          };
        }
        await invoke({ action: 'complete', target: input.target, id: command.id, result });
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'client-target-replaced') {
        active = false;
        registered = false;
      } else registered = false;
    } finally {
      if (active) timer = setTimeout(() => void tick(), input.intervalMs ?? 1000);
    }
  };
  if (!isClientTarget(input.target)) throw new Error('client-target-required');
  void tick();
  return () => {
    active = false;
    registered = false;
    if (timer) clearTimeout(timer);
    origins.delete(input.call);
    proofs.delete(input.call);
  };
}
export function createClientPreferenceHandlers(input: {
  readTheme(): string;
  readLocale(): string;
  notifications: DesktopNotificationPrefs;
}): Map<string, ClientControlHandler> {
  const snapshot = () => {
    input.notifications.refreshPermission();
    const value: ClientPreferences = {
      theme: input.readTheme(),
      locale: input.readLocale(),
      notifications: { ...input.notifications.getSnapshot() },
    };
    return {
      scope: 'browser-origin',
      value,
      stateFingerprint: preferenceState(value),
      fields: {
        theme: { scope: 'host', owner: 'ui-theme', affectsAllConnectedClients: true },
        locale: { scope: 'host', owner: 'locale', affectsAllConnectedClients: true },
        motionPreference: { scope: 'host', owner: 'botharness-client' },
        botIcon: { scope: 'host', owner: 'botharness-client' },
        sendKey: { scope: 'host', owner: 'botharness-client' },
        autoAcceptGroupInvites: { scope: 'host', owner: 'botharness-client' },
        defaultHumanName: { scope: 'human-profile', owner: 'humanIdentity' },
        messagingDefaults: { scope: 'host-platform', owner: 'messagingDefaults' },
        notifications: {
          scope: 'browser-origin',
          owner: 'desktop-notifications',
          permissionOwner: 'human-os',
          sharedWithSameOriginTabs: true,
        },
      },
    };
  };
  return new Map<string, ClientControlHandler>([
    ['preferences', snapshot],
    [
      'preferences-set',
      async (args) => {
        if (args.scope !== 'browser-origin') throw new Error('client-scope-mismatch');
        const patch = validateClientPatch(args.patch);
        if ('theme' in patch || 'locale' in patch) throw new Error('host-scope-required');
        if (snapshot().stateFingerprint !== args.expectedState)
          throw new Error('stale-client-preferences');
        if ('notifications' in patch) {
          const state = input.notifications.getSnapshot();
          if (patch.notifications === true && state.permission !== 'granted')
            return {
              ...snapshot(),
              outcome:
                state.permission === 'default'
                  ? 'permission-pending'
                  : `permission-${state.permission}`,
              changed: false,
            };
          await input.notifications.setEnabled(patch.notifications === true);
        } else {
          const state = input.notifications.getSnapshot();
          if (state.permission === 'default')
            return {
              ...snapshot(),
              outcome: 'permission-pending',
              humanAction:
                'Open Settings → Notifications and use the existing notification switch.',
              changed: false,
            };
        }
        if ('notifications' in patch && !input.notifications.persisted())
          throw new Error('client-outcome-uncertain');
        return { ...snapshot(), outcome: 'applied', changed: 'notifications' in patch };
      },
    ],
  ]);
}

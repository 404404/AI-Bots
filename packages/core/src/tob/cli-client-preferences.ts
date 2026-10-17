import {
  createTobClientShortcutOperations,
  TOB_CLIENT_SHORTCUT_CAPABILITIES,
} from './cli-client-shortcuts.js';
import {
  createTobClientLayoutOperations,
  TOB_CLIENT_LAYOUT_CAPABILITIES,
} from './cli-client-layout.js';
import { validateClientPatch, type ClientTarget } from '../client-control/contracts.js';
import type { ClientControlService } from '../client-control/service.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CLIENT_PREFERENCE_CAPABILITIES: readonly TobCliCapability[] = [
  ...TOB_CLIENT_LAYOUT_CAPABILITIES,
  ...TOB_CLIENT_SHORTCUT_CAPABILITIES,
  {
    command: 'client-targets',
    description: 'Discover live targets; never infer current from one connected Client',
    write: false,
  },
  {
    command: 'client-preferences',
    description: 'Read a selected Client and actual preference ownership scopes',
    write: false,
  },
  {
    command: 'client-preferences-set',
    description:
      'Change one browser-origin notification preference on an explicit Client; OS permission remains Human-owned',
    write: true,
  },
];
export function createTobClientPreferenceOperations(
  service: ClientControlService,
  current: () => ClientTarget,
): PrepareTobOperation {
  const layout = createTobClientLayoutOperations(service, current);
  const shortcuts = createTobClientShortcutOperations(service, current);
  return async (command, raw) => {
    if (command === 'client-layout' || command === 'client-layout-set') return layout(command, raw);
    if (command === 'client-shortcuts' || command === 'client-shortcuts-set')
      return shortcuts(command, raw);
    if (!TOB_CLIENT_PREFERENCE_CAPABILITIES.some((item) => item.command === command))
      return undefined;
    const args = structuredClone(raw);
    const write = command === 'client-preferences-set';
    const allowed =
      command === 'client-targets'
        ? []
        : ['target', 'current', ...(write ? ['patch', 'scope', 'expectedState'] : [])];
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new TobError('invalid-input');
    if (command === 'client-targets')
      return {
        run(guard) {
          guard();
          return { targets: service.targets() };
        },
      };
    if ((args.current === true) === (args.target !== undefined))
      throw new TobError('client-target-required');
    const target = service.require(args.current === true ? current() : args.target);
    const recheck = () => {
      if (args.current === true && JSON.stringify(current()) !== JSON.stringify(target))
        throw new TobError('current-client-unavailable');
      service.require(target);
    };
    if (!write)
      return {
        run(guard) {
          guard();
          recheck();
          return service.request(target, 'preferences', {}, () => {
            guard();
            recheck();
          });
        },
      };
    let patch;
    try {
      patch = validateClientPatch(args.patch);
    } catch (error) {
      throw new TobError(error instanceof Error ? error.message : 'invalid-input');
    }
    if (args.scope !== 'browser-origin') throw new TobError('client-scope-mismatch');
    if ('theme' in patch || 'locale' in patch) throw new TobError('host-scope-required');
    if (typeof args.expectedState !== 'string' || args.expectedState.length > 4096)
      throw new TobError('invalid-input');
    const previous = await service.request(target, 'preferences', {});
    if ((previous as { stateFingerprint?: string }).stateFingerprint !== args.expectedState)
      throw new TobError('stale-client-preferences');
    return {
      proposal: Object.freeze({
        command,
        target: `${target.clientId}/${target.generation}`,
        previousValue: structuredClone(previous),
        patch: { scope: 'browser-origin', sharedWithSameOriginTabs: true, changes: patch },
      }),
      run(guard, beforeEffect) {
        guard();
        recheck();
        return service.request(
          target,
          'preferences-set',
          { patch, expectedState: args.expectedState, scope: args.scope },
          () => {
            guard();
            recheck();
          },
          beforeEffect,
        );
      },
    };
  };
}

import { validateLayoutEdit } from '../client-control/layout.js';
import type { ClientTarget } from '../client-control/contracts.js';
import type { ClientControlService } from '../client-control/service.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CLIENT_LAYOUT_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'client-layout',
    description:
      'Read one live Client workspace and Channel layout, stable panel IDs and eligibility',
    write: false,
  },
  {
    command: 'client-layout-set',
    description:
      'Edit one selected Client layout through its current owner with a reviewed state fingerprint',
    write: true,
  },
];
export function createTobClientLayoutOperations(
  service: ClientControlService,
  current: () => ClientTarget,
): PrepareTobOperation {
  return async (command, raw) => {
    if (!TOB_CLIENT_LAYOUT_CAPABILITIES.some((item) => item.command === command)) return undefined;
    const args = structuredClone(raw);
    const write = command.endsWith('-set');
    const allowed = ['target', 'current', ...(write ? ['patch', 'scope', 'expectedState'] : [])];
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new TobError('invalid-input');
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
          return service.request(target, 'layout', {}, () => {
            guard();
            recheck();
          });
        },
      };
    if (args.scope !== 'browser-origin') throw new TobError('client-scope-mismatch');
    if (typeof args.expectedState !== 'string' || !/^[a-f0-9]{64}$/u.test(args.expectedState))
      throw new TobError('invalid-input');
    let patch;
    try {
      patch = validateLayoutEdit(args.patch);
    } catch {
      throw new TobError('invalid-layout-edit');
    }
    const previous = await service.request(target, 'layout', {}, recheck);
    if ((previous as { stateFingerprint?: string }).stateFingerprint !== args.expectedState)
      throw new TobError('stale-client-layout');
    return {
      proposal: Object.freeze({
        command,
        target: `${target.clientId}/${target.generation}`,
        previousValue: structuredClone(previous),
        patch: { scope: args.scope, sharedWithSameOriginTabs: true, changes: patch },
      }),
      run(guard, beforeEffect) {
        guard();
        recheck();
        return service.request(
          target,
          'layout-set',
          { patch, scope: args.scope, expectedState: args.expectedState },
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

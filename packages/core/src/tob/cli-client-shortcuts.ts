import { validateShortcutEdit } from '../client-control/shortcuts.js';
import type { ClientTarget } from '../client-control/contracts.js';
import type { ClientControlService } from '../client-control/service.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CLIENT_SHORTCUT_CAPABILITIES: readonly TobCliCapability[] = [
  { command: 'client-shortcuts', description: 'Read one live Client shortcut catalog, effective bindings and platform profile', write: false },
  { command: 'client-shortcuts-set', description: 'Set, disable or reset one selected Client shortcut without stealing another binding', write: true },
];
export function createTobClientShortcutOperations(service: ClientControlService, current: () => ClientTarget): PrepareTobOperation {
  return async (command, raw) => {
    if (!TOB_CLIENT_SHORTCUT_CAPABILITIES.some(item => item.command === command)) return undefined;
    const args = structuredClone(raw);
    const write = command.endsWith('-set');
    const allowed = ['target', 'current', ...(write ? ['patch', 'scope', 'expectedState'] : [])];
    if (Object.keys(args).some(key => !allowed.includes(key))) throw new TobError('invalid-input');
    if ((args.current === true) === (args.target !== undefined)) throw new TobError('client-target-required');
    const target = service.require(args.current === true ? current() : args.target);
    const recheck = () => {
      if (args.current === true && JSON.stringify(current()) !== JSON.stringify(target)) throw new TobError('current-client-unavailable');
      service.require(target);
    };
    if (!write) return { run(guard) { guard(); recheck(); return service.request(target, 'shortcuts', {}, () => { guard(); recheck(); }); } };
    if (args.scope !== 'client-profile') throw new TobError('client-scope-mismatch');
    if (typeof args.expectedState !== 'string' || !/^[a-f0-9]{64}$/u.test(args.expectedState)) throw new TobError('invalid-input');
    let patch;
    try { patch = validateShortcutEdit(args.patch); } catch { throw new TobError('invalid-shortcut-edit'); }
    const previous = await service.request(target, 'shortcuts', {}, recheck);
    if ((previous as { stateFingerprint?: string }).stateFingerprint !== args.expectedState) throw new TobError('stale-client-shortcuts');
    return {
      proposal: Object.freeze({ command, target: `${target.clientId}/${target.generation}`, previousValue: structuredClone(previous), patch: { scope: args.scope, profile: patch.profile, changes: patch } }),
      run(guard, beforeEffect) {
        guard(); recheck();
        return service.request(target, 'shortcuts-set', { patch, scope: args.scope, expectedState: args.expectedState }, () => { guard(); recheck(); }, beforeEffect);
      },
    };
  };
}

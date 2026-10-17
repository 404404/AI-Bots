import type { Shortcuts, ShortcutBinding } from '@deepseek-ai/dsh-client-shortcuts/client';
import { validateShortcutEdit } from '../../../core/src/client-control/shortcuts.js';
import type { ClientControlHandler, ClientControlContext } from './client-control.js';
import { workspaceShortcutDefaultForCommand } from './workspace-shortcuts.js';
import { clientStateFingerprint } from './client-layout-control.js';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_ACTION_IDS,
  type ShortcutActionId,
  type ShortcutBindings,
  type ShortcutBinding as NavigationBinding,
} from './shortcut-bindings.js';

export const navigationShortcutId = (id: ShortcutActionId): string => `botharness.navigation.${id}`;
const nativeBinding = (binding: NavigationBinding): ShortcutBinding => ({
  code: binding.code,
  modifiers: [
    ...(binding.mod ? ['primary' as const] : []),
    ...(binding.alt ? ['alt' as const] : []),
    ...(binding.shift ? ['shift' as const] : []),
  ],
});
export function createClientShortcutHandlers(
  shortcuts: Pick<
    Shortcuts,
    'runtime' | 'platform' | 'catalog' | 'config' | 'fixedCatalog' | 'describeBinding' | 'edit'
  >,
  navigation: ShortcutBindings,
): Map<string, ClientControlHandler> {
  const snapshot = () => {
    const config = shortcuts.config.getSnapshot();
    if (config.status !== 'ready') throw new Error('shortcut-config-unavailable');
    const legacy = navigation.controlState();
    return structuredClone({
      profile: `${shortcuts.runtime}:${shortcuts.platform}`,
      revision: config.revision,
      commands: [
        ...shortcuts.catalog
          .getSnapshot()
          .filter((row) => row.id.startsWith('botharness.panel.'))
          .map((row) => ({ ...row, owner: 'native', customizable: true })),
        ...SHORTCUT_ACTION_IDS.map((id) => ({
          id: navigationShortcutId(id),
          owner: 'navigation',
          customizable: true,
          binding: navigation.isDisabled(id) ? null : nativeBinding(navigation.binding(id)),
          defaults: nativeBinding(DEFAULT_SHORTCUT_BINDINGS[id]),
          keys: navigation.text(id),
          modified: navigation.isCustom(id),
        })),
      ],
      fixedCommands: shortcuts.fixedCatalog.getSnapshot(),
      legacy,
    });
  };
  const read = async () => {
    const value = snapshot();
    return {
      scope: 'client-profile',
      value,
      stateFingerprint: await clientStateFingerprint(value),
    };
  };
  return new Map<string, ClientControlHandler>([
    ['shortcuts', read],
    [
      'shortcuts-set',
      async (args, context?: ClientControlContext) => {
        if (args.scope !== 'client-profile') throw new Error('client-scope-mismatch');
        const patch = validateShortcutEdit(args.patch);
        const before = snapshot();
        if (patch.profile !== before.profile) throw new Error('shortcut-profile-mismatch');
        if ((await clientStateFingerprint(before)) !== args.expectedState)
          throw new Error('stale-client-shortcuts');
        await context?.authorize();
        if (context?.signal.aborted) throw new Error('client-command-expired');
        if (JSON.stringify(snapshot()) !== JSON.stringify(before))
          throw new Error('stale-client-shortcuts');
        const legacyId = SHORTCUT_ACTION_IDS.find((id) => navigationShortcutId(id) === patch.id);
        const row = shortcuts.catalog
          .getSnapshot()
          .find((row) => row.id === patch.id && row.id.startsWith('botharness.panel.'));
        if (!legacyId && !row) throw new Error('unknown-shortcut-command');
        const refused = async (reason: string, conflicts: readonly string[] = []) => ({
          ...(await read()),
          outcome: 'refused',
          reason,
          conflicts,
          changed: false,
        });
        const candidate: ShortcutBinding | null =
          patch.type === 'set'
            ? patch.binding
            : patch.type === 'disable'
              ? null
              : legacyId
                ? nativeBinding(DEFAULT_SHORTCUT_BINDINGS[legacyId])
                : (workspaceShortcutDefaultForCommand(patch.id, before.profile) ?? null);
        if (candidate) {
          let check;
          try {
            check = shortcuts.describeBinding(candidate);
          } catch {
            return refused('unsupported-key');
          }
          if (check.issue) return refused(check.issue, check.conflicts);
          const nativeConflicts = check.conflicts.filter((id) => id !== patch.id);
          if (nativeConflicts.length) return refused('conflict', nativeConflicts);
          const normalized = check.binding!;
          if (
            normalized.modifiers.length === 1 &&
            normalized.modifiers[0] === 'alt' &&
            /^Digit[0-9]$/u.test(normalized.code)
          )
            return refused('reserved-channel-digit');
          const legacyConflicts = SHORTCUT_ACTION_IDS.filter((id) => {
            if (id === legacyId || navigation.isDisabled(id)) return false;
            const occupied = shortcuts.describeBinding(
              nativeBinding(navigation.binding(id)),
            ).binding;
            return (
              occupied &&
              JSON.stringify(occupied.modifiers) === JSON.stringify(normalized.modifiers) &&
              [normalized.code, normalized.secondCode].includes(occupied.code)
            );
          }).map(navigationShortcutId);
          if (legacyConflicts.length) return refused('conflict', legacyConflicts);
        }
        if (legacyId) {
          const normalized = candidate ? shortcuts.describeBinding(candidate).binding : null;
          if (normalized?.secondCode) return refused('unsupported-navigation-chord');
          if (normalized?.modifiers.includes(shortcuts.platform === 'macos' ? 'control' : 'meta'))
            return refused('unsupported-navigation-modifier');
          const problem =
            patch.type === 'disable'
              ? navigation.disable(legacyId)
              : patch.type === 'reset'
                ? navigation.reset(legacyId)
                : navigation.set(legacyId, {
                    code: normalized!.code,
                    mod: normalized!.modifiers.includes(
                      shortcuts.platform === 'macos' ? 'meta' : 'control',
                    ),
                    alt: normalized!.modifiers.includes('alt'),
                    shift: normalized!.modifiers.includes('shift'),
                  });
          if (problem?.kind === 'storage-uncertain') throw new Error('client-outcome-uncertain');
          if (problem)
            return refused(
              problem.kind,
              problem.kind === 'conflict' ? [navigationShortcutId(problem.action)] : [],
            );
        } else {
          let result;
          try {
            result = await shortcuts.edit(
              patch.type === 'reset'
                ? { type: 'reset', id: row!.id }
                : { type: 'set', id: row!.id, binding: candidate ?? null },
              before.revision,
            );
          } catch {
            throw new Error('client-outcome-uncertain');
          }
          if (context?.signal.aborted || result.status === 'write-failed')
            throw new Error('client-outcome-uncertain');
          if (result.status !== 'saved') return refused(result.status, result.conflicts ?? []);
        }
        return { ...(await read()), outcome: 'applied', changed: true, persisted: true };
      },
    ],
  ]);
}

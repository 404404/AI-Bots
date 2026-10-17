import { createHash } from 'node:crypto';
import type { BridgeMethods, BridgeResult } from '../bridge/methods.js';
import { messagingDefaultsInput, messagingDefaultsPlatform } from '../messaging/defaults.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';
export const TOB_HUMAN_PREFERENCE_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'human-name',
    description: 'Read the local Human default display name and fingerprint',
    write: false,
  },
  {
    command: 'human-name-set',
    description: 'Change the local Human default display name across this Host/Profile',
    write: true,
  },
  {
    command: 'messaging-defaults',
    description: 'Read Host/Profile messaging defaults for one IM platform',
    write: false,
  },
  {
    command: 'messaging-defaults-set',
    description: 'Change reviewed Host/Profile messaging defaults for one IM platform',
    write: true,
  },
];
function unwrap<T>(result: BridgeResult<T>): T {
  if (!result.ok) throw new TobError(result.error.code);
  return result.value;
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function createTobHumanPreferenceOperations(
  bridge: () => BridgeMethods,
): PrepareTobOperation {
  const human = () => {
    const value = unwrap(bridge().humanIdentity({}));
    return { scope: 'human-profile', value, stateFingerprint: fingerprint(value) };
  };
  return async (command, raw) => {
    if (!TOB_HUMAN_PREFERENCE_CAPABILITIES.some((item) => item.command === command))
      return undefined;
    const args = structuredClone(raw);
    const name = command.startsWith('human-name');
    const write = command.endsWith('-set');
    const allowed = name
      ? write
        ? ['displayName', 'expectedState']
        : []
      : write
        ? ['input']
        : ['platform'];
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new TobError('invalid-input');
    if (name) {
      if (!write)
        return {
          run(guard) {
            guard();
            return human();
          },
        };
      const displayName = args.displayName;
      if (
        displayName !== null &&
        (typeof displayName !== 'string' ||
          !displayName.trim() ||
          displayName.length > 128 ||
          [...displayName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      )
        throw new TobError('invalid-input');
      const previous = human();
      if (previous.stateFingerprint !== args.expectedState)
        throw new TobError('stale-human-preferences');
      return {
        proposal: Object.freeze({
          command,
          target: 'local-human',
          previousValue: previous,
          patch: { displayName, scope: 'human-profile' },
        }),
        run(guard, beforeEffect) {
          guard();
          if (human().stateFingerprint !== args.expectedState)
            throw new TobError('stale-human-preferences');
          beforeEffect?.();
          unwrap(bridge().humanNameSet({ displayName }));
          return human();
        },
      };
    }
    if (!write) {
      const platform = messagingDefaultsPlatform.safeParse(args.platform);
      if (!platform.success) throw new TobError('invalid-input');
      return {
        async run(guard) {
          guard();
          return {
            scope: 'host',
            ...unwrap(await bridge().messagingDefaults({ platform: platform.data })),
          };
        },
      };
    }
    const parsed = messagingDefaultsInput.safeParse(args.input);
    if (!parsed.success) throw new TobError('invalid-input');
    const input = parsed.data;
    const previous = unwrap(await bridge().messagingDefaults({ platform: input.platform }));
    if (previous.revision !== input.expectedRevision) throw new TobError('defaults-stale');
    return {
      proposal: Object.freeze({
        command,
        target: input.platform,
        previousValue: previous,
        patch: { scope: 'host', input },
        expectedRevision: input.expectedRevision,
      }),
      async run(guard, beforeEffect) {
        guard();
        const current = unwrap(await bridge().messagingDefaults({ platform: input.platform }));
        guard();
        if (fingerprint(current) !== fingerprint(previous)) throw new TobError('defaults-stale');
        beforeEffect?.();
        unwrap(await bridge().messagingDefaultsSet({ input }));
        return {
          scope: 'host',
          ...unwrap(await bridge().messagingDefaults({ platform: input.platform })),
        };
      },
    };
  };
}

import { BotTransferError, type BotTransferService } from '../bots/transfer.js';
import {
  TobCliDownload,
  type PrepareTobOperation,
  type TobCliCapability,
} from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_BOT_TRANSFER_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'bot-zip-files',
    description:
      'List eligible portable Bot files and their current state fingerprint without reading file content into the conversation',
    write: false,
  },
  {
    command: 'bot-zip-export',
    description:
      'Export reviewed portable Bot files to a new local file; history requires every file',
    write: true,
  },
];
export function createTobBotTransferOperations(transfer: BotTransferService): PrepareTobOperation {
  const owner = <T>(run: () => T): T => {
    try {
      return run();
    } catch (error) {
      if (error instanceof BotTransferError) throw new TobError(error.code);
      throw error;
    }
  };
  return (command, args) => {
    if (!TOB_BOT_TRANSFER_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const read = command === 'bot-zip-files';
    const allowed = read ? ['slug'] : ['slug', 'include', 'history', 'expectedState'];
    if (
      Object.keys(args).some((key) => !allowed.includes(key)) ||
      typeof args.slug !== 'string' ||
      !args.slug.trim()
    )
      throw new TobError('invalid-input');
    const slug = args.slug;
    if (read)
      return {
        run(guard) {
          guard();
          return owner(() => transfer.files(slug));
        },
      };
    if (
      typeof args.expectedState !== 'string' ||
      typeof args.history !== 'boolean' ||
      (args.include !== undefined &&
        (!Array.isArray(args.include) || !args.include.every((path) => typeof path === 'string')))
    )
      throw new TobError('invalid-input');
    const selection = {
      expectedState: args.expectedState,
      history: args.history,
      ...(args.include === undefined ? {} : { include: [...args.include] as string[] }),
    };
    const reviewed = owner(() => transfer.prepare(slug, selection));
    return {
      proposal: {
        command,
        target: slug,
        previousValue: { bot: reviewed.bot, stateFingerprint: reviewed.stateFingerprint },
        patch: {
          files: reviewed.selected.map((file) => file.path),
          always: reviewed.always,
          history: reviewed.history,
        },
      },
      run(guard, beforeEffect) {
        guard();
        owner(() => transfer.prepare(slug, selection));
        beforeEffect?.();
        const exported = owner(() => transfer.exportZip(slug, selection));
        guard();
        return new TobCliDownload(exported.archive, exported.metadata);
      },
    };
  };
}

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { syncBotDescriptor } from './bot-descriptor-sync.js';
import { botProfileFingerprint } from './profile-snapshot.js';
import {
  BOT_ZIP_MAX_BYTES,
  BOT_ZIP_MAX_ENTRIES,
  BOT_ZIP_HISTORY_PATH,
  exportBotZip,
  listBotZipFiles,
} from './bot-zip.js';
import type { PersonaBotRegistry } from './registry.js';
import { readZip, safeArchivePath, ZipArchiveError } from './zip-archive.js';

export class BotTransferError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface BotTransferSelection {
  include?: string[];
  history: boolean;
  expectedState?: string;
}
export function createBotTransfer(registry: Pick<PersonaBotRegistry, 'get' | 'memoryDirFor'>) {
  const snapshot = (slug: string) => {
    const bot = registry.get(slug);
    const memoryDir = registry.memoryDirFor(slug);
    if (!bot || !memoryDir) throw new BotTransferError('unknown-bot');
    try {
      syncBotDescriptor(memoryDir, bot);
      const listing = listBotZipFiles(memoryDir);
      const root = realpathSync(memoryDir);
      const digests = listing.files.map((file) => {
        const path = join(memoryDir, file.path);
        const relativePath = relative(root, realpathSync(path));
        if (
          !lstatSync(path).isFile() ||
          isAbsolute(relativePath) ||
          relativePath === '..' ||
          relativePath.startsWith('..' + sep)
        )
          throw new BotTransferError('unsafe-path');
        const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          if (!fstatSync(fd).isFile()) throw new BotTransferError('unsafe-path');
          const hash = createHash('sha256');
          const chunk = Buffer.allocUnsafe(1024 * 1024);
          while (true) {
            const count = readSync(fd, chunk);
            if (!count) break;
            hash.update(chunk.subarray(0, count));
          }
          return [file.path, hash.digest('hex')];
        } finally {
          closeSync(fd);
        }
      });
      const refs = execFileSync('git', ['show-ref', '--head', '--heads', '--tags'], {
        cwd: memoryDir,
        encoding: 'utf8',
        windowsHide: true,
      });
      const stateFingerprint = createHash('sha256')
        .update(JSON.stringify({ identity: botProfileFingerprint(bot), digests, refs }))
        .digest('hex');
      return {
        bot: { slug: bot.slug, displayName: bot.displayName },
        ...listing,
        stateFingerprint,
        memoryDir,
        digests,
        refs,
      };
    } catch (error) {
      if (error instanceof BotTransferError) throw error;
      throw new BotTransferError('memory-unavailable');
    }
  };
  const files = (slug: string) => {
    const { memoryDir: _dir, digests: _digests, refs: _refs, ...view } = snapshot(slug);
    return view;
  };
  const prepare = (slug: string, selection: BotTransferSelection) => {
    const current = files(slug);
    if (
      selection.expectedState !== undefined &&
      (!/^[a-f0-9]{64}$/u.test(selection.expectedState) ||
        selection.expectedState !== current.stateFingerprint)
    )
      throw new BotTransferError('stale-bot-files');
    if (
      typeof selection.history !== 'boolean' ||
      (selection.include !== undefined && (!Array.isArray(selection.include) || selection.history))
    )
      throw new BotTransferError('invalid-input');
    if (selection.include !== undefined) {
      try {
        if (
          selection.include.length > BOT_ZIP_MAX_ENTRIES ||
          selection.include.some(
            (path) =>
              typeof path !== 'string' ||
              safeArchivePath(path) !== path ||
              !current.files.some((file) => file.path === path),
          )
        )
          throw new BotTransferError('invalid-input');
      } catch (error) {
        if (error instanceof ZipArchiveError) throw new BotTransferError(error.code);
        throw error;
      }
    }
    const included =
      selection.include === undefined
        ? current.files
        : current.files.filter(
            (file) => selection.include!.includes(file.path) || current.always.includes(file.path),
          );
    if (
      included.length > BOT_ZIP_MAX_ENTRIES ||
      included.reduce((total, file) => total + file.size, 0) > BOT_ZIP_MAX_BYTES
    )
      throw new BotTransferError('too-large');
    return { ...current, selected: included, history: selection.history };
  };
  const exportZip = (slug: string, selection: BotTransferSelection) => {
    const reviewed = prepare(slug, selection);
    const current = snapshot(slug);
    if (reviewed.stateFingerprint !== current.stateFingerprint)
      throw new BotTransferError('stale-bot-files');
    const archive = exportBotZip(current.memoryDir, {
      ...(selection.include === undefined ? {} : { include: new Set(selection.include) }),
      history: selection.history,
    });
    if (archive.length > BOT_ZIP_MAX_BYTES) throw new BotTransferError('too-large');
    const entries = readZip(archive, {
      maxEntries: BOT_ZIP_MAX_ENTRIES + 1,
      maxTotalBytes: BOT_ZIP_MAX_BYTES,
    });
    const allowed = new Set(reviewed.selected.map((file) => file.path));
    if (selection.history) allowed.add(BOT_ZIP_HISTORY_PATH);
    if (entries.some((entry) => !allowed.has(entry.path)) || entries.length !== allowed.size)
      throw new BotTransferError('stale-bot-files');
    if (selection.history) {
      const history = entries.find((entry) => entry.path === BOT_ZIP_HISTORY_PATH)!;
      const header = history.data
        .subarray(0, history.data.indexOf('\n\n'))
        .toString('utf8')
        .split('\n')
        .slice(1)
        .sort()
        .join('\n');
      if (header !== current.refs.trim().split('\n').sort().join('\n'))
        throw new BotTransferError('stale-bot-files');
    }
    for (const file of reviewed.selected) {
      const entry = entries.find((entry) => entry.path === file.path);
      if (
        !entry ||
        createHash('sha256').update(entry.data).digest('hex') !==
          current.digests.find(([path]) => path === file.path)?.[1]
      )
        throw new BotTransferError('stale-bot-files');
    }
    if (files(slug).stateFingerprint !== current.stateFingerprint)
      throw new BotTransferError('stale-bot-files');
    return {
      archive,
      metadata: {
        bot: current.bot,
        stateFingerprint: current.stateFingerprint,
        fileCount: reviewed.selected.length,
        history: selection.history,
        bytes: archive.length,
        sha256: createHash('sha256').update(archive).digest('hex'),
      },
    };
  };
  return { files, prepare, exportZip };
}
export type BotTransferService = ReturnType<typeof createBotTransfer>;

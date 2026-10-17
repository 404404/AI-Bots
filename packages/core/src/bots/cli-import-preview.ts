import { readBotImportArchive, expandGitHubRef, type BotCreateCliIo } from './bot-create-cli.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';
export const BOT_IMPORT_PREVIEW_COMMANDS = [
  {
    command: 'bot-import-preview',
    description: 'inspect a Git commit or local ZIP/directory source before stable import',
  },
];
export interface BotImportPreviewValues {
  'from-git'?: string;
  'from-zip'?: string;
  'from-dir'?: string;
  host?: string;
  'token-file'?: string;
  timeout?: string;
}
export async function runBotImportPreview(
  rest: string[],
  values: BotImportPreviewValues,
  io: BotCreateCliIo,
  connect: typeof connectLiveHost,
) {
  if (
    rest.length ||
    [values['from-git'], values['from-zip'], values['from-dir']].filter(
      (value) => value !== undefined,
    ).length !== 1
  )
    throw new CliLiveError('usage', 'Choose exactly one source and no positional arguments.');
  const seconds = values.timeout === undefined ? 120 : Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    throw new CliLiveError('usage', '--timeout must be between 0 and 600 seconds.');
  const local =
    values['from-git'] === undefined
      ? readBotImportArchive({
          ...(values['from-zip'] === undefined
            ? { directory: values['from-dir']! }
            : { zip: values['from-zip'] }),
        })
      : undefined;
  const host = await connect(values, io, AbortSignal.timeout(Math.ceil(seconds * 1000)));
  if (values['from-git'] !== undefined)
    return host.rpc('botImportPreview', { gitUrl: expandGitHubRef(values['from-git']) });
  const response = await host.stream('/api/botharness/bot-zip/import?preview=1', {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: new Uint8Array(local!.archive),
  });
  return response.json();
}

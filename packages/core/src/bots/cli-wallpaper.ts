import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
export const WALLPAPER_COMMANDS = [
  {
    command: 'wallpaper-get',
    description: 'read the explicit Client local wallpaper metadata and revision',
  },
  {
    command: 'wallpaper-import',
    description:
      'read --file on this CLI machine and import an image to --client-id with --expected-revision',
  },
  {
    command: 'wallpaper-crop',
    description: 'save {x,y,zoom} from --patch-stdin on --client-id with --expected-revision',
  },
  {
    command: 'wallpaper-remove',
    description: 'remove the explicit Client wallpaper with --expected-revision',
  },
] as const;
export async function runWallpaperCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'expected-revision'?: string;
    'patch-stdin'?: boolean;
    file?: string;
  },
  io: BotCreateCliIo,
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  if (rest.length || !values['client-id'])
    throw new CliLiveError('usage', 'Wallpaper commands require exactly one --client-id.');
  if (command !== 'wallpaper-get' && !values['expected-revision'])
    throw new CliLiveError('usage', 'Read wallpaper-get and supply its --expected-revision.');
  if (
    command === 'wallpaper-get' &&
    (values['expected-revision'] || values.file || values['patch-stdin'])
  )
    throw new CliLiveError('usage', 'wallpaper-get takes no write options.');
  if (values.file && command !== 'wallpaper-import')
    throw new CliLiveError('usage', '--file requires wallpaper-import.');
  if (values['patch-stdin'] && !['wallpaper-import', 'wallpaper-crop'].includes(command))
    throw new CliLiveError('usage', 'Crop input requires wallpaper-import or wallpaper-crop.');
  let crop: unknown;
  if (values['patch-stdin']) {
    try {
      crop = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      throw new CliLiveError('usage', 'Invalid crop JSON.');
    }
  }
  if (command === 'wallpaper-crop' && crop === undefined)
    throw new CliLiveError('usage', 'wallpaper-crop requires --patch-stdin.');
  let bytes: Buffer | undefined;
  if (command === 'wallpaper-import') {
    if (!values.file)
      throw new CliLiveError('usage', 'wallpaper-import requires --file on this CLI machine.');
    try {
      const path = resolve(values.file);
      const stat = statSync(path);
      if (!stat.isFile() || stat.size < 1 || stat.size > 20 * 1024 * 1024)
        throw new CliLiveError(
          'wallpaper-size-invalid',
          'Images must be nonempty and at most 20 MB.',
        );
      bytes = readFileSync(path);
      if (bytes.length !== stat.size)
        throw new CliLiveError(
          'wallpaper-file-changed',
          'The input file changed while reading it.',
        );
    } catch (error) {
      if (error instanceof CliLiveError) throw error;
      throw new CliLiveError(
        'wallpaper-file-unavailable',
        'Cannot read the input image on this CLI machine.',
      );
    }
  }
  const host = await connect();
  const request = async (wallpaper: Record<string, unknown>): Promise<Record<string, unknown>> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await host.http('/api/botharness/appearance-control', {
          action: 'request',
          clientId: values['client-id'],
          ...(values['expected-revision'] ? { expectedRevision: values['expected-revision'] } : {}),
          wallpaper,
        });
        return JSON.parse(new TextDecoder().decode(reply.bytes)) as Record<string, unknown>;
      } catch (error) {
        if (
          !(error instanceof CliLiveError) ||
          error.code !== 'appearance-client-unavailable' ||
          attempt >= 20
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  };
  if (command === 'wallpaper-get') return request({ action: 'read' });
  if (command === 'wallpaper-remove') return request({ action: 'remove' });
  if (command === 'wallpaper-crop') return request({ action: 'crop', crop });
  const begin = await request({ action: 'begin', size: bytes!.length });
  if (typeof begin.uploadId !== 'string')
    throw new CliLiveError('host-protocol-error', 'Client returned no upload receipt.');
  try {
    for (let offset = 0; offset < bytes!.length; offset += 192 * 1024) {
      const chunk = bytes!.subarray(offset, offset + 192 * 1024);
      const reply = await request({
        action: 'append',
        uploadId: begin.uploadId,
        offset,
        data: chunk.toString('base64'),
      });
      if (reply.offset !== offset + chunk.length)
        throw new CliLiveError(
          'host-protocol-error',
          'Client acknowledged a different upload offset.',
        );
    }
    return await request({
      action: 'commit',
      uploadId: begin.uploadId,
      ...(crop === undefined ? {} : { crop }),
    });
  } catch (error) {
    await request({ action: 'cancel', uploadId: begin.uploadId }).catch(() => {});
    throw error;
  }
}

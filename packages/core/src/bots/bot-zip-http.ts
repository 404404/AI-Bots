import { BotCreationError } from './creation.js';
import type { BotImportsService } from './imports.js';
import { createBotTransfer, BotTransferError, type BotTransferService } from './transfer.js';
import { randomUUID } from 'node:crypto';

import { safeAttachmentName } from '../attachments/store.js';
import { syncBotDescriptor } from './bot-descriptor-sync.js';
import { BOT_ZIP_MAX_BYTES, exportBotZip, listBotZipFiles, readBotZip } from './bot-zip.js';
import type { PersonaBotRegistry } from './registry.js';
import { ZipArchiveError } from './zip-archive.js';
import { parseBotDescriptor } from '../marketplace/descriptor.js';

export const BOT_ZIP_EXPORT_PATH = '/api/botharness/bot-zip';
export const BOT_ZIP_IMPORT_PATH = '/api/botharness/bot-zip/import';
export const BOT_ZIP_FILES_PATH = '/api/botharness/bot-zip/files';
const MAX_SELECTION_BYTES = 8 * 1024 * 1024;

type DetailResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface BotZipHttpDeps {
  registry: PersonaBotRegistry;
  transfer?: BotTransferService;
  imports?: BotImportsService;
  detail: (slug: string) => DetailResult;
  log?: (message: string) => void;
  createBotId?: () => string;
}

const NO_STORE = { 'cache-control': 'no-store' };

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

function zipFailure(error: ZipArchiveError): Response {
  return failure(error.code === 'too-large' ? 413 : 400, error.code, error.message);
}

function disposition(name: string): string {
  const safe = safeAttachmentName(`${name}.zip`);
  const ascii = safe.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/gu, (char) => '%' + char.charCodeAt(0).toString(16))}`;
}

async function readBody(request: Request, limit = BOT_ZIP_MAX_BYTES): Promise<Buffer | undefined> {
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function fileStem(name: string | null): string | undefined {
  const stem = name
    ?.split(/[\\/]/u)
    .at(-1)
    ?.replace(/\.zip$/iu, '')
    .trim();
  return stem === undefined || stem.length === 0 ? undefined : [...stem].slice(0, 60).join('');
}

export function createBotZipHttp(deps: BotZipHttpDeps): (request: Request) => Promise<Response> {
  const transfer = deps.transfer ?? createBotTransfer(deps.registry);
  const botOf = (
    slug: string | null,
  ):
    | { record: NonNullable<ReturnType<PersonaBotRegistry['get']>>; memoryDir: string }
    | Response => {
    if (!slug) return failure(400, 'invalid-input', 'slug is required');
    const record = deps.registry.get(slug);
    const memoryDir = deps.registry.memoryDirFor(slug);
    if (record === undefined || memoryDir === undefined) {
      return failure(404, 'unknown-bot', `Unknown PersonaBot: ${slug}`);
    }
    try {
      syncBotDescriptor(memoryDir, record);
    } catch {}
    return { record, memoryDir };
  };

  const listFiles = (request: Request): Response => {
    const bot = botOf(new URL(request.url).searchParams.get('slug'));
    if (bot instanceof Response) return bot;
    try {
      return Response.json(
        new URL(request.url).searchParams.get('snapshot') === '1'
          ? transfer.files(bot.record.slug)
          : listBotZipFiles(bot.memoryDir),
        { headers: NO_STORE },
      );
    } catch (error) {
      if (error instanceof BotTransferError)
        return failure(
          error.code === 'too-large' ? 413 : 400,
          error.code,
          'The Bot file snapshot is unavailable',
        );
      return failure(500, 'memory-unavailable', 'The Bot files could not be read');
    }
  };

  const readSelection = async (
    request: Request,
  ): Promise<
    | { slug: string | null; include?: Set<string>; history: boolean; expectedState?: string }
    | Response
  > => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      return { slug: params.get('slug'), history: params.get('history') === '1' };
    }
    const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (type !== 'application/json') {
      return failure(415, 'invalid-input', 'content type must be application/json');
    }
    const body = await readBody(request, MAX_SELECTION_BYTES);
    if (body === undefined) return failure(413, 'too-large', 'The selection is too large');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      return failure(400, 'invalid-input', 'invalid JSON');
    }
    const source =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const slug = source['slug'];
    const include = source['include'];
    const history = source['history'] ?? false;
    const expectedState = source['expectedState'];
    if (
      typeof slug !== 'string' ||
      (include === undefined
        ? typeof expectedState !== 'string'
        : !Array.isArray(include) || !include.every((path) => typeof path === 'string')) ||
      (expectedState !== undefined &&
        (typeof expectedState !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedState))) ||
      typeof history !== 'boolean'
    ) {
      return failure(400, 'invalid-input', 'slug and include are required');
    }
    if (history && include !== undefined) {
      return failure(400, 'invalid-input', 'Git history can only be exported with every file');
    }
    return {
      slug,
      ...(include === undefined ? {} : { include: new Set(include as string[]) }),
      history,
      ...(expectedState === undefined ? {} : { expectedState: expectedState as string }),
    };
  };

  const exportZip = async (request: Request): Promise<Response> => {
    const selection = await readSelection(request);
    if (selection instanceof Response) return selection;
    const bot = botOf(selection.slug);
    if (bot instanceof Response) return bot;
    const startedAt = performance.now();
    try {
      const exported =
        selection.expectedState === undefined
          ? undefined
          : transfer.exportZip(bot.record.slug, {
              history: selection.history,
              expectedState: selection.expectedState,
              ...(selection.include === undefined ? {} : { include: [...selection.include] }),
            });
      const archive =
        exported?.archive ??
        exportBotZip(bot.memoryDir, {
          ...(selection.include === undefined ? {} : { include: selection.include }),
          history: selection.history,
        });
      deps.log?.(
        `bot-zip-export slug=${bot.record.slug} selected=${selection.include === undefined ? 'all' : selection.include.size} history=${selection.history} bytes=${archive.length} durationMs=${Math.round(performance.now() - startedAt)}`,
      );
      return new Response(new Uint8Array(archive), {
        headers: {
          ...NO_STORE,
          'content-type': 'application/zip',
          ...(exported
            ? {
                'x-botharness-result': Buffer.from(JSON.stringify(exported.metadata)).toString(
                  'base64url',
                ),
              }
            : {}),
          'content-length': String(archive.length),
          'content-disposition': disposition(bot.record.displayName),
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      if (error instanceof BotTransferError)
        return failure(
          error.code === 'too-large' ? 413 : error.code === 'stale-bot-files' ? 409 : 400,
          error.code,
          'The reviewed Bot export could not be completed',
        );
      if (error instanceof ZipArchiveError) return zipFailure(error);
      deps.log?.(`bot-zip-export-failed slug=${bot.record.slug}`);
      return failure(500, 'memory-unavailable', 'The Bot files could not be read');
    }
  };

  const importZip = async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    const metadata: Record<string, unknown> = {};
    if (params.has('displayName')) metadata['name'] = params.get('displayName');
    if (params.has('description')) metadata['bio'] = params.get('description');
    if (params.has('roles')) {
      try {
        metadata['tags'] = JSON.parse(params.get('roles')!);
      } catch {
        return failure(400, 'invalid-input', 'Invalid import metadata');
      }
    }
    const overrides = parseBotDescriptor(JSON.stringify(metadata));
    if (overrides === undefined) return failure(400, 'invalid-input', 'Invalid import metadata');
    const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (type !== 'application/octet-stream' && type !== 'application/zip') {
      return failure(415, 'invalid-input', 'content type must be application/zip');
    }
    const declared = request.headers.get('content-length');
    if (declared !== null && Number(declared) > BOT_ZIP_MAX_BYTES) {
      return failure(413, 'too-large', 'The zip file is too large');
    }
    const archive = await readBody(request);
    if (archive === undefined) return failure(413, 'too-large', 'The zip file is too large');
    const startedAt = performance.now();
    let contents;
    try {
      contents = readBotZip(archive);
    } catch (error) {
      if (error instanceof ZipArchiveError) {
        deps.log?.(`bot-zip-import-refused reason=${error.code}`);
        return zipFailure(error);
      }
      throw error;
    }
    if (params.get('preview') === '1') {
      if (!deps.imports)
        return failure(503, 'import-unavailable', 'Source inspection is unavailable on this Host');
      try {
        return Response.json(deps.imports.previewArchive(archive), { headers: NO_STORE });
      } catch (error) {
        if (error instanceof ZipArchiveError) return zipFailure(error);
        return failure(400, 'invalid-zip', 'The archive could not be inspected');
      }
    }
    const operationKey = params.get('operationKey');
    if (operationKey !== null) {
      const expectedArchive = params.get('expectedArchive');
      if (!deps.imports || !expectedArchive)
        return failure(
          400,
          'invalid-input',
          'Stable import needs operationKey and expectedArchive',
        );
      try {
        const input = deps.imports.archiveInput(archive, {
          expectedArchive,
          displayName:
            overrides.name ?? contents.descriptor?.name ?? fileStem(params.get('name')) ?? 'Bot',
          ...(overrides.bio === undefined ? {} : { description: overrides.bio }),
          ...(overrides.tags === undefined ? {} : { roles: overrides.tags }),
        });
        const created = await deps.imports.create(operationKey, input);
        const detail = deps.detail(created.record.slug);
        if (!detail.ok)
          return Response.json(
            {
              error: detail.error,
              bot: { id: created.record.slug, name: created.record.displayName },
              receipt: created.receipt,
              outcome: 'created',
            },
            { status: 500, headers: NO_STORE },
          );
        const body = typeof detail.value === 'object' && detail.value !== null ? detail.value : {};
        return Response.json(
          {
            ...body,
            receipt: created.receipt,
            channelId: created.channelId,
            source: {
              kind: 'archive',
              sha256: input.source.kind === 'archive' ? input.source.sha256 : expectedArchive,
            },
          },
          { headers: NO_STORE },
        );
      } catch (error) {
        if (error instanceof BotCreationError)
          return failure(
            error.code === 'stale-import-source' ? 409 : 400,
            error.code,
            error.message,
          );
        if (error instanceof ZipArchiveError) return zipFailure(error);
        return failure(500, 'memory-unavailable', 'The selected Bot could not be imported');
      }
    }
    const slug = deps.createBotId?.() ?? 'bot-' + randomUUID().replaceAll('-', '');
    const displayName =
      overrides.name ?? contents.descriptor?.name ?? fileStem(params.get('name')) ?? 'Bot';
    const roles = overrides.tags ?? (params.has('roles') ? [] : contents.descriptor?.tags);
    const description = overrides.bio ?? contents.descriptor?.bio;
    const result = await deps.registry.createFromFiles({
      slug,
      displayName,
      files: contents.files,
      ...(contents.history === undefined ? {} : { history: contents.history }),
      ...(roles === undefined ? {} : { roles }),
      ...(description === undefined ? {} : { description }),
    });
    if (!result.ok) {
      deps.log?.(`bot-zip-import-failed reason=${result.reason}`);
      return failure(
        result.reason === 'invalid-zip' ? 400 : 500,
        result.reason,
        result.reason === 'invalid-zip'
          ? 'The zip file could not be unpacked'
          : 'The Bot could not be created from this zip file',
      );
    }
    deps.log?.(
      `bot-zip-import slug=${slug} files=${contents.files.length} history=${contents.history !== undefined} durationMs=${Math.round(performance.now() - startedAt)}`,
    );
    const detail = deps.detail(slug);
    if (!detail.ok)
      return Response.json(
        {
          error: detail.error,
          bot: { id: slug, name: result.record.displayName },
          outcome: 'created',
        },
        { status: 500, headers: NO_STORE },
      );
    return Response.json(detail.value, { headers: NO_STORE });
  };

  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/bot-zip/files') && request.method === 'GET') return listFiles(request);
    if (path.endsWith('/bot-zip/import') && request.method === 'POST') return importZip(request);
    if (path.endsWith('/bot-zip') && (request.method === 'GET' || request.method === 'POST')) {
      return exportZip(request);
    }
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  };
}

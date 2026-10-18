import type { HostClient, RemoteSource } from './client';
import type { MemoryImage, MemoryMarkdown } from './wire';

export const MEMORY_IMAGE_LIMIT = 25 * 1024 * 1024;
export type PreviewImage = {
  uri: string;
  width: number;
  height: number;
  size: number;
  dispose(): void;
};
export interface MemoryPreviewIO {
  fetch(source: RemoteSource, signal: AbortSignal): Promise<Response>;
  store(bytes: Uint8Array): { uri: string; dispose(): void };
}

export function imageReferenceKind(reference: string): 'local' | 'remote' | 'invalid' {
  if (!reference || reference.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(reference))
    return 'invalid';
  if (/^https:\/\//iu.test(reference)) {
    try {
      const url = new URL(reference);
      return url.username || url.password ? 'invalid' : 'remote';
    } catch {
      return 'invalid';
    }
  }
  return /^[a-z][a-z0-9+.-]*:/iu.test(reference) ? 'invalid' : 'local';
}

export function memoryPreviewSource(
  client: Pick<HostClient, 'resource'>,
  slug: string,
  path: string,
  version: MemoryImage | MemoryMarkdown,
  reference?: string,
): RemoteSource {
  if (version.status !== 'ready' || !version.revision)
    throw new Error(`memory-image-${version.status}`);
  if (reference !== undefined && imageReferenceKind(reference) === 'remote')
    return { uri: reference, headers: {} };
  if (reference !== undefined && imageReferenceKind(reference) !== 'local')
    throw new Error('memory-image-invalid');
  const query = new URLSearchParams({
    slug,
    path,
    source: version.source,
    revision: version.revision,
  });
  if (reference !== undefined) query.set('reference', reference);
  return client.resource('/api/botharness/memory/image?' + query);
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    signature.some((n, i) => bytes[i] !== n) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR'
  )
    throw new Error('memory-image-unsupported');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 40_000_000)
    throw new Error('memory-image-too-large');
  return { width, height };
}

async function readPreviewBytes(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) {
    await response.body?.cancel();
    throw new Error('memory-image-too-large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('memory-image-load-failed');
  const parts: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('memory-image-too-large');
      }
      parts.push(item.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export async function loadPreviewImage(
  io: MemoryPreviewIO,
  source: RemoteSource,
  signal: AbortSignal,
): Promise<PreviewImage> {
  signal.throwIfAborted();
  const response = await io.fetch(source, signal);
  if (!response.ok) {
    let code = 'memory-image-load-failed';
    try {
      const value: unknown = JSON.parse(
        new TextDecoder().decode(await readPreviewBytes(response, 4096, signal)),
      );
      const candidate = (value as { error?: { code?: unknown } }).error?.code;
      if (typeof candidate === 'string' && /^memory-image-[a-z-]+$/u.test(candidate))
        code = candidate;
    } catch {}
    throw new Error(code);
  }
  const bytes = await readPreviewBytes(response, MEMORY_IMAGE_LIMIT, signal);
  const size = bytes.byteLength;
  const dimensions = pngDimensions(bytes);
  const file = io.store(bytes);
  if (signal.aborted) {
    file.dispose();
    signal.throwIfAborted();
  }
  return { ...file, ...dimensions, size };
}

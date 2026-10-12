import { CHANNEL_STREAM_PATH } from './live.js';

export interface LiveFrame {
  event: string;
  data: string;
  id?: string;
}

export class LiveRefused extends Error {
  constructor(
    readonly code: 'not-found' | 'conflict' | 'invalid' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'LiveRefused';
  }
}

const QUERY_LIMIT = 2048;

function refusal(status: number): LiveRefused['code'] {
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400) return 'invalid';
  return 'unavailable';
}

export function parseLiveFrame(block: string): LiveFrame | undefined {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.length === 0 || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const rest = colon < 0 ? '' : line.slice(colon + 1);
    const value = rest.startsWith(' ') ? rest.slice(1) : rest;
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  }
  if (data.length === 0) return undefined;
  return id === undefined ? { event, data: data.join('\n') } : { event, data: data.join('\n'), id };
}

export async function* openLiveFrames(
  open: (request: Request) => Response,
  query: string,
  resume: string,
  signal: AbortSignal,
  path: string = CHANNEL_STREAM_PATH,
): AsyncGenerator<LiveFrame> {
  if (typeof query !== 'string' || typeof resume !== 'string' || query.length > QUERY_LIMIT)
    throw new LiveRefused('invalid', 'Invalid live stream request');
  if (signal.aborted) return;
  const response = open(
    new Request(`http://localhost${path}?${query}`, {
      headers: resume.length > 0 ? { 'Last-Event-ID': resume } : {},
    }),
  );
  if (response.status !== 200 || response.body === null) {
    const message = await response.text().catch(() => '');
    throw new LiveRefused(refusal(response.status), message || 'Live stream refused');
  }
  const reader = response.body.getReader();
  const abort = (): void => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    if (signal.aborted) return;
    yield { event: 'open', data: '' };
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done || signal.aborted) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const frame = parseLiveFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (frame !== undefined) yield frame;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
}

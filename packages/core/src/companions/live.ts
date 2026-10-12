import { LiveRefused, openLiveFrames } from '../channels/live-frames.js';
import { COMPANION_PATH } from './feed.js';

const TYPES = ['baseline', 'selection', 'activity', 'message'] as const;

export interface CompanionLiveFrame {
  type: (typeof TYPES)[number];
  value: unknown;
  id?: string;
}

const ID_LIMIT = 128;

export async function* followCompanion(
  open: (request: Request) => Response,
  resume: string,
  lastEventId: string,
  signal: AbortSignal,
): AsyncGenerator<CompanionLiveFrame> {
  if (
    typeof resume !== 'string' ||
    typeof lastEventId !== 'string' ||
    resume.length > ID_LIMIT ||
    lastEventId.length > ID_LIMIT
  )
    throw new LiveRefused('invalid', 'Invalid subscription');
  const query = `subscribe=1${resume.length > 0 ? `&resume=${encodeURIComponent(resume)}` : ''}`;
  for await (const frame of openLiveFrames(open, query, lastEventId, signal, COMPANION_PATH)) {
    const type = TYPES.find((candidate) => frame.event === `companion/${candidate}`);
    if (type === undefined) continue;
    const value: unknown = JSON.parse(frame.data);
    yield frame.id === undefined ? { type, value } : { type, value, id: frame.id };
  }
}

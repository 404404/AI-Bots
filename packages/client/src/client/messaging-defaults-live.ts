import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import { parseContentRedactions } from './content-redactions.js';

const listeners = new Set<() => void>();
const purgeListeners = new Set<(placements: PurgedPlacement[]) => void>();
const redactions = new Map<string, PurgedPlacement>();
let source: EventSource | undefined;
let activityBaseline: string | undefined;
const activityConsumers = new Set<ActivitySource>();
export type ActivityEventSource = Pick<EventTarget, 'addEventListener'> & {
  readonly readyState: number;
  close(): void;
};

function releaseUnusedSource(): void {
  if (listeners.size || activityConsumers.size) return;
  source?.close();
  source = undefined;
  activityBaseline = undefined;
  redactions.clear();
}

class ActivitySource extends EventTarget implements ActivityEventSource {
  private closed = false;
  get readyState(): number {
    return this.closed ? 2 : (source?.readyState ?? 2);
  }
  publish(type: string, data?: string): void {
    if (this.closed) return;
    this.dispatchEvent(data === undefined ? new Event(type) : new MessageEvent(type, { data }));
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    activityConsumers.delete(this);
    releaseUnusedSource();
  }
}

function ensureSource(): void {
  if (source || typeof EventSource === 'undefined') return;
  const next = new EventSource('/api/botharness/stream?scope=roster&activity=1');
  source = next;
  activityBaseline = undefined;
  next.addEventListener('roster/changed', () => {
    if (source === next) notify();
  });
  next.addEventListener('open', () => {
    if (source === next) notify();
  });
  next.addEventListener('content/purged', (event) => {
    if (source !== next) return;
    const placements = parseContentRedactions(event);
    for (const placement of placements)
      redactions.set(JSON.stringify([placement.channelId, placement.messageId]), placement);
    for (const callback of [...purgeListeners]) callback(placements);
  });
  next.addEventListener('activity/snapshot', (event) => {
    if (source !== next || !(event instanceof MessageEvent) || typeof event.data !== 'string')
      return;
    activityBaseline = event.data;
    for (const consumer of [...activityConsumers])
      consumer.publish('activity/snapshot', event.data);
  });
  next.addEventListener('error', () => {
    if (source !== next) return;
    activityBaseline = undefined;
    if (next.readyState === 2) {
      source = undefined;
    }
    for (const consumer of [...activityConsumers]) consumer.publish('error');
  });
}

export function openRosterActivity(): ActivityEventSource | undefined {
  if (typeof EventSource === 'undefined') return undefined;
  const consumer = new ActivitySource();
  activityConsumers.add(consumer);
  try {
    ensureSource();
  } catch (error) {
    consumer.close();
    throw error;
  }
  queueMicrotask(() => {
    if (source?.readyState !== 1) consumer.publish('error');
    else if (activityBaseline !== undefined)
      consumer.publish('activity/snapshot', activityBaseline);
  });
  return consumer;
}
const notify = () => {
  for (const listener of [...listeners]) listener();
};
export function subscribeMessagingDefaults(
  listener: () => void,
  onPurge?: (placements: PurgedPlacement[]) => void,
): () => void {
  listeners.add(listener);
  if (onPurge) {
    purgeListeners.add(onPurge);
    queueMicrotask(() => {
      if (!purgeListeners.has(onPurge)) return;
      const values = [...redactions.values()];
      for (let offset = 0; offset < values.length; offset += 100)
        onPurge(values.slice(offset, offset + 100));
    });
  }
  ensureSource();
  return () => {
    listeners.delete(listener);
    if (onPurge) purgeListeners.delete(onPurge);
    releaseUnusedSource();
  };
}

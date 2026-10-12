import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import { parseContentRedactions } from './content-redactions.js';

const listeners = new Set<() => void>();
const purgeListeners = new Set<(placements: PurgedPlacement[]) => void>();
const redactions = new Map<string, PurgedPlacement>();
export interface RosterHandlers {
  ready(): void;
  changed(): void;
  purged(placements: PurgedPlacement[]): void;
}
export type RosterTransport = (handlers: RosterHandlers) => () => void;

let transport: RosterTransport | undefined;
let stop: (() => void) | undefined;
const notify = () => {
  for (const listener of [...listeners]) listener();
};
const purged = (placements: PurgedPlacement[]): void => {
  for (const placement of placements)
    redactions.set(JSON.stringify([placement.channelId, placement.messageId]), placement);
  for (const callback of [...purgeListeners]) callback(placements);
};
const sse: RosterTransport = (handlers) => {
  if (typeof EventSource === 'undefined') return () => {};
  const source = new EventSource('/api/botharness/stream?scope=roster');
  source.addEventListener('roster/changed', handlers.changed);
  source.addEventListener('open', handlers.ready);
  source.addEventListener('content/purged', (event) =>
    handlers.purged(parseContentRedactions(event)),
  );
  return () => source.close();
};
const open = (): void => {
  stop = (transport ?? sse)({ ready: notify, changed: notify, purged });
};
export function installRosterTransport(next: RosterTransport): () => void {
  const swap = (value: RosterTransport | undefined): void => {
    transport = value;
    if (stop === undefined) return;
    stop();
    open();
  };
  swap(next);
  return () => {
    if (transport === next) swap(undefined);
  };
}
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
  if (stop === undefined) open();
  return () => {
    listeners.delete(listener);
    if (onPurge) purgeListeners.delete(onPurge);
    if (!listeners.size) {
      stop?.();
      stop = undefined;
      redactions.clear();
    }
  };
}

import { defaultStorage, type ConfigStorage } from './roster-config.js';

export type MemoryView = 'graph' | 'versions' | 'branches';

export const MEMORY_VIEW_PREFERENCES_KEY = 'botharness/memory-view.v1';

const listeners = new Set<() => void>();
let snapshot: MemoryView | undefined;

export function readMemoryView(storage: ConfigStorage | undefined = defaultStorage()): MemoryView {
  try {
    const record: unknown = JSON.parse(storage?.getItem(MEMORY_VIEW_PREFERENCES_KEY) ?? '{}');
    const view =
      typeof record === 'object' && record !== null
        ? (record as Record<string, unknown>)['view']
        : undefined;
    return view === 'versions' || view === 'branches' ? view : 'graph';
  } catch {
    return 'graph';
  }
}

export function memoryViewSnapshot(): MemoryView {
  snapshot ??= readMemoryView();
  return snapshot;
}

export function subscribeMemoryView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMemoryView(
  view: MemoryView,
  storage: ConfigStorage | undefined = defaultStorage(),
): void {
  if (snapshot === view) return;
  snapshot = view;
  try {
    storage?.setItem(MEMORY_VIEW_PREFERENCES_KEY, JSON.stringify({ view }));
  } catch {}
  listeners.forEach((listener) => listener());
}

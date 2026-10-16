import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDraftPresentation } from '../src/host/stream-presentation';
import type { ConversationDraft, ConversationStatus } from '../src/host/conversation';

function fixture() {
  let drafts: ConversationDraft[] = [{ draftId: 'd1', botSlug: 'ada', body: '' }];
  let status: ConversationStatus = 'live';
  const listeners = new Set<() => void>();
  const source = {
    getSnapshot: () => ({ drafts, status }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const store = createDraftPresentation(source, 'd1');
  const changed = vi.fn();
  const stop = store.subscribe(changed);
  return {
    store,
    changed,
    stop,
    listeners,
    body: () => store.getSnapshot()?.body,
    append(body: string, nextStatus: ConversationStatus = 'live') {
      drafts = [{ draftId: 'd1', botSlug: 'ada', body }];
      status = nextStatus;
      for (const listener of listeners) listener();
    },
    settle() {
      drafts = [];
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('draft presentation buffer', () => {
  it('batches a fast source, prefers paragraph boundaries and bounds an unfinished tail', () => {
    vi.useFakeTimers();
    const f = fixture();
    for (let i = 1; i <= 50; i++) f.append('字'.repeat(i));
    expect(f.body()).toBe('');
    vi.advanceTimersByTime(80);
    expect(f.body()).toBe('字'.repeat(50));
    expect(f.changed).toHaveBeenCalledTimes(1);
    const prefix = '字'.repeat(50);
    f.append(prefix + '\n\n下一段👨‍👩‍👧‍👦');
    vi.advanceTimersByTime(80);
    expect(f.body()).toBe(prefix + '\n\n');
    vi.advanceTimersByTime(160);
    expect(f.body()).toBe(prefix + '\n\n下一段👨‍👩‍👧‍👦');
    f.stop();
  });

  it('never erases a published prefix during appends and leaves no queue after settlement', () => {
    vi.useFakeTimers();
    const f = fixture();
    let previous = '';
    for (let i = 1; i <= 100; i++) {
      f.append('中文🙂\n\n'.repeat(i));
      vi.advanceTimersByTime(20);
      expect(f.body()?.startsWith(previous)).toBe(true);
      previous = f.body() ?? '';
    }
    f.settle();
    expect(f.store.getSnapshot()).toBeUndefined();
    const count = f.changed.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(f.changed).toHaveBeenCalledTimes(count);
    f.stop();
  });

  it('flushes received content on interruption and accepts an authoritative correction', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.append('尚未显示的内容', 'interrupted');
    expect(f.body()).toBe('尚未显示的内容');
    f.append('已修正的内容');
    expect(f.body()).toBe('已修正的内容');
    f.stop();
    expect(f.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { expect, it } from 'vitest';
import { RemoteJournalStream } from '@deepseek-ai/dsh-api-gateway/client';

interface Entry {
  revision: number;
}
interface Page {
  entries: Entry[];
  hasOlder: boolean;
}
type Frame =
  | { type: 'opened'; cursor: number; page: Page }
  | { type: 'entry'; entry: Entry }
  | { type: 'notification'; notification: string };
interface Request {
  before?: number;
  limit: number;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const range = (from: number, to: number): Entry[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => ({ revision: from + index }));

function harness(log: number) {
  const state = { log };
  const changes: string[] = [];
  const reads: [Request, number][] = [];
  const failures: unknown[] = [];
  const generations: { push(frame: Frame): void; end(): void }[] = [];
  let reopen: (() => void) | undefined;
  const page = (request: Request, through: number): Page => {
    const last = request.before === undefined ? through : Math.min(through, request.before - 1);
    const first = Math.max(1, last - request.limit + 1);
    return { entries: range(first, last), hasOlder: first > 1 };
  };
  const remote = {
    $stream: (options: {
      open: (signal: AbortSignal) => AsyncIterable<Frame>;
      ended: (accepted: boolean) => Error;
    }) => {
      const lifetime = new AbortController();
      return {
        signal: lifetime.signal,
        restart: () => reopen?.(),
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for (let generation = 1; !lifetime.signal.aborted; generation++) {
            const abort = new AbortController();
            lifetime.signal.addEventListener('abort', () => abort.abort(), { once: true });
            reopen = () => abort.abort();
            let accepted = false;
            for await (const value of options.open(abort.signal))
              yield {
                generation,
                value,
                signal: abort.signal,
                accept: () => {
                  accepted = true;
                },
              };
            if (lifetime.signal.aborted) return;
            if (!abort.signal.aborted && !accepted) throw options.ended(false);
          }
        },
      };
    },
  };
  class ChannelJournal extends RemoteJournalStream<Page, Entry, number, Request, string> {
    constructor() {
      super(remote as never, {
        name: 'Channel journal',
        emptyCursor: 0,
        entries: (value) => value.entries,
        hasMore: (value) => value.hasOlder,
        first: (entry) => entry.revision,
        last: (entry) => entry.revision,
        compare: (left, right) => left - right,
        follows: (left, right) => right === left + 1,
        publish: (change) =>
          changes.push(
            change.type === 'append'
              ? `append ${change.entry.revision}`
              : change.type === 'notification'
                ? `notification ${change.notification}`
                : `${change.type} ${change.entries[0]?.revision ?? '-'}..${change.entries.at(-1)?.revision ?? '-'}`,
          ),
        failed: (error) => failures.push(error),
      });
    }
    protected async *follow(request: Request, signal: AbortSignal): AsyncGenerator<Frame> {
      const queue: (Frame | undefined)[] = [];
      let wake: (() => void) | undefined;
      const put = (frame: Frame | undefined): void => {
        queue.push(frame);
        wake?.();
      };
      generations.push({ push: put, end: () => put(undefined) });
      signal.addEventListener('abort', () => put(undefined), { once: true });
      yield { type: 'opened', cursor: state.log, page: page(request, state.log) };
      for (;;) {
        while (queue.length === 0)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        const next = queue.shift();
        if (next === undefined) return;
        yield next;
      }
    }
    protected async readPage(request: Request, through: number): Promise<Page> {
      reads.push([request, through]);
      return page(request, through);
    }
    protected repairRequest(initial: Request): Request {
      return { limit: initial.limit };
    }
  }
  return {
    state,
    changes,
    reads,
    failures,
    generations,
    journal: new ChannelJournal(),
    reconnect: () => reopen?.(),
  };
}

it('opens with a replace of the tail page, appends in order and keeps notifications cursorless', async () => {
  const { journal, changes, generations, failures } = harness(10);
  await journal.open({ limit: 5 });
  generations[0]!.push({ type: 'entry', entry: { revision: 11 } });
  generations[0]!.push({ type: 'notification', notification: 'draft' });
  generations[0]!.push({ type: 'entry', entry: { revision: 11 } });
  await settle();
  expect(changes).toEqual(['replace 6..10', 'append 11', 'notification draft']);
  expect(failures).toEqual([]);
  await journal.dispose();
});

it('repairs a gap by reading one page through the missing cursor and replacing the window', async () => {
  const { journal, changes, generations, reads, state } = harness(10);
  await journal.open({ limit: 5 });
  state.log = 13;
  generations[0]!.push({ type: 'entry', entry: { revision: 13 } });
  await settle();
  expect(reads).toEqual([[{ limit: 5 }, 13]]);
  expect(changes).toEqual(['replace 6..10', 'replace 9..13']);
  await journal.dispose();
});

it('prepends an older page only when it ends right before the window', async () => {
  const { journal, changes, failures } = harness(10);
  await journal.open({ limit: 5 });
  await journal.prepend({ before: 6, limit: 5 });
  expect(changes).toEqual(['replace 6..10', 'prepend 1..5']);
  await expect(journal.prepend({ before: 1, limit: 5 })).resolves.toBeUndefined();
  expect(changes.at(-1)).toBe('prepend -..-');
  expect(failures).toEqual([]);
  await journal.dispose();
});

it('replaces the whole window with the new tail page when a generation reopens after paging up', async () => {
  const { journal, changes, generations, state, reconnect } = harness(10);
  await journal.open({ limit: 5 });
  await journal.prepend({ before: 6, limit: 5 });
  state.log = 12;
  reconnect();
  await settle();
  expect(changes).toEqual(['replace 6..10', 'prepend 1..5', 'replace 8..12']);
  expect(generations).toHaveLength(2);

  await expect(journal.prepend({ before: 6, limit: 5 })).rejects.toThrow('discontinuous');
  expect(changes.at(-1)).toBe('prepend -..-');
  await journal.prepend({ before: 8, limit: 5 });
  expect(changes.at(-1)).toBe('prepend 3..7');
  await journal.dispose();
});

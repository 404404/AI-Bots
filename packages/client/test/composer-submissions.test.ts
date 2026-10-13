import { describe, expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { BridgeCallError, type BridgeCall } from '../src/client/bridge.js';
import {
  ComposerSubmissionStore,
  recallEntries,
  stepRecall,
  SUBMISSION_HISTORY_LIMIT,
  SUBMISSION_PREFIX,
} from '../src/client/composer-submission-store.js';
import { createStore } from '../src/client/store.js';

function memoryStorage() {
  const values = new Map<string, string>();
  let failing = false;
  return {
    values,
    fail(next: boolean) {
      failing = next;
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failing) throw new Error('quota exceeded');
      values.set(key, value);
    },
  };
}
const attempt = (id: string, text: string, at = '2026-10-13T00:00:00.000Z') => ({
  id,
  at,
  text,
  mentions: [],
  channelRefs: [],
});
const states = (store: ComposerSubmissionStore, scope = 's') =>
  store.read(scope).attempts.map((item) => `${item.id}:${item.state}`);

describe('composer submission snapshots', () => {
  it('saves the accepted input with its original id before any outcome and keeps real states', () => {
    const storage = memoryStorage();
    const store = new ComposerSubmissionStore(storage);
    expect(store.record('s', attempt('a', 'first'))).toBe(true);
    expect(JSON.parse(storage.values.get(SUBMISSION_PREFIX + 's')!).attempts[0]).toMatchObject({
      id: 'a',
      text: 'first',
      state: 'pending',
    });
    store.record('s', attempt('b', 'second', '2026-10-13T00:00:01.000Z'));
    store.record('s', attempt('c', 'third', '2026-10-13T00:00:02.000Z'));
    store.settle('s', 'a', 'sent');
    store.settle('s', 'b', 'failed', 'PersonaBot is archived');
    store.settle('s', 'c', 'unknown', 'network down');
    expect(states(store)).toEqual(['a:sent', 'b:failed', 'c:unknown']);
    expect(store.read('s').attempts[1]?.error).toBe('PersonaBot is archived');
    expect(store.read('other').attempts).toEqual([]);
  });
  it('after a reload keeps failed input and treats an interrupted send as unconfirmed, never as unsent', () => {
    const storage = memoryStorage();
    const first = new ComposerSubmissionStore(storage);
    first.record('s', attempt('a', 'failed one'));
    first.settle('s', 'a', 'failed', 'rejected');
    first.record('s', attempt('b', 'in flight', '2026-10-13T00:00:01.000Z'));
    expect(states(first)).toEqual(['a:failed', 'b:pending']);
    const reopened = new ComposerSubmissionStore(storage, () => Date.parse('2026-10-13T00:10:00Z'));
    expect(states(reopened)).toEqual(['a:failed', 'b:unknown']);
    expect(reopened.reconcilable('s').map((item) => item.id)).toEqual(['b']);
  });
  it('does not judge another tab in-flight send until it is stale', () => {
    const storage = memoryStorage();
    new ComposerSubmissionStore(storage).record('s', attempt('a', 'x', '2026-10-13T00:00:00.000Z'));
    const fresh = new ComposerSubmissionStore(storage, () => Date.parse('2026-10-13T00:00:05Z'));
    expect(fresh.reconcilable('s')).toEqual([]);
    const later = new ComposerSubmissionStore(storage, () => Date.parse('2026-10-13T00:01:00Z'));
    expect(later.reconcilable('s').map((item) => item.id)).toEqual(['a']);
  });
  it('trims ordinary history to the newest entries but never an unsent or unconfirmed input', () => {
    const store = new ComposerSubmissionStore(memoryStorage());
    store.record('s', attempt('keep-failed', 'old failed', '2026-10-12T00:00:00.000Z'));
    store.settle('s', 'keep-failed', 'failed', 'x');
    store.record('s', attempt('keep-unknown', 'old unknown', '2026-10-12T00:00:01.000Z'));
    store.settle('s', 'keep-unknown', 'unknown');
    for (let index = 0; index < SUBMISSION_HISTORY_LIMIT + 20; index++) {
      const at = new Date(Date.parse('2026-10-13T00:00:00Z') + index * 1000).toISOString();
      store.record('s', attempt(`sent-${index}`, `message ${index}`, at));
      store.settle('s', `sent-${index}`, 'sent');
    }
    const attempts = store.read('s').attempts;
    expect(attempts.filter((item) => item.state === 'sent')).toHaveLength(SUBMISSION_HISTORY_LIMIT);
    expect(attempts.some((item) => item.id === 'sent-0')).toBe(false);
    expect(attempts.some((item) => item.id === `sent-${SUBMISSION_HISTORY_LIMIT + 19}`)).toBe(true);
    expect(attempts.slice(0, 2).map((item) => item.id)).toEqual(['keep-failed', 'keep-unknown']);
  });
  it('bounds ordinary history by bytes as well as count', () => {
    const store = new ComposerSubmissionStore(memoryStorage());
    for (let index = 0; index < 10; index++) {
      const at = new Date(Date.parse('2026-10-13T00:00:00Z') + index * 1000).toISOString();
      store.record('s', attempt(`big-${index}`, 'x'.repeat(60_000), at));
      store.settle('s', `big-${index}`, 'sent');
    }
    const kept = store.read('s').attempts.map((item) => item.id);
    expect(kept.length).toBeLessThan(10);
    expect(kept.at(-1)).toBe('big-9');
  });
  it('reports a storage failure and keeps the only recoverable copy in memory', () => {
    const storage = memoryStorage();
    const store = new ComposerSubmissionStore(storage);
    storage.fail(true);
    expect(store.record('s', attempt('a', 'only copy'))).toBe(false);
    expect(store.read('s').error).toBe('quota');
    store.settle('s', 'a', 'failed', 'offline');
    expect(states(store)).toEqual(['a:failed']);
    expect(storage.values.size).toBe(0);
    storage.fail(false);
    expect(store.record('s', attempt('b', 'next', '2026-10-13T00:00:01.000Z'))).toBe(true);
    expect(store.read('s').error).toBeUndefined();
    expect(JSON.parse(storage.values.get(SUBMISSION_PREFIX + 's')!).attempts).toHaveLength(2);
  });
  it('rejects a corrupt record instead of overwriting it', () => {
    const storage = memoryStorage();
    storage.values.set(SUBMISSION_PREFIX + 's', '{broken');
    const store = new ComposerSubmissionStore(storage);
    expect(store.read('s').error).toBe('corrupt');
    expect(store.record('s', attempt('a', 'kept in memory'))).toBe(false);
    expect(storage.values.get(SUBMISSION_PREFIX + 's')).toBe('{broken');
    expect(states(store)).toEqual(['a:pending']);
  });
  it('recalls newest first, includes failed and unconfirmed input, and folds repeated text', () => {
    const store = new ComposerSubmissionStore(memoryStorage());
    const add = (
      id: string,
      text: string,
      second: number,
      state: 'sent' | 'failed' | 'unknown',
    ) => {
      store.record('s', attempt(id, text, `2026-10-13T00:00:0${second}.000Z`));
      store.settle('s', id, state);
    };
    add('a', 'one', 1, 'sent');
    add('b', 'two', 2, 'failed');
    add('c', 'two', 3, 'sent');
    add('d', '', 4, 'sent');
    add('e', 'three', 5, 'unknown');
    expect(recallEntries(store.read('s').attempts).map((item) => item.text)).toEqual([
      'three',
      'two',
      'one',
    ]);
  });
});

describe('Up/Down recall stepping', () => {
  const entries = ['three', 'two', 'one'].map((text, index) => ({
    ...attempt(String(index), text),
    state: 'sent' as const,
  }));
  it('starts only from an empty input with Up and never from a draft in progress', () => {
    expect(stepRecall(undefined, 'older', 'typing', entries)).toEqual({ kind: 'ignore' });
    expect(stepRecall(undefined, 'newer', '', entries)).toEqual({ kind: 'ignore' });
    expect(stepRecall(undefined, 'older', '', [])).toEqual({ kind: 'ignore' });
    expect(stepRecall(undefined, 'older', '', entries)).toMatchObject({
      kind: 'show',
      cursor: { index: 0, text: 'three' },
    });
  });
  it('walks older and newer, stops at the oldest and returns to the saved draft past the newest', () => {
    const first = { index: 0, text: 'three' };
    expect(stepRecall(first, 'older', 'three', entries)).toMatchObject({
      cursor: { index: 1, text: 'two' },
    });
    expect(stepRecall({ index: 2, text: 'one' }, 'older', 'one', entries)).toEqual({
      kind: 'stay',
    });
    expect(stepRecall({ index: 1, text: 'two' }, 'newer', 'two', entries)).toMatchObject({
      cursor: { index: 0, text: 'three' },
    });
    expect(stepRecall(first, 'newer', 'three', entries)).toEqual({ kind: 'restore' });
  });
  it('gives the arrow keys back once the recalled text has been edited', () => {
    const cursor = { index: 0, text: 'three' };
    expect(stepRecall(cursor, 'older', 'three!', entries)).toEqual({ kind: 'ignore' });
    expect(stepRecall(cursor, 'newer', 'three\nmore', entries)).toEqual({ kind: 'ignore' });
  });
});

const DM = {
  id: 'dm-ada',
  type: 'dm',
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};
const BOT = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-09-19T00:00:00.000Z',
};

async function open(storage: ReturnType<typeof memoryStorage>, profileId = 'profile-1') {
  const committed: Record<string, unknown>[] = [];
  const host = {
    committed,
    send: (payload: Record<string, unknown>): unknown => {
      const message = {
        id: payload['messageId'],
        at: '2026-10-13T00:00:10.000Z',
        author: { kind: 'human' },
        body: payload['body'],
      };
      committed.push(message);
      return { message };
    },
  };
  const page = () => ({
    revision: committed.length,
    page: {
      entries: [...committed],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    },
  });
  const handlers: Record<string, (payload: Record<string, unknown>) => unknown> = {
    list: () => ({ bots: [BOT] }),
    channels: () => ({ channels: [DM] }),
    channelDm: () => ({ channel: DM }),
    composerIdentity: () => ({ hostId: 'host-1', profileId, humanId: 'human-1' }),
    channelMessages: () => ({ revision: committed.length, messages: [...committed].reverse() }),
    channelTimeline: (payload) => {
      if (payload['direction'] !== 'around') return page();
      const found = committed.filter((message) => message['id'] === payload['around']);
      if (found.length === 0)
        throw new BridgeCallError('invalid-input', 'invalid or expired timeline anchor');
      return {
        revision: committed.length,
        page: {
          entries: found,
          olderCursor: null,
          newerCursor: null,
          hasOlder: false,
          hasNewer: false,
        },
      };
    },
    channelSend: (payload) => host.send(payload),
  };
  const call: BridgeCall = async (endpoint, payload) => {
    try {
      return { ok: true, value: (await handlers[endpoint]?.(payload)) ?? {} };
    } catch (error) {
      if (error instanceof BridgeCallError)
        return { ok: false, error: { code: error.code, message: error.message, details: {} } };
      throw error;
    }
  };
  const clientStore = createStore();
  const actions = createActions(call, clientStore, {
    pickDirectory: async () => null,
    createWorkspace: async () => ({ workspaceId: 'w' }),
    submissions: new ComposerSubmissionStore(storage, () => Date.parse('2030-01-01T00:00:00Z')),
  });
  await actions.load();
  await actions.openBot('ada');
  const bubbles = () =>
    clientStore
      .getSnapshot()
      .conversation.messages.map(
        (message) =>
          `${message.body}:${message.pending === true ? 'pending' : message.unconfirmed === true ? 'unconfirmed' : message.failed !== undefined ? 'failed' : 'sent'}`,
      );
  const history = () =>
    actions.submissions.snapshot('dm-ada')?.attempts.map((item) => `${item.text}:${item.state}`);
  return { actions, clientStore, host, handlers, bubbles, history };
}

describe('submission snapshots in the send flow', () => {
  it('records a successful send for recall under the original id without a second bubble', async () => {
    const view = await open(memoryStorage());
    const begun = view.actions.submissions.begin('dm-ada', {
      text: 'hello',
      mentions: [],
      channelRefs: [],
    })!;
    expect(view.history()).toEqual(['hello:pending']);
    await expect(
      view.actions.send(
        'hello',
        undefined,
        undefined,
        undefined,
        [],
        [],
        undefined,
        undefined,
        begun.id,
      ),
    ).resolves.toBe(true);
    expect(view.host.committed[0]?.['id']).toBe(begun.id);
    expect(view.bubbles()).toEqual(['hello:sent']);
    expect(view.history()).toEqual(['hello:sent']);
  });
  it('an input refused before submission stays a draft and leaves no history entry', async () => {
    const view = await open(memoryStorage());
    const begun = view.actions.submissions.begin('dm-ada', {
      text: ' ',
      mentions: [],
      channelRefs: [],
    })!;
    await expect(
      view.actions.send(
        ' ',
        undefined,
        undefined,
        undefined,
        [],
        [],
        undefined,
        undefined,
        begun.id,
      ),
    ).resolves.toBe(false);
    view.actions.submissions.cancel('dm-ada', begun.id);
    expect(view.history()).toEqual([]);
    expect(view.host.committed).toEqual([]);
  });
  it('a Host rejection is failed, stays recoverable after a reload and can be restored', async () => {
    const storage = memoryStorage();
    const view = await open(storage);
    view.host.send = () => {
      throw new BridgeCallError('invalid-input', 'PersonaBot is archived: ada');
    };
    await expect(view.actions.send('rejected text')).resolves.toBe(false);
    expect(view.bubbles()).toEqual(['rejected text:failed']);
    expect(view.history()).toEqual(['rejected text:failed']);
    const reopened = await open(storage);
    expect(reopened.bubbles()).toEqual(['rejected text:failed']);
    const id = reopened.clientStore.getSnapshot().conversation.messages[0]!.id;
    expect(reopened.actions.dismissFailedMessage('dm-ada', id)).toBe(true);
    expect(reopened.bubbles()).toEqual([]);
    expect(reopened.history()).toEqual(['rejected text:restored']);
    expect((await open(storage)).bubbles()).toEqual([]);
  });
  it('a lost acknowledgement is unconfirmed, then matched to the Host message by its original id', async () => {
    const storage = memoryStorage();
    const view = await open(storage);
    const accept = view.host.send;
    view.host.send = (payload) => {
      accept(payload);
      throw new Error('connection closed');
    };
    await expect(view.actions.send('was it sent?')).resolves.toBe(false);
    expect(view.bubbles()).toEqual(['was it sent?:unconfirmed']);
    expect(view.history()).toEqual(['was it sent?:unknown']);
    const id = view.clientStore.getSnapshot().conversation.messages[0]!.id;
    await expect(view.actions.submissions.check('dm-ada', id)).resolves.toBe('committed');
    await view.actions.submissions.reconcile('dm-ada');
    expect(view.bubbles()).toEqual(['was it sent?:sent']);
    expect(view.history()).toEqual(['was it sent?:sent']);
    expect(view.host.committed).toHaveLength(1);
  });
  it('an unconfirmed input the Host never received becomes failed only after the Host says so', async () => {
    const storage = memoryStorage();
    const view = await open(storage);
    view.host.send = () => {
      throw new Error('connection closed');
    };
    await view.actions.send('never arrived');
    const id = view.clientStore.getSnapshot().conversation.messages[0]!.id;
    const offline = view.handlers['channelTimeline']!;
    view.handlers['channelTimeline'] = () => {
      throw new Error('offline');
    };
    await expect(view.actions.submissions.check('dm-ada', id)).resolves.toBe('unknown');
    await view.actions.submissions.reconcile('dm-ada');
    expect(view.bubbles()).toEqual(['never arrived:unconfirmed']);
    view.handlers['channelTimeline'] = offline;
    await view.actions.submissions.reconcile('dm-ada');
    expect(view.bubbles()).toEqual(['never arrived:failed']);
    expect(view.host.committed).toEqual([]);
  });
  it('a page closed mid-send reopens with an unconfirmed entry and never resends by itself', async () => {
    const storage = memoryStorage();
    const first = await open(storage);
    first.actions.submissions.begin('dm-ada', {
      text: 'interrupted',
      mentions: [],
      channelRefs: [],
    });
    const reopened = await open(storage);
    expect(reopened.bubbles()).toEqual(['interrupted:unconfirmed']);
    await reopened.actions.submissions.reconcile('dm-ada');
    expect(reopened.bubbles()).toEqual(['interrupted:failed']);
    expect(reopened.host.committed).toEqual([]);
  });
  it('a late failure settles its own submission and leaves a newer one alone', async () => {
    const view = await open(memoryStorage());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const accept = view.host.send;
    view.host.send = async () => {
      await gate;
      throw new BridgeCallError('invalid-input', 'rejected late');
    };
    const slow = view.actions.send('slow one');
    await Promise.resolve();
    view.host.send = accept;
    release();
    await expect(slow).resolves.toBe(false);
    await expect(view.actions.send('newer one')).resolves.toBe(true);
    expect(view.history()).toEqual(['slow one:failed', 'newer one:sent']);
  });
  it('a second tab follows a failure restored or newly failed in the first', async () => {
    const storage = memoryStorage();
    const first = await open(storage);
    first.host.send = () => {
      throw new BridgeCallError('invalid-input', 'rejected');
    };
    await first.actions.send('shared failure');
    const second = await open(storage);
    expect(second.bubbles()).toEqual(['shared failure:failed']);
    const id = second.clientStore.getSnapshot().conversation.messages[0]!.id;
    expect(second.actions.dismissFailedMessage('dm-ada', id)).toBe(true);
    first.actions.submissions.sync('dm-ada');
    expect(first.bubbles()).toEqual([]);
    expect(first.actions.dismissFailedMessage('dm-ada', id)).toBe(false);
    await first.actions.send('another failure');
    second.actions.submissions.sync('dm-ada');
    expect(second.bubbles()).toEqual(['another failure:failed']);
  });
  it('a second tab follows an unconfirmed input that the first tab settled as failed', async () => {
    const storage = memoryStorage();
    const first = await open(storage);
    first.host.send = () => {
      throw new Error('connection closed');
    };
    await first.actions.send('checked elsewhere');
    const second = await open(storage);
    expect(second.bubbles()).toEqual(['checked elsewhere:unconfirmed']);
    await first.actions.submissions.reconcile('dm-ada');
    expect(first.bubbles()).toEqual(['checked elsewhere:failed']);
    second.actions.submissions.sync('dm-ada');
    expect(second.bubbles()).toEqual(['checked elsewhere:failed']);
  });
  it('discards a check result when the attempt was settled while the Host was being asked', async () => {
    const view = await open(memoryStorage());
    view.host.send = () => {
      throw new Error('connection closed');
    };
    await view.actions.send('settled meanwhile');
    const id = view.clientStore.getSnapshot().conversation.messages[0]!.id;
    const lookup = view.handlers['channelTimeline']!;
    view.handlers['channelTimeline'] = (payload) => {
      if (payload['direction'] === 'around') view.actions.dismissFailedMessage('dm-ada', id);
      return lookup(payload);
    };
    await view.actions.submissions.reconcile('dm-ada');
    expect(view.history()).toEqual(['settled meanwhile:restored']);
  });
  it('keeps submissions of another Host profile out of this one', async () => {
    const storage = memoryStorage();
    const view = await open(storage, 'profile-1');
    view.host.send = () => {
      throw new BridgeCallError('invalid-input', 'no');
    };
    await view.actions.send('private to profile 1');
    const other = await open(storage, 'profile-2');
    expect(other.bubbles()).toEqual([]);
    expect(other.history()).toEqual([]);
  });
});

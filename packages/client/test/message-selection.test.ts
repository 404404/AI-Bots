import { describe, expect, it } from 'vitest';

import {
  conversationText,
  MESSAGE_SELECTION_LIMIT,
  selectionRange,
  toggleSelection,
} from '../src/client/message-selection-state.js';
import type { ChannelMessage } from '../src/client/store.js';

const message = (id: string, minute: number, extra: Partial<ChannelMessage> = {}): ChannelMessage =>
  ({
    id,
    at: new Date(Date.UTC(2026, 9, 13, 4, minute)).toISOString(),
    author: { kind: 'human' },
    body: id,
    ...extra,
  }) as ChannelMessage;

describe('message selection', () => {
  it('toggles saved messages and skips pending, streaming or failed ones', () => {
    const one = message('one', 1);
    expect(toggleSelection([], one)).toEqual(['one']);
    expect(toggleSelection(['one'], one)).toEqual([]);
    expect(toggleSelection([], message('p', 2, { pending: true }))).toEqual([]);
    expect(toggleSelection([], message('s', 2, { streaming: true }))).toEqual([]);
    expect(toggleSelection([], message('f', 2, { failed: 'offline' }))).toEqual([]);
    const full = Array.from({ length: MESSAGE_SELECTION_LIMIT }, (_, index) => `m${index}`);
    expect(toggleSelection(full, one)).toBe(full);
  });

  it('exports from the earliest to the latest selected message', () => {
    const messages = [message('a', 1), message('b', 5), message('c', 9)];
    expect(selectionRange(['c', 'a'], messages)).toEqual({
      fromMessageId: 'a',
      toMessageId: 'c',
      messageIds: ['a', 'c'],
    });
    expect(selectionRange(['b'], messages)).toEqual({ fromMessageId: 'b', messageIds: ['b'] });
    expect(selectionRange(['gone'], messages)).toBeUndefined();
  });

  it('copies the selection as a time-ordered conversation with attachment names', () => {
    const messages = [
      message('a', 1, { body: '  @Mira hello  ' }),
      message('b', 5, { author: { kind: 'bot', slug: 'mira' }, body: 'hi' }),
      message('c', 9, {
        body: '',
        attachments: [{ name: 'log.txt' }] as NonNullable<ChannelMessage['attachments']>,
      }),
      message('skip', 3, { body: 'not selected' }),
    ];
    const text = conversationText(['c', 'a', 'b'], messages, {
      title: '产品讨论',
      author: (item) => (item.author.kind === 'bot' ? 'Mira' : 'You'),
      attachment: 'Attachment',
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('产品讨论');
    expect(text).not.toContain('not selected');
    expect(text.indexOf('@Mira hello')).toBeLessThan(text.indexOf('hi'));
    expect(text).toMatch(/^You {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2}\n@Mira hello$/mu);
    expect(text).toContain('[Attachment: log.txt]');
  });
});

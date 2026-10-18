import { describe, expect, it } from 'vitest';
import {
  leadingMessageMentions,
  messageMentionRuns,
  mentionIdentity,
} from '../src/ui/chat/message-mentions';

const mention = { botSlug: 'xiaoman-id', label: '小满', start: 0, end: 3 };

describe('native message mentions', () => {
  it('keeps Markdown intact after canonical leading mentions, matching Web', () => {
    expect(leadingMessageMentions('@小满 **改一版**\n\n- 先列事实', [mention])).toEqual({
      mentions: [mention],
      text: '**改一版**\n\n- 先列事实',
    });
    const second = { botSlug: 'work-id', label: '阿衡', start: 4, end: 7 };
    expect(leadingMessageMentions('@小满 @阿衡 正文', [second, mention])?.text).toBe('正文');
    expect(leadingMessageMentions('@小满', [mention])?.text).toBe('');
  });

  it('resolves a renamed identity by ID and never retargets an unknown ID by label', () => {
    const sameName = { slug: 'other-id', displayName: '小满' };
    const renamed = { slug: mention.botSlug, displayName: '林小满' };
    expect(mentionIdentity(mention, [sameName, renamed])).toEqual({
      label: '林小满',
      bot: renamed,
    });
    expect(mentionIdentity(mention, [sameName])).toEqual({ label: '小满', bot: undefined });
  });

  it('preserves text around inline mentions and does not infer literal @ text', () => {
    const inline = { ...mention, start: 3, end: 6 };
    expect(messageMentionRuns('请找 @小满 看看', [inline])).toEqual([
      { text: '请找 ' },
      { text: '@小满', mention: inline },
      { text: ' 看看' },
    ]);
    expect(messageMentionRuns('@小满 看看')).toEqual([{ text: '@小满 看看' }]);
    expect(leadingMessageMentions('请找 @小满 看看', [inline])).toBeUndefined();
  });

  it('does not consume text for stale, overlapping, out-of-bounds or fractional ranges', () => {
    const bad = [
      { ...mention, label: '别人' },
      { ...mention, start: -1 },
      { ...mention, end: 300 },
      { ...mention, start: 0.5 },
    ];
    for (const invalid of bad) {
      expect(messageMentionRuns('@小满 hi', [invalid])).toEqual([{ text: '@小满 hi' }]);
      expect(leadingMessageMentions('@小满 hi', [invalid])).toBeUndefined();
    }
    expect(
      messageMentionRuns('@小满 hi', [mention, mention])
        .map((run) => run.text)
        .join(''),
    ).toBe('@小满 hi');
    expect(leadingMessageMentions('@小满 hi', [mention, mention])).toBeUndefined();
    expect(leadingMessageMentions('@小满', [{ ...mention, end: 300 }])).toBeUndefined();
  });
});

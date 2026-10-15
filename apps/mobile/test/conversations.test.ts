import { describe, expect, it } from 'vitest';

import type { RosterView } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';
import {
  conversations,
  searchConversations,
  shortcutCounts,
  shortTime,
} from '../src/ui/chat/conversations';

const roster: RosterView = {
  bots: [
    {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-ada',
      preview: 'Done',
      previewAt: '2026-10-14T08:00:00.000Z',
    },
    {
      slug: 'bo',
      displayName: 'Bo',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'working',
      paused: false,
      dmChannelId: 'dm-bo',
    },
    {
      slug: 'cy',
      displayName: 'Cy',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'thinking',
      paused: false,
      previewAt: '2026-10-14T10:00:00.000Z',
    },
  ],
  channels: [
    {
      id: 'team',
      name: 'team',
      memberCount: 3,
      members: ['ada', 'bo', 'cy'],
      previewAt: '2026-10-14T09:00:00.000Z',
    },
  ],
};

const item = (overrides: Partial<HumanAttentionItem>): HumanAttentionItem => ({
  id: 'i',
  category: 'action',
  kind: 'tool-approval',
  createdAt: '2026-10-14T10:00:00.000Z',
  botSlug: 'ada',
  summary: 'run',
  ...overrides,
});

describe('Home conversations', () => {
  it('mixes Bot DMs and Channels by latest activity', () => {
    expect(conversations(roster, []).map((row) => row.key)).toEqual([
      'bot:cy',
      'channel:team',
      'bot:ada',
      'bot:bo',
    ]);
  });

  it('counts what needs the Human in the DM or the Channel it belongs to', () => {
    const action = [
      item({ id: '1' }),
      item({ id: '2', channelId: 'dm-ada' }),
      item({ id: '3', channelId: 'team' }),
    ];
    const rows = conversations(roster, action);
    expect(rows.find((row) => row.key === 'bot:ada')?.needsYou).toBe(2);
    expect(rows.find((row) => row.key === 'channel:team')?.needsYou).toBe(1);
    expect(conversations(roster, action, 'needs-you').map((row) => row.key)).toEqual([
      'channel:team',
      'bot:ada',
    ]);
    expect(shortcutCounts(roster, action)).toEqual({ 'needs-you': 2, working: 2 });
  });

  it('filters to Bots that are working', () => {
    expect(conversations(roster, [], 'working').map((row) => row.key)).toEqual([
      'bot:cy',
      'bot:bo',
    ]);
  });

  it('shows a clock time today and a date otherwise', () => {
    const now = new Date('2026-10-14T12:00:00');
    expect(shortTime(new Date('2026-10-14T09:05:00').toISOString(), now, 'en-GB')).toMatch(
      /^0?9:05$/,
    );
    expect(shortTime(new Date('2026-10-12T09:05:00').toISOString(), now, 'en-GB')).toBe('12/10');
    expect(shortTime(undefined, now)).toBe('');
  });
});

describe('Search', () => {
  const people: RosterView = {
    ...roster,
    bots: [
      ...roster.bots,
      {
        ...roster.bots[0]!,
        slug: 'xiaoming',
        displayName: '小明 助手',
        dmChannelId: 'dm-xiaoming',
      },
      { ...roster.bots[1]!, slug: 'adam', displayName: 'Madam Ada' },
    ],
    channels: [
      ...roster.channels,
      { id: 'design', name: 'Design Review', memberCount: 2, members: [] },
    ],
  };
  const keys = (query: string) => searchConversations(people, [], query).map((row) => row.key);

  it('matches PersonaBot names and Channel titles, ignoring case', () => {
    expect(keys('ADA')).toEqual(['bot:ada', 'bot:adam']);
    expect(keys('review')).toEqual(['channel:design']);
    expect(keys('TEAM')).toEqual(['channel:team']);
  });

  it('matches Chinese names and full-width letters', () => {
    expect(keys('小明')).toEqual(['bot:xiaoming']);
    expect(keys('ＡＤＡ')).toEqual(['bot:ada', 'bot:adam']);
  });

  it('puts names that start with the query first', () => {
    expect(keys('ad')).toEqual(['bot:ada', 'bot:adam']);
    expect(keys('a')[0]).toBe('bot:ada');
  });

  it('finds nothing for an empty query or before the roster loads', () => {
    expect(keys('')).toEqual([]);
    expect(keys('   ')).toEqual([]);
    expect(searchConversations(undefined, [], 'ada')).toEqual([]);
    expect(keys('nobody')).toEqual([]);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconAgentPresetOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconStopFillRegular: () => null,
  Tooltip: ({ children }: { children: unknown }) => children,
}));
import type { PersonaBotFacepileItem } from '../src/client/avatar.js';
import { groupComposerActivity } from '../src/client/group-composer-activity.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  TimelineWorkingRowsView,
  timelineWorkingRows,
  timelineWorkingRowsCover,
} from '../src/client/timeline-working-rows.js';

const mira: PersonaBotFacepileItem = {
  personaBotId: 'mira',
  name: 'Mira',
  state: 'working',
  activity: {
    effect: 'searching',
    toolKind: 'search',
    toolName: 'web_search',
    startedAt: 1,
    activeToolCount: 1,
  },
};
const nova: PersonaBotFacepileItem = { personaBotId: 'nova', name: 'Nova', state: 'thinking' };
const kai: PersonaBotFacepileItem = { personaBotId: 'kai', name: 'Kai', state: 'working' };
const waiting: PersonaBotFacepileItem = {
  personaBotId: 'ada',
  name: 'Ada',
  state: 'waiting',
  attention: { approvalCount: 1 },
};
const blocked: PersonaBotFacepileItem = { personaBotId: 'bea', name: 'Bea', state: 'blocked' };
const none = new Set<string>();

describe('timelineWorkingRows', () => {
  it('shows a working DM Bot as one row', () => {
    const rows = timelineWorkingRows({ items: [mira], summary: '' }, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['mira']);
    expect(rows.more).toBe(0);
  });

  it('keeps the Group composer order and caps rows like the composer summary', () => {
    const activity = groupComposerActivity([waiting, nova, kai, mira, blocked], zhTranslate);
    const rows = timelineWorkingRows(activity, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['kai', 'mira']);
    expect(rows.more).toBe(1);
  });

  it('leaves waiting and blocked Bots to their cards', () => {
    expect(timelineWorkingRows({ items: [waiting, blocked], summary: '' }, none).items).toEqual([]);
  });

  it('leaves a working Bot that waits on an approval or question to its card', () => {
    const approval = { ...kai, attention: { approvalCount: 1 } };
    const question = { ...nova, attention: { approvalCount: 0, questionCount: 1 } };
    const informed = { ...mira, attention: { approvalCount: 0, informationalCount: 1 } };
    const rows = timelineWorkingRows({ items: [approval, question, informed], summary: '' }, none);
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['mira']);
  });

  it('keeps the row text to the action, tool and public detail', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: {
          items: [
            {
              ...mira,
              activity: {
                ...mira.activity!,
                publicDetail: 'deepseek.com',
                activeToolCount: 3,
                sources: [{ role: 'orchestrator', count: 1 }],
              },
            },
          ],
          more: 0,
        },
        t: zhTranslate,
      }),
    );
    expect(html).toContain('正在搜索 · web_search · deepseek.com<span');
  });

  it('skips a thinking row for the Bot that wrote the latest message but keeps its tool row', () => {
    expect(timelineWorkingRows({ items: [nova], summary: '' }, none, 'nova').items).toEqual([]);
    expect(
      timelineWorkingRows({ items: [mira], summary: '' }, none, 'mira').items.map(
        (item) => item.personaBotId,
      ),
    ).toEqual(['mira']);
    expect(
      timelineWorkingRows({ items: [nova], summary: '' }, none, 'mira').items.map(
        (item) => item.personaBotId,
      ),
    ).toEqual(['nova']);
  });

  it('hands a Bot over to its streaming draft', () => {
    const rows = timelineWorkingRows({ items: [mira, nova], summary: '' }, new Set(['mira']));
    expect(rows.items.map((item) => item.personaBotId)).toEqual(['nova']);
  });
});

describe('timelineWorkingRowsCover', () => {
  const cover = (items: PersonaBotFacepileItem[], streaming = none): boolean => {
    const activity = { items, summary: '' };
    return timelineWorkingRowsCover(activity, timelineWorkingRows(activity, streaming), streaming);
  };

  it('covers the composer status only when every Bot it lists has a row or a draft', () => {
    expect(timelineWorkingRowsCover(undefined, { items: [], more: 0 }, none)).toBe(false);
    expect(cover([mira, nova])).toBe(true);
    expect(cover([mira, waiting])).toBe(false);
    expect(cover([{ ...mira, attention: { approvalCount: 0, informationalCount: 1 } }])).toBe(
      false,
    );
  });

  it('keeps the composer status when Bots overflow the row cap', () => {
    expect(cover([mira, nova, kai])).toBe(false);
    expect(cover([mira, nova, kai], new Set(['kai']))).toBe(true);
  });

  it('keeps the composer status for a thinking Bot whose own reply is the latest message', () => {
    const activity = { items: [nova], summary: '' };
    const rows = timelineWorkingRows(activity, none, 'nova');
    expect(rows.items).toEqual([]);
    expect(timelineWorkingRowsCover(activity, rows, none)).toBe(false);
  });
});

describe('TimelineWorkingRowsView', () => {
  it('renders a card with the avatar, the name and the current step', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: { items: [mira], more: 0 },
        t: zhTranslate,
      }),
    );
    expect(html).toContain('<div class="bh-timeline-working">');
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-effect="searching"');
    expect(html).toContain('width:32px;height:32px');
    expect(html).toContain('<span class="bh-timeline-working-name">Mira</span>');
    expect(html).toContain('正在搜索 · web_search');
    expect(html).toContain('bh-timeline-working-ellipsis');
    expect(html).not.toContain('bh-timeline-working-stop');
    expect(html).not.toContain('aria-live');
  });

  it('adds an icon-only Stop for a Bot the Human can stop', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: { items: [mira, nova], more: 0 },
        stop: { targets: new Set(['mira']), stopping: false, onStop: () => {} },
        t: zhTranslate,
      }),
    );
    expect(html.match(/bh-timeline-working-stop/g)).toHaveLength(1);
    expect(html).toContain('aria-label="停止 Mira"');
    expect(html).not.toContain('>停止<');
  });

  it('lets a card with Sessions expand', () => {
    const html = renderToStaticMarkup(
      createElement(TimelineWorkingRowsView, {
        rows: {
          items: [
            {
              ...mira,
              sessions: [{ id: 's-1', role: 'orchestrator', state: 'working', at: 1, revision: 1 }],
            },
            nova,
          ],
          more: 0,
        },
        t: zhTranslate,
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it('renders nothing without active Bots and a more line past the cap', () => {
    expect(
      renderToStaticMarkup(
        createElement(TimelineWorkingRowsView, { rows: { items: [], more: 0 }, t: zhTranslate }),
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(TimelineWorkingRowsView, {
          rows: { items: [mira, nova], more: 2 },
          t: zhTranslate,
        }),
      ),
    ).toContain('另有 2 个');
  });
});

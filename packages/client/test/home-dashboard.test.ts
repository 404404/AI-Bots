// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props, children as ReactNode),
}));
vi.mock('../src/client/ds/select.js', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
    disabled,
  }: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    disabled: boolean;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        disabled,
        onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
import { HomeDashboard } from '../src/client/home-dashboard.js';
import { createActions } from '../src/client/actions.js';
import { createStore, store } from '../src/client/store.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { CHANNEL_BODY_PANEL } from '../src/client/channel-dock-layout.js';
import { zhTranslate } from '../src/client/locale.js';
import type { HomeDashboard as Dashboard } from '../../core/src/home/dashboard.js';
import type { BridgeCall } from '../src/client/bridge.js';

function snapshot(): Dashboard {
  return {
    readAt: '2026-10-18T12:00:00Z',
    attention: { status: 'unavailable' },
    working: { status: 'ready', value: [] },
    recent: {
      status: 'ready',
      value: [
        {
          kind: 'channel',
          channelId: 'channel',
          messageId: 'progress',
          label: 'Active Channel',
          at: '2026-10-18T11:59:00Z',
        },
      ],
    },
    usage: {
      status: 'ready',
      value: {
        range: '24h',
        from: '2026-10-17T12:00:00Z',
        to: '2026-10-18T12:00:00Z',
        totalTokens: null,
        status: 'unknown',
        freshness: 'degraded',
        records: 1,
        recordLimit: 50000,
        truncated: false,
        coverageStart: null,
        readAt: '2026-10-18T12:00:00Z',
        reconciledAt: null,
      },
    },
  };
}

it('keeps missing usage distinct from zero and opens the exact activity target without closing Home', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const call = vi.fn<BridgeCall>(async (method) => {
    if (method === 'homeDashboard') return { ok: true, value: snapshot() };
    throw new Error(method);
  });
  const actions = createActions(call, createStore());
  const openChannel = vi.spyOn(actions, 'openChannelAtMessage').mockResolvedValue();
  const registry = createDockPanelRegistry();
  const opened = vi.fn();
  const closed = vi.fn();
  registry.attach({ open: opened, close: closed });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(HomeDashboard, { actions, registry, t: zhTranslate })),
    );
    expect(call).toHaveBeenCalledWith('homeDashboard', { range: '24h' });
    expect(container.textContent).toContain('未知');
    expect(container.textContent).toContain('缺失用量不代表零');
    expect(container.textContent).toContain('部分用量来源未能完成核对');
    const recent = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Active Channel'),
    )!;
    await act(async () => recent.click());
    expect(opened).toHaveBeenCalledWith(CHANNEL_BODY_PANEL);
    expect(openChannel).toHaveBeenCalledWith('channel', 'progress');
    expect(closed).not.toHaveBeenCalled();
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = '7d';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(call).toHaveBeenLastCalledWith('homeDashboard', { range: '7d' });
    expect(call.mock.calls.every(([method]) => method === 'homeDashboard')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('projects protected Tob names in current dashboard labels without changing stored snapshot text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot();
  const data = snapshot();
  if (data.recent.status !== 'ready') throw new Error('fixture');
  data.recent.value[0]!.label = 'Tob';
  data.working = {
    status: 'ready',
    value: [
      {
        slug: 'steward',
        displayName: 'Tob',
        sessions: [{ sessionId: 'session', role: 'orchestrator' }],
      },
    ],
  };
  store.setRoster(
    [
      {
        slug: 'steward',
        displayName: 'Tob',
        tob: { defaultName: true, defaultAvatar: true },
        roles: [],
        workspaces: [],
        createdAt: '',
        aggregateState: 'idle',
      },
    ],
    [
      {
        id: 'channel',
        type: 'dm',
        botSlug: 'steward',
        members: ['steward'],
        name: 'Tob',
        createdAt: '',
        updatedAt: '',
      },
    ],
  );
  store.setDefaultTobName('托布');
  const actions = createActions(async () => ({ ok: true, value: data }), createStore());
  const registry = createDockPanelRegistry();
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(HomeDashboard, { actions, registry, t: zhTranslate })),
    );
    expect(container.textContent).toContain('频道 · 托布');
    expect(container.textContent).toContain('托布 · 主会话');
    expect(data.recent.value[0]!.label).toBe('Tob');
    act(() =>
      store.upsertBot({
        ...store.getSnapshot().bots[0]!,
        displayName: '小管家',
        tob: { defaultName: false, defaultAvatar: true },
      }),
    );
    expect(container.textContent).toContain('频道 · 小管家');
    expect(container.textContent).toContain('小管家 · 主会话');
    act(() => store.setDefaultTobName('Tob'));
    expect(container.textContent).toContain('频道 · 小管家');
  } finally {
    act(() => root.unmount());
    store.setDefaultTobName('Tob');
    store.setRoster(previous.bots, previous.channels);
  }
});

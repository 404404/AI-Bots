// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));

import type { OverviewMemory, OverviewUsage, UsagePeriod } from '../src/host/usage';
import { SettingsView, type SettingsActions } from '../src/ui/settings-view';
import { daysLabel, tokenAmount } from '../src/ui/shell/usage-card';
import { t } from '../src/ui/strings';
import { UsageView, type UsageSources } from '../src/ui/usage-view';
import usageWire from './fixtures/usage-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const active = usageWire.rpc.active;
const week = () => structuredClone(active.overviewUsage.week) as OverviewUsage;
const today = () => structuredClone(active.overviewUsage.today) as OverviewUsage;
const memory = () => structuredClone(active.overviewMemory) as OverviewMemory;

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

function actions(overrides: Partial<SettingsActions> = {}): SettingsActions {
  return {
    onClose: vi.fn(),
    onUsage: vi.fn(),
    onOpenFullClient: vi.fn(),
    onComputers: vi.fn(),
    onHostLook: vi.fn(),
    onAppIcon: vi.fn(),
    onNotifications: vi.fn(),
    onUnpair: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('Usage card in Settings', () => {
  it("shows the Host's 7-day total over a bar per day, and opens the Usage screen", async () => {
    const handlers = actions();
    const load = vi.fn(async () => week());
    const view = await render(
      <SettingsView
        hostName="studio"
        connection={{ status: 'connected', route: '' }}
        loadUsage={load}
        actions={handlers}
      />,
    );
    const amount = tokenAmount(active.overviewUsage.week.totals.totalTokens);
    const card = button(view, t.usageCard(amount));
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(amount);
    const days = active.overviewUsage.week.days.map((row) => ({
      day: row.day,
      tokens: row.totalTokens,
    }));
    expect(card!.querySelector(`[aria-label="${daysLabel(days)}"]`)).not.toBeNull();
    expect(days).toHaveLength(7);
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => card!.click());
    expect(handlers.onUsage).toHaveBeenCalledTimes(1);
  });

  it('shows an idle Host as an empty week, not an error', async () => {
    const view = await render(
      <SettingsView
        hostName="studio"
        connection={{ status: 'connected', route: '' }}
        loadUsage={async () =>
          structuredClone(usageWire.rpc.idle.overviewUsage.week) as OverviewUsage
        }
        actions={actions()}
      />,
    );
    expect(button(view, t.usageCard('0'))).not.toBeNull();
    expect(view.textContent).not.toContain(t.usageFailed);
  });

  it('offers Try again when the Host cannot answer, and reads again', async () => {
    const load = vi
      .fn<() => Promise<OverviewUsage>>()
      .mockRejectedValueOnce(new Error('Usage statistics unavailable'))
      .mockResolvedValueOnce(week());
    const view = await render(
      <SettingsView
        hostName="studio"
        connection={{ status: 'connected', route: '' }}
        loadUsage={load}
        actions={actions()}
      />,
    );
    expect(view.textContent).toContain(`${t.usageFailed} Usage statistics unavailable`);
    await act(async () => button(view, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(load).toHaveBeenCalledTimes(2);
    expect(view.textContent).not.toContain(t.usageFailed);
  });
});

describe('Usage screen', () => {
  function sources(overrides: Partial<UsageSources> = {}): UsageSources {
    return {
      loadUsage: vi.fn(async (period: UsagePeriod) => (period === 'week' ? week() : today())),
      loadMoreUsage: vi.fn(async (current: OverviewUsage) => current),
      loadMemory: vi.fn(async () => memory()),
      loadMoreMemory: vi.fn(async (current: OverviewMemory) => current),
      ...overrides,
    };
  }

  it('splits the week by kind and by Bot, and lists Memory changes', async () => {
    const onOpenBot = vi.fn();
    const view = await render(<UsageView sources={sources()} roster={[]} onOpenBot={onOpenBot} />);
    const totals = active.overviewUsage.week.totals;
    expect(view.textContent).toContain(tokenAmount(totals.totalTokens));
    for (const kind of [
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
    ] as const)
      expect(view.textContent).toContain(t.usageKind[kind]);
    const mika = active.overviewUsage.week.bots.find((bot) => bot.displayName === 'Mika')!;
    const row = [...view.querySelectorAll('button')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Mika'),
    );
    expect(row).toBeDefined();
    await act(async () => row!.click());
    expect(onOpenBot).toHaveBeenCalledWith(mika.slug);
    for (const bot of active.overviewMemory.bots)
      if (bot.state === 'ready') expect(view.textContent).toContain(t.memoryChanges(bot.total));
  });

  it('reads Today when the switch moves, and back', async () => {
    const source = sources();
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    expect(source.loadUsage).toHaveBeenCalledWith('week');
    await act(async () => button(view, t.usageToday)!.click());
    await act(async () => undefined);
    expect(source.loadUsage).toHaveBeenLastCalledWith('today');
    expect(view.textContent).toContain(tokenAmount(active.overviewUsage.today.totals.totalTokens));
    expect(button(view, t.usageToday)!.getAttribute('aria-selected')).toBe('true');
    await act(async () => button(view, t.usageWeek)!.click());
    expect(source.loadUsage).toHaveBeenLastCalledWith('week');
    expect(source.loadUsage).toHaveBeenCalledTimes(3);
    expect(source.loadMemory).toHaveBeenCalledTimes(1);
  });

  it('loads more Bots from the cursor', async () => {
    const first = week();
    first.bots = first.bots.slice(0, 1);
    first.nextCursor = first.bots[0]!.slug;
    const source = sources({
      loadUsage: vi.fn(async () => first),
      loadMoreUsage: vi.fn(async () => week()),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageMore)!.click());
    await act(async () => undefined);
    expect(source.loadMoreUsage).toHaveBeenCalledWith(first);
    expect(button(view, t.usageMore)).toBeNull();
    expect(view.textContent).toContain('Juno');
    expect(view.textContent).toContain('Mika');
  });
});

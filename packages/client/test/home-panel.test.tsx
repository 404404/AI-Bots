// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/client/home-overview.js', () => ({ HomeOverview: () => null }));
vi.mock('../src/client/avatar.js', () => ({ PersonaBotAvatar: () => null }));
vi.mock('../src/client/onboarding-view.js', () => ({
  OnboardingModelDialog: ({ onClose }: { onClose(): void }) =>
    createElement('button', { onClick: onClose }, 'Cancel setup'),
}));
vi.mock('../src/client/channel-composer.js', () => ({
  ChannelComposer: ({
    value,
    onChange,
    onSubmit,
  }: {
    value: string;
    onChange(v: string): void;
    onSubmit(): void;
  }) =>
    createElement(
      'form',
      {
        onSubmit: (e) => {
          e.preventDefault();
          onSubmit();
        },
      },
      createElement('textarea', {
        value,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
      }),
      createElement('button', { type: 'submit' }, 'Send'),
    ),
}));
import { HomePanel } from '../src/client/home-panel.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate as t } from '../src/client/locale.js';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it('migrates the old Home draft, fills starters without sending, and retains it through setup cancellation and remount', async () => {
  const actions = createActions(async () => {
    throw Error('unexpected RPC');
  }, createStore());
  vi.spyOn(actions, 'tobHome').mockResolvedValue({
    botSlug: 'tob',
    channelId: 'dm-tob',
    workspacePath: '/synthetic',
  });
  vi.spyOn(actions, 'humanIdentity').mockRejectedValue(Error('unavailable'));
  vi.spyOn(actions, 'modelPlanState').mockResolvedValue({});
  const catalog = vi.spyOn(actions, 'modelCatalog').mockResolvedValue({
    default: { provider: 'test', model: 'test' },
    models: [
      { provider: 'test', providerName: 'Test', model: 'test', modelName: 'Test', efforts: [] },
    ],
  });
  const send = vi.spyOn(actions, 'sendHome').mockRejectedValue(Error('try again'));
  const registry = createDockPanelRegistry();
  const editName = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const view = () =>
    createElement(HomePanel, { actions, registry, t, sendKey: 'enter', onEditHumanName: editName });
  sessionStorage.setItem('botharness/home-draft/tob', JSON.stringify({ body: 'old unsent draft' }));
  try {
    await act(async () => root.render(view()));
    expect(host.querySelector('textarea')?.value).toBe('old unsent draft');
    expect(sessionStorage.getItem('botharness/home-draft/tob')).toBeNull();
    expect(host.textContent).not.toContain(t('home.configure'));
    const button = (label: string) =>
      [...host.querySelectorAll('button')].find((x) => x.textContent === label)!;
    await act(async () => button(t('home.starter.status')).click());
    expect(host.querySelector('textarea')?.value).toBe(t('home.starter.status'));
    expect(send).not.toHaveBeenCalled();
    await act(async () => button('Send').click());
    expect(send).toHaveBeenCalledWith('dm-tob', t('home.starter.status'), expect.any(String), []);
    expect(host.querySelector('textarea')?.value).toBe(t('home.starter.status'));
    await act(async () => root.unmount());
    catalog.mockResolvedValue({ models: [] });
    root = createRoot(host);
    await act(async () => root.render(view()));
    expect(host.querySelector('textarea')).toBeNull();
    await act(async () => button(t('home.configure')).click());
    await act(async () => button('Cancel setup').click());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    catalog.mockResolvedValue({
      default: { provider: 'test', model: 'test' },
      models: [
        { provider: 'test', providerName: 'Test', model: 'test', modelName: 'Test', efforts: [] },
      ],
    });
    root = createRoot(host);
    await act(async () => root.render(view()));
    expect(host.querySelector('textarea')?.value).toBe(t('home.starter.status'));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="' + t('home.editHumanName') + '"]')!
        .click(),
    );
    expect(editName).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

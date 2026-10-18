// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { DockPanelRegistry } from '../src/client/dock-panels.js';
import { HomeCreation } from '../src/client/home-creation.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props, children as ReactNode),
  Menu: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/client/home-dashboard.js', () => ({ HomeDashboard: () => null }));
vi.mock('../src/client/home-creation-panel.js', () => ({
  HomeCreationPanel: ({ request }: { request: { source: string; sectionId?: string } }) =>
    createElement('output', null, request.source + ':' + request.sectionId),
}));
vi.mock('../src/client/channel-composer.js', () => ({
  ChannelComposer: ({ value, onChange }: { value: string; onChange(value: string): void }) =>
    createElement('textarea', {
      'aria-label': 'Tob composer',
      value,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    }),
}));
vi.mock('../src/client/onboarding-view.js', () => ({ OnboardingModelDialog: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettingsAndReturn: vi.fn() }));
import { HomePanel } from '../src/client/home-panel.js';
import { store } from '../src/client/store.js';

const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
  sessionStorage.clear();
});

async function mount(ownPlan: boolean) {
  const route = { provider: 'official', model: 'flash' };
  const onEditHumanName = vi.fn();
  const actions = {
    humanIdentity: vi.fn(async () => ({
      humanId: 'local-human',
      defaultDisplayName: '小明',
      displayName: '小明',
    })),
    sendHome: vi.fn(),
    tobHome: vi.fn(async () => ({ botSlug: 'tob', channelId: 'tob-dm' })),
    modelCatalog: vi.fn(async () => ({
      default: { provider: 'missing', model: 'unset' },
      models: [{ ...route }],
    })),
    modelPlanState: vi.fn(async () => (ownPlan ? { plan: { orchestrator: route } } : {})),
  } as unknown as BridgeActions;
  const creation = new HomeCreation();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(
      createElement(HomePanel, {
        actions,
        creation,
        registry: {} as DockPanelRegistry,
        t: zhTranslate,
        sendKey: 'enter',
        onEditHumanName,
      }),
    ),
  );
  return { host, creation, actions, onEditHumanName };
}

it('uses the effective Tob plan despite an unavailable Host default, with a neutral settings label', async () => {
  const { host } = await mount(true);
  expect(host.querySelector('[aria-label="Tob composer"]')).not.toBeNull();
  expect(host.textContent).toContain('模型设置');
  expect(host.textContent).not.toContain('配置模型，开始与总管对话');
});

it('keeps the setup CTA when neither Tob nor the Host has a usable route', async () => {
  const { host } = await mount(false);
  expect(host.querySelector('[aria-label="Tob composer"]')).toBeNull();
  expect(host.textContent).toContain('配置模型，开始与总管对话');
});

it('wires the source buttons to the active section destination', async () => {
  const { host, creation } = await mount(true);
  await act(async () => {
    creation.open({ source: 'empty', sectionId: 'research', sectionName: 'Research' });
  });
  for (const [label, source] of [
    ['从 GitHub 导入 Bot', 'git'],
    ['从 zip 导入 Bot', 'zip'],
    ['创建 Bot', 'empty'],
  ]) {
    const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(creation.getSnapshot()).toEqual({
      source,
      sectionId: 'research',
      sectionName: 'Research',
    });
  }
});

it('shows the global name and routes its click to the existing global name settings', async () => {
  const { host, onEditHumanName, actions } = await mount(true);
  expect(host.querySelector('[data-home-welcome]')?.textContent).toContain('你好小明');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="修改全局用户名"]')?.click(),
  );
  expect(onEditHumanName).toHaveBeenCalledOnce();
  vi.mocked(actions.humanIdentity).mockResolvedValue({
    humanId: 'local-human',
    defaultDisplayName: '新名字',
    displayName: '新名字',
  });
  await act(async () =>
    store.setRoster(store.getSnapshot().bots, [...store.getSnapshot().channels]),
  );
  expect(host.querySelector('[data-home-welcome]')?.textContent).toContain('新名字');
});

it('applies four starter prompts to the shared composer without sending', async () => {
  const { host, actions } = await mount(true);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="试着问总管"] button')];
  expect(buttons).toHaveLength(4);
  for (const button of buttons) {
    await act(async () => button.click());
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Tob composer"]')?.value).toBe(
      button.textContent,
    );
    expect(JSON.parse(sessionStorage.getItem('botharness/home-draft/tob')!).body).toBe(
      button.textContent,
    );
  }
  expect(actions.sendHome).not.toHaveBeenCalled();
});

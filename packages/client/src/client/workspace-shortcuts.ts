import type { Shortcuts, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { WORKSPACE_CHANNELS } from './workspace-context.js';

const DEFAULT_KEYS: Readonly<Record<string, string>> = {
  [WORKSPACE_CHANNELS]: 'Digit1',
  [CHANNEL_BODY_PANEL]: 'Digit2',
  'activity-center': 'Digit3',
  'generated-files': 'Digit4',
  'group-work': 'Digit5',
  'memory-files': 'Digit6',
  sessions: 'Digit7',
  'bot-inbox': 'Digit8',
  schedules: 'Digit9',
  'botharness-computer': 'Digit0',
  'botharness-browser': 'KeyB',
  'memory-evolution': 'KeyE',
};

export const workspaceShortcutId = (id: string): ShortcutCommandId =>
  `botharness.panel.p${Array.from(id, (char) => char.codePointAt(0)!.toString(16)).join('-')}` as ShortcutCommandId;

export function registerWorkspaceShortcuts(
  shortcuts: Pick<Shortcuts, 'register'>,
  registry: DockPanelRegistry,
  active: () => boolean,
  t: BotHarnessTranslate,
): () => void {
  const registered = new Map<string, () => void>();
  const sync = () => {
    const labels = new Map(
      registry
        .panels()
        .filter((panel) => panel.id !== 'members')
        .map((panel) => [panel.id, panel.title]),
    );
    labels.set(WORKSPACE_CHANNELS, t('workspace.channels'));
    labels.set(CHANNEL_BODY_PANEL, t('workspace.messages'));
    for (const [id, dispose] of registered)
      if (!labels.has(id)) {
        dispose();
        registered.delete(id);
      }
    for (const [id, title] of labels) {
      if (registered.has(id)) continue;
      const code = DEFAULT_KEYS[id];
      const binding = code ? { code, modifiers: ['primary', 'alt', 'shift'] as const } : undefined;
      registered.set(
        id,
        shortcuts.register({
          id: workspaceShortcutId(id),
          label: () =>
            t('workspace.shortcut', {
              panel: registry.panels().find((panel) => panel.id === id)?.title ?? title,
            }),
          aliases: ['Bot mode', 'panel', id],
          defaults: binding
            ? {
                'desktop:macos': binding,
                'desktop:windows': binding,
                'desktop:linux': binding,
                'web:macos': binding,
                'web:windows': binding,
              }
            : {},
          regions: ['page', 'editable'],
          modals: [],
          resolve: (context) =>
            active() && registry.available() && !context.modal
              ? { status: 'handled', run: () => registry.toggle(id) }
              : { status: 'pass' },
        }),
      );
    }
  };
  sync();
  const unsubscribe = registry.subscribe(sync);
  return () => {
    unsubscribe();
    for (const dispose of registered.values()) dispose();
  };
}

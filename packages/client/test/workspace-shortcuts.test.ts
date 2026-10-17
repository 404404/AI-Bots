import { describe, expect, it, vi } from 'vitest';
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import {
  normalizeBinding,
  isWebBindingAllowed,
  bindingIssue,
  parseShortcutDefinitions,
} from '@deepseek-ai/dsh-client-shortcuts/protocol';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import {
  registerWorkspaceShortcuts,
  workspaceShortcutId,
} from '../src/client/workspace-shortcuts.js';
import { zhTranslate } from '../src/client/locale.js';

describe('workspace shortcut ownership', () => {
  it('uses valid native command identities/defaults and routes only while its workspace owns the layout', () => {
    const commands = new Map<string, ShortcutCommand>();
    const register = (command: ShortcutCommand) => {
      parseShortcutDefinitions([{ id: command.id, defaults: command.defaults }]);
      for (const [profile, binding] of Object.entries(command.defaults)) {
        const [runtime, platform] = profile.split(':') as [
          'desktop' | 'web',
          'macos' | 'windows' | 'linux',
        ];
        const normalized = normalizeBinding(binding!, platform);
        expect(bindingIssue(normalized, runtime, platform)).toBeNull();
        if (runtime === 'web') expect(isWebBindingAllowed(normalized, platform)).toBe(true);
      }
      commands.set(command.id, command);
      return () => {
        commands.delete(command.id);
      };
    };
    const registry = createDockPanelRegistry();
    for (const id of ['botharness-browser', 'botharness-computer'])
      registry.register({ id, title: id, scope: 'global', component: () => null });
    let active = false;
    const dispose = registerWorkspaceShortcuts({ register }, registry, () => active, zhTranslate);
    expect(
      commands.get(workspaceShortcutId('botharness-browser'))?.defaults['desktop:macos']?.code,
    ).toBe('KeyB');
    expect(
      commands.get(workspaceShortcutId('botharness-computer'))?.defaults['desktop:macos']?.code,
    ).toBe('Digit0');
    const open = vi.fn();
    registry.attach({ open, close: vi.fn() });
    const command = commands.get(workspaceShortcutId('bh:channel-body'))!;
    expect(command.label()).toContain('消息');
    expect(command.label()).not.toContain('workspace.messages');
    const context = { region: 'editable' as const, modal: null, target: null };
    expect(command.resolve(context)).toEqual({ status: 'pass' });
    active = true;
    const result = command.resolve(context);
    expect(result.status).toBe('handled');
    if (result.status === 'handled') result.run();
    expect(open).toHaveBeenCalledWith('bh:channel-body');
    expect(command.resolve({ ...context, modal: 'settings' })).toEqual({ status: 'pass' });
    const remove = registry.register({
      id: 'custom:inbox',
      title: 'Custom',
      scope: 'global',
      component: () => null,
    });
    expect(commands.has(workspaceShortcutId('custom:inbox'))).toBe(true);
    remove();
    expect(commands.has(workspaceShortcutId('custom:inbox'))).toBe(false);
    expect(commands.has(workspaceShortcutId('bh:channels'))).toBe(true);
    dispose();
    expect(commands.size).toBe(0);
  });
});

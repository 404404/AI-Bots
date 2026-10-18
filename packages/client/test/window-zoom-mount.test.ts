// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBinding,
  parseShortcutDefinitions,
} from '@deepseek-ai/dsh-client-shortcuts/protocol';
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import { mountWindowZoom } from '../src/client/window-zoom-mount.js';
import { zhTranslate } from '../src/client/locale.js';

describe('desktop zoom shortcut ownership', () => {
  function fixture(fail = false) {
    const order: string[] = [];
    const commands = new Map<string, ShortcutCommand>();
    const storage = new Map<string, string>();
    const release = vi.fn(() => {
      order.push('font-restored');
    });
    const mounted = mountWindowZoom({
      document,
      window: {
        location: new URL('dsh-app://app/'),
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
      },
      shortcuts: {
        runtime: 'desktop',
        platform: 'macos',
        register(command) {
          parseShortcutDefinitions([{ id: command.id, defaults: command.defaults }]);
          for (const binding of Object.values(command.defaults))
            if (binding) normalizeBinding(binding, 'macos');
          if (fail && commands.size === 1) throw Error('registry unavailable');
          commands.set(command.id, command);
          return () => {
            order.push('zoom-removed');
            commands.delete(command.id);
          };
        },
      },
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      compatibility: { version: 1, desktopVersion: '0.2.1-rc.2', acquire: async () => release },
      t: zhTranslate,
    });
    return { mounted, commands, order, release };
  }
  it('validates every default through the actual DSH protocol and restores font scope after revoking commands', async () => {
    document.documentElement.style.zoom = '';
    const f = fixture();
    await vi.waitFor(() => expect(f.mounted.surface.getSnapshot()).not.toBeNull());
    expect(f.commands.size).toBe(4);
    expect(f.commands.get('botharness.zoom.reset')?.defaults).toEqual({});
    const action = f.commands
      .get('botharness.zoom.increase')!
      .resolve({ region: 'editable', modal: null, target: null });
    expect(action.status).toBe('handled');
    if (action.status === 'handled') action.run();
    expect(document.documentElement.style.zoom).toBe('1.2');
    await f.mounted.dispose();
    expect(document.documentElement.style.zoom).toBe('');
    expect(f.commands.size).toBe(0);
    expect(f.order.at(-1)).toBe('font-restored');
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it('makes partial registration failure visible and returns the original font bindings exactly once', async () => {
    const f = fixture(true);
    await vi.waitFor(() =>
      expect(f.mounted.surface.getErrorSnapshot()).toBe('zoom-initialization-failed'),
    );
    expect(f.mounted.surface.getSnapshot()).toBeNull();
    expect(f.commands.size).toBe(0);
    await f.mounted.dispose();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
});

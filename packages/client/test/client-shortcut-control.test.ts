import { expect, it, vi } from 'vitest';
import {
  ShortcutPersistence,
  initialShortcutConfig,
  effectiveShortcuts,
  normalizeBinding,
  bindingIssue,
  overlappingBindings,
  presentBinding,
} from '@deepseek-ai/dsh-client-shortcuts/protocol';
import {
  createClientShortcutHandlers,
  navigationShortcutId,
} from '../src/client/client-shortcut-control.js';
import { ShortcutBindings } from '../src/client/shortcut-bindings.js';
import {
  workspaceShortcutId,
  workspaceShortcutDefaultForCommand,
} from '../src/client/workspace-shortcuts.js';

async function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let raw: string | null = null;
  let state = initialShortcutConfig();
  const owner = new ShortcutPersistence(
    {
      read: () => raw,
      write: (value) => {
        raw = value;
      },
    },
    'web',
    'macos',
    true,
    (value) => {
      state = value;
    },
  );
  const ids = ['memory-files', 'sessions'].map(workspaceShortcutId);
  const definitions = ids.map((id) => ({
    id,
    defaults: { 'web:macos': workspaceShortcutDefaultForCommand(id, 'web:macos')! },
  }));
  owner.setDefinitions(definitions);
  state = await owner.readCurrent();
  const catalog = () =>
    effectiveShortcuts(definitions, state.document, 'web', 'macos').map((row) => ({
      ...row,
      ...presentBinding(row.binding, 'macos'),
      label: row.id,
      aliases: [],
    }));
  const edit = vi.fn((...args: Parameters<typeof owner.edit>) => owner.edit(...args));
  const subscribe = () => () => {};
  const native = {
    runtime: 'web' as const,
    platform: 'macos' as const,
    config: { getSnapshot: () => state, subscribe },
    catalog: { getSnapshot: catalog, subscribe },
    fixedCatalog: { getSnapshot: () => [], subscribe },
    describeBinding(binding: Parameters<typeof normalizeBinding>[0] | null) {
      const normalized = binding ? normalizeBinding(binding, 'macos') : null;
      return {
        binding: normalized,
        keys: presentBinding(normalized, 'macos').keys,
        issue: normalized ? bindingIssue(normalized, 'web', 'macos') : null,
        conflicts: normalized
          ? catalog()
              .filter((row) => row.binding && overlappingBindings(normalized, row.binding))
              .map((row) => row.id)
          : [],
      };
    },
    edit,
  };
  const navigation = new ShortcutBindings(storage, () => true, 'web:macos');
  return {
    owner,
    ids,
    edit,
    navigation,
    handlers: createClientShortcutHandlers(native, navigation),
  };
}
it('refuses native conflicts and wrong profiles without invoking the native writer', async () => {
  const f = await fixture();
  try {
    const before = (await f.handlers.get('shortcuts')!({})) as { stateFingerprint: string };
    const result = await f.handlers.get('shortcuts-set')!({
      scope: 'client-profile',
      expectedState: before.stateFingerprint,
      patch: {
        profile: 'web:macos',
        id: f.ids[0],
        type: 'set',
        binding: { code: 'Digit7', modifiers: ['primary', 'alt', 'shift'] },
      },
    });
    expect(result).toMatchObject({
      outcome: 'refused',
      reason: 'conflict',
      conflicts: [f.ids[1]],
      changed: false,
    });
    expect(f.edit).not.toHaveBeenCalled();
    await expect(
      f.handlers.get('shortcuts-set')!({
        scope: 'client-profile',
        expectedState: before.stateFingerprint,
        patch: { profile: 'desktop:macos', id: f.ids[0], type: 'disable' },
      }),
    ).rejects.toThrow('shortcut-profile-mismatch');
  } finally {
    f.owner.dispose();
  }
});
it('persists explicit native and navigation disable then resets only the requested action', async () => {
  const f = await fixture();
  try {
    const change = async (id: string, type: 'disable' | 'reset') => {
      const before = (await f.handlers.get('shortcuts')!({})) as { stateFingerprint: string };
      return f.handlers.get('shortcuts-set')!({
        scope: 'client-profile',
        expectedState: before.stateFingerprint,
        patch: { profile: 'web:macos', id, type },
      });
    };
    expect(await change(f.ids[0]!, 'disable')).toMatchObject({ outcome: 'applied' });
    expect(await change(navigationShortcutId('help'), 'disable')).toMatchObject({
      outcome: 'applied',
    });
    expect(f.navigation.isDisabled('help')).toBe(true);
    expect(await change(f.ids[0]!, 'reset')).toMatchObject({ outcome: 'applied' });
    expect(f.navigation.isDisabled('help')).toBe(true);
    expect(f.edit.mock.calls.map((call) => call[0].type)).toEqual(['set', 'reset']);
  } finally {
    f.owner.dispose();
  }
});

it('does not dispatch after authorization loses the Client lifetime', async () => {
  const f = await fixture();
  const lifetime = new AbortController();
  try {
    const before = (await f.handlers.get('shortcuts')!({})) as { stateFingerprint: string };
    await expect(
      f.handlers.get('shortcuts-set')!(
        {
          scope: 'client-profile',
          expectedState: before.stateFingerprint,
          patch: { profile: 'web:macos', id: f.ids[0], type: 'disable' },
        },
        {
          signal: lifetime.signal,
          authorize: async () => {
            lifetime.abort();
          },
        },
      ),
    ).rejects.toThrow('client-command-expired');
    expect(f.edit).not.toHaveBeenCalled();
  } finally {
    f.owner.dispose();
  }
});
it('reports uncertain after native dispatch loses lifetime and reconciles the saved result without replay', async () => {
  const f = await fixture();
  const lifetime = new AbortController();
  let accept!: () => void;
  let release!: () => void;
  const accepted = new Promise<void>((resolve) => {
    accept = resolve;
  });
  const saving = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.edit.mockImplementationOnce(async (...args) => {
    accept();
    await saving;
    return f.owner.edit(...args);
  });
  try {
    const before = (await f.handlers.get('shortcuts')!({})) as { stateFingerprint: string };
    const operation = f.handlers.get('shortcuts-set')!(
      {
        scope: 'client-profile',
        expectedState: before.stateFingerprint,
        patch: { profile: 'web:macos', id: f.ids[0], type: 'disable' },
      },
      {
        signal: lifetime.signal,
        authorize: async () => {},
      },
    );
    const result = expect(operation).rejects.toThrow('client-outcome-uncertain');
    await accepted;
    lifetime.abort();
    release();
    await result;
    const readback = (await f.handlers.get('shortcuts')!({})) as {
      value: { commands: { id: string; binding: unknown }[] };
    };
    expect(readback.value.commands.find((row) => row.id === f.ids[0])?.binding).toBeNull();
    expect(f.edit).toHaveBeenCalledTimes(1);
  } finally {
    release();
    f.owner.dispose();
  }
});
it('reports a lost native reply as uncertain instead of claiming unchanged bindings', async () => {
  const f = await fixture();
  f.edit.mockImplementationOnce(async (...args) => {
    await f.owner.edit(...args);
    throw new Error('reply-lost');
  });
  try {
    const before = (await f.handlers.get('shortcuts')!({})) as { stateFingerprint: string };
    await expect(
      f.handlers.get('shortcuts-set')!({
        scope: 'client-profile',
        expectedState: before.stateFingerprint,
        patch: { profile: 'web:macos', id: f.ids[0], type: 'disable' },
      }),
    ).rejects.toThrow('client-outcome-uncertain');
    expect(f.edit).toHaveBeenCalledTimes(1);
  } finally {
    f.owner.dispose();
  }
});
it('the shared persistence owner compares queued revisions before the second write', async () => {
  const f = await fixture();
  try {
    const before = await f.owner.readCurrent();
    const first = f.owner.edit({ type: 'set', id: f.ids[0]!, binding: null }, before.revision);
    const second = f.owner.edit({ type: 'set', id: f.ids[1]!, binding: null }, before.revision);
    expect((await first).status).toBe('saved');
    expect((await second).status).toBe('stale');
    const readback = (await f.handlers.get('shortcuts')!({})) as {
      value: { commands: { id: string; binding: unknown }[] };
    };
    expect(readback.value.commands.find((row) => row.id === f.ids[0])?.binding).toBeNull();
    expect(readback.value.commands.find((row) => row.id === f.ids[1])?.binding).not.toBeNull();
  } finally {
    f.owner.dispose();
  }
});

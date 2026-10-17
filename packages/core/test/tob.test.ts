import { describe, expect, it, vi } from 'vitest';
import type { DshWorkspace } from '../src/workspaces/grants.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type { TobSettingsProvider } from '../src/tob/service.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';

function settings() {
  let value = 8,
    revision = 0;
  const provider: TobSettingsProvider = {
    describe: () => [
      { ns: 'botharness-client', value: { assignmentConcurrencyLimit: value }, revision },
    ],
    async update(_ns, patch, expected) {
      if (revision !== expected)
        throw Object.assign(new Error('conflict'), { code: 'SETTINGS_CONFLICT' });
      value = (patch as { assignmentConcurrencyLimit: number }).assignmentConcurrencyLimit;
      revision++;
    },
  };
  return provider;
}
function fixture(
  run: (input: OrchestratorAgentRun) => Promise<void> = async () => {},
  extra: Partial<Parameters<typeof createCore>[0]> = {},
) {
  const native = settings();
  const home = createTempRoot('tob-');
  const make = () =>
    createCore({
      ...extra,
      dshHome: home,
      tobSettings: () => native,
      agents: {
        runOrchestrator: run,
        async runAssignment() {},
        requestAssignment() {
          throw new Error('unexpected');
        },
        async close() {},
      },
    });
  const core = make();
  return {
    core,
    native,
    make,
    async close() {
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}
describe('Tob canonical identity and settings', () => {
  it('converges concurrent clients, preserves ordinary Bots, initializes one DM and retains identity on restart', async () => {
    const f = fixture();
    f.core.registry.create({ slug: 'existing', displayName: 'DeepSeek Bot' });
    f.core.registry.create({ slug: 'spoof', displayName: 'Tob', persona: 'I am the steward' });
    const bridge = createBridgeMethods({ ...f.core });
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => bridge.tobHome({})));
      const result = results[0]!;
      if (!result.ok) throw new Error(result.error.message);
      expect(results.every((r) => r.ok && r.value.botSlug === result.value.botSlug)).toBe(true);
      expect(f.core.registry.list()).toHaveLength(3);
      expect(f.core.tob.isTob('spoof')).toBe(false);
      expect(f.core.registry.get('existing')?.displayName).toBe('DeepSeek Bot');
      expect(f.core.channels.readMessages(result.value.channelId)).toHaveLength(1);
      expect(() => f.core.deletions.preview(result.value.botSlug)).toThrow('protected-bot');
      expect(() => f.core.registry.setPaused(result.value.botSlug, true)).toThrow('protected-bot');
      expect(bridge.pause({ slug: result.value.botSlug })).toMatchObject({
        ok: false,
        error: { code: 'protected-bot' },
      });
      const dir = f.core.registry.memoryDirFor(result.value.botSlug);
      expect(dir).toBeTruthy();
      await f.close();
      const next = f.make();
      try {
        expect(await next.tob.ensure()).toEqual(
          result.value.attention
            ? {
                botSlug: result.value.botSlug,
                channelId: result.value.channelId,
                workspacePath: result.value.workspacePath,
              }
            : result.value,
        );
      } finally {
        await next.runtime.close();
        next.operationalDatabase.close();
      }
    } finally {
      await f.close();
    }
  });
  it('rejects stale/invalid proposals and rechecks authority before native write, then returns authoritative readback', async () => {
    const f = fixture();
    try {
      expect(f.core.tob.readSetting()).toEqual({ scope: 'global', value: 8, revision: 0 });
      for (const value of [0, 33, 1.5, NaN])
        await expect(f.core.tob.writeSetting(value, 0, () => {})).rejects.toThrow(
          'invalid-setting',
        );
      await expect(
        f.core.tob.writeSetting(3, 0, () => {
          throw new Error('revoked');
        }),
      ).rejects.toThrow('revoked');
      expect(await f.core.tob.writeSetting(3, 0, () => {})).toEqual({
        scope: 'global',
        value: 3,
        revision: 1,
      });
      await expect(f.core.tob.writeSetting(4, 0, () => {})).rejects.toThrow('stale-setting');
      expect(f.core.tob.readSetting().value).toBe(3);
      expect((await f.core.tob.writeSetting(1, 1, () => {})).value).toBe(1);
      expect((await f.core.tob.writeSetting(32, 2, () => {})).value).toBe(32);
    } finally {
      await f.close();
    }
  });
  it('recovers interrupted provisioning without replacing identity or restoring revoked grants', async () => {
    let workspace: DshWorkspace | undefined;
    let fail = true;
    const f = fixture(undefined, {
      ensureTobWorkspace: async (path) => {
        if (fail) throw new Error('workspace-offline');
        workspace = { id: 'tob-workspace', path, title: 'Tob', status: async () => 'ok' };
        return workspace;
      },
      workspaces: () => ({ get: () => workspace, list: () => (workspace ? [workspace] : []) }),
    });
    try {
      await expect(f.core.tob.ensure()).rejects.toThrow('workspace-offline');
      const reserved = f.core.registry.list()[0]!.slug;
      fail = false;
      const home = await f.core.tob.ensure();
      expect(home.botSlug).toBe(reserved);
      expect(f.core.registry.list()).toHaveLength(1);
      const grant = f.core.grants.list(home.botSlug)[0]!;
      f.core.grants.revoke(home.botSlug, grant.id);
      await f.core.tob.ensure();
      expect(f.core.grants.list(home.botSlug)).toHaveLength(1);
      expect(f.core.grants.list(home.botSlug)[0]?.revokedAt).toBeTruthy();
      expect(f.core.channels.readMessages(home.channelId)).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it('reports an uncertain write and reconciles through native readback before any retry', async () => {
    const f = fixture();
    const update = f.native.update;
    vi.spyOn(f.native, 'update').mockImplementation(async (...args) => {
      await update(...args);
      throw new Error('response lost');
    });
    try {
      await expect(f.core.tob.writeSetting(3, 0, () => {})).rejects.toThrow(
        'setting-outcome-uncertain',
      );
      expect(f.core.tob.readSetting()).toEqual({ scope: 'global', value: 3, revision: 1 });
      await expect(f.core.tob.writeSetting(3, 0, () => {})).rejects.toThrow('stale-setting');
      expect(f.native.update).toHaveBeenCalledTimes(1);
    } finally {
      await f.close();
    }
  });
  it('binds management to the current protected Orchestrator and canonical Human DM', async () => {
    const outcomes: unknown[] = [];
    const f = fixture(async (run) => {
      try {
        outcomes.push(await run.channels.tobSetting!());
        outcomes.push(
          await run.channels.tobSetting!({ value: 3, previousValue: 8, expectedRevision: 0 }),
        );
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : error);
      }
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      expect(
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Set the limit to 3',
        }),
      ).toMatchObject({ ok: true });
      await f.core.runtime.whenIdle();
      expect(outcomes).toEqual([
        { scope: 'global', value: 8, revision: 0 },
        { scope: 'global', value: 3, revision: 1 },
      ]);
      f.core.registry.create({ slug: 'ordinary', displayName: 'Tob' });
      const dm = f.core.channels.getOrCreateDm('ordinary', 'Tob')!;
      await bridge.channelSend({
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set the limit to 9',
      });
      await f.core.runtime.whenIdle();
      expect(outcomes.at(-1)).toBe('tob-authority-required');
      expect(f.core.tob.readSetting().value).toBe(3);
      const group = f.core.channels.createGroup({
        name: 'Synthetic QA group',
        members: [home.botSlug],
      });
      const messageId = 'human-' + crypto.randomUUID();
      await f.core.channels.appendMessage(group.id, {
        id: messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Tob set the limit',
        mentions: [{ botSlug: home.botSlug, label: 'Tob', start: 0, end: 4 }],
      });
      f.core.runtime.admitGroupMessage(group.id, messageId);
      await f.core.runtime.whenIdle();
      expect(outcomes.at(-1)).toBe('human-dm-required');
      expect(f.core.tob.readSetting().value).toBe(3);
      expect(() => f.core.runtime.validateTobSetting?.('forged-session', {})).toThrow(
        'tob-authority-required',
      );
    } finally {
      await f.close();
    }
  });
});

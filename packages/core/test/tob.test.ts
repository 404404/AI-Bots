import { ClientControlService } from '../src/client-control/service.js';
import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
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
  steerOrchestrator?: () => boolean,
  runAssignment: NonNullable<
    Parameters<typeof createCore>[0]['agents']
  >['runAssignment'] = async () => {},
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
        ...(steerOrchestrator ? { steerOrchestrator } : {}),
        runAssignment,
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
  it('derives current Client only from canonical admitted Human source metadata', async () => {
    const target = { clientId: 'client-source', generation: 'generation-source' };
    const clients = new ClientControlService();
    const proof = 'private-client-proof';
    clients.register(target, 'web', proof);
    const results: unknown[] = [];
    const f = fixture(async (run) => {
      const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      try {
        results.push(authority.currentClientTarget!());
      } catch (error) {
        results.push((error as Error).message);
      }
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core, clientControl: clients });
      await bridge.channelSend({
        channelId: home.channelId,
        body: 'Use this Client',
        clientTarget: target,
        clientProof: proof,
      });
      await f.core.runtime.whenIdle();
      expect(results).toEqual([target]);
      const message = f.core.channels
        .readMessages(home.channelId)
        .find((item) => item.body === 'Use this Client');
      expect(message?.clientTarget).toEqual(target);
      const refused = await bridge.channelSend({
        channelId: home.channelId,
        body: 'Forged generation',
        clientTarget: { ...target, generation: 'generation-foreign' },
      });
      expect(refused).toMatchObject({ ok: false, error: { code: 'client-target-replaced' } });
      await bridge.channelSend({ channelId: home.channelId, body: 'No originating Client' });
      await f.core.runtime.whenIdle();
      expect(results.at(-1)).toBe('current-client-unavailable');
    } finally {
      clients.dispose();
      await f.close();
    }
  });
  it('binds management to the current protected Orchestrator and canonical Human DM', async () => {
    const outcomes: unknown[] = [];
    const f = fixture(async (run) => {
      try {
        const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
        expect(run.tobCli).toBe(true);
        authorize();
        outcomes.push(f.core.tob.readSetting());
        outcomes.push(await f.core.tob.writeSetting(3, 0, authorize));
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
      expect(() => f.core.runtime.captureTobCliAuthority?.('forged-session')).toThrow(
        'tob-authority-required',
      );
    } finally {
      await f.close();
    }
  });
  it('revokes a captured CLI authority after its turn ends, including another turn in the same Session', async () => {
    const captured: Array<{ sessionId: string; authorize: () => void }> = [];
    const f = fixture(async (run) => {
      if (captured[0]) expect(captured[0].authorize).toThrow('human-dm-required');
      const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      expect(authorize).not.toThrow();
      captured.push({ sessionId: run.sessionId, authorize });
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      for (const body of ['Read the limit', 'Read again']) {
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body,
        });
        await f.core.runtime.whenIdle();
        expect(captured.at(-1)!.authorize).toThrow('human-dm-required');
      }
      expect(captured).toHaveLength(2);
      expect(captured[0]!.sessionId).toBe(captured[1]!.sessionId);
      expect(f.core.tob.readSetting().value).toBe(8);
    } finally {
      await f.close();
    }
  });
  it('rechecks the canonical source after capture instead of trusting a once-valid CLI call', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const authorize = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      expect(authorize).not.toThrow();
      attachOperationalModule(f.core.operationalDatabase, 'tob-test').transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET last_error = 'channel-ended' WHERE bot_slug = ?",
        ).run(run.bot.slug);
      });
      expect(authorize).toThrow('Source Channel has ended');
      await expect(f.core.tob.writeSetting(3, 0, authorize)).rejects.toThrow(
        'Source Channel has ended',
      );
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set limit to 3',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
      expect(f.core.tob.readSetting().value).toBe(8);
    } finally {
      await f.close();
    }
  });
  it('revokes a Shell snapshot when a new Human message is accepted by steering', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let authorize!: () => void;
    let sessionId!: string;
    const steer = vi.fn(() => true);
    const f = fixture(
      async (run) => {
        sessionId = run.sessionId;
        authorize = f.core.runtime.captureTobCliAuthority!(sessionId);
        started();
        await released;
      },
      {},
      steer,
    );
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit',
      });
      await start;
      expect(authorize).not.toThrow();
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Wait, do not change it',
      });
      expect(steer).toHaveBeenCalled();
      expect(authorize).toThrow('human-dm-required');
      expect(f.core.runtime.captureTobCliAuthority!(sessionId)).not.toThrow();
    } finally {
      release();
      await f.core.runtime.whenIdle();
      await f.close();
    }
  });
  it('authorizes a fresh Human DM steered into a Memory triage turn without authorizing its anchor', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let releaseAssignment!: () => void;
    const assignmentDone = new Promise<void>((resolve) => {
      releaseAssignment = resolve;
    });
    let triage!: OrchestratorAgentRun;
    let automationQuestion: ReturnType<
      NonNullable<ReturnType<typeof fixture>['core']['runtime']['bindNativeQuestionInput']>
    >;
    let automationAnswerChecked = false;
    const steer = vi.fn(() => true);
    let workspace: DshWorkspace | undefined;
    const clients = new ClientControlService();
    const target = { clientId: 'triage-client', generation: 'triage-generation' };
    const proof = 'triage-client-proof';
    clients.register(target, 'web', proof);
    const f = fixture(
      async (run) => {
        if (run.acceptNativeInput) {
          expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
            'human-dm-required',
          );
          expect(run.acceptNativeInput()).toBe(true);
          expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
            'human-dm-required',
          );
          automationAnswerChecked = true;
          return;
        }
        if (!run.message.startsWith('[Triage]')) {
          run.triage!.resolve({
            ids: run
              .triage!.list()
              .groups.filter((g) => g.sourceKind === 'human-message')
              .flatMap((g) => g.ids),
            outcome: 'done',
          });
          return;
        }
        triage = run;
        automationQuestion = f.core.runtime.bindNativeQuestionInput!(
          run.sessionId,
          run.inboundChannelId!,
        );
        started();
        await released;
      },
      {
        triageContinuation: true,
        ensureTobWorkspace: async (path) => {
          workspace = { id: 'triage-workspace', path, title: 'Tob', status: async () => 'ok' };
          return workspace;
        },
        workspaces: () => ({
          get: () => workspace,
          list: () => (workspace ? [workspace] : []),
        }),
      },
      steer,
      async () => {
        await assignmentDone;
      },
    );
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core, clientControl: clients });
      expect(
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Initialize Memory observation',
        }),
      ).toMatchObject({ ok: true });
      await f.core.runtime.whenIdle();
      f.core.memory.saveHuman({
        botSlug: home.botSlug,
        path: 'qa-note.md',
        body: 'Memory context only',
        expectedHead: f.core.memory.snapshot(home.botSlug).head!,
        editId: 'qa-memory-context',
      });
      expect(
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Read devices',
        }),
      ).toMatchObject({ ok: true });
      await Promise.race([
        start,
        f.core.runtime.whenIdle().then(() => {
          throw new Error('Memory triage was not scheduled');
        }),
      ]);
      expect(triage.inbox).toContain('memory-change');
      expect(() => f.core.runtime.captureTobCliAuthority!(triage.sessionId)).toThrow(
        'human-dm-required',
      );
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Create an offer now',
        clientTarget: target,
        clientProof: proof,
      });
      expect(steer).toHaveBeenCalled();
      const authority = f.core.runtime.captureTobCliAuthority!(triage.sessionId);
      expect(authority.humanSourceEventIds).toHaveLength(1);
      expect(authority.acceptedSourceEventIds).toContain(triage.triage!.current()[0]);
      expect(authority.acceptedSourceEventIds.length).toBeGreaterThan(
        authority.humanSourceEventIds.length,
      );
      expect(authority.currentClientTarget!()).toEqual(target);
      const input = {
        purpose: 'Read selected Memory from the fresh Human request',
        grantId: f.core.grants.list(home.botSlug)[0]!.id,
        targets: [home.botSlug],
        operationKey: 'triage-memory-read-0001',
        expectedTargets: f.core.runtime.prepareMemoryReadTargets!(triage.sessionId, [home.botSlug]),
      };
      const assignment = f.core.runtime.createMemoryReadAssignment!(triage.sessionId, input);
      expect(assignment.outcome).toBe('created');
      const reused = f.core.runtime.createMemoryReadAssignment!(triage.sessionId, input);
      expect(reused).toMatchObject({ outcome: 'reused' });
      if (assignment.outcome !== 'created') throw new Error('Expected read-only Assignment');
      const scope = f.core.runtime.assignmentMemoryScope!(assignment.assignment.sessionId)!;
      expect(scope.sourceEventId).toBe(authority.humanSourceEventIds[0]);
      expect(scope.sourceEventId).not.toBe(triage.triage!.current()[0]);
      expect(scope.targets).toEqual([home.botSlug]);
      expect(() =>
        f.core.runtime.createMemoryReadAssignment!(triage.sessionId, {
          ...input,
          purpose: 'Changed',
        }),
      ).toThrow('operation-key-conflict');
      authority.markSideEffect();
      expect(await f.core.tob.writeSetting(3, 0, authority)).toMatchObject({
        value: 3,
        revision: 1,
      });
      const probe = attachOperationalModule(f.core.operationalDatabase, 'tob-triage-regression');
      const sources = probe.read((db) =>
        db
          .prepare(`
        SELECT e.source_event_id, e.source_kind, e.channel_id, e.message_id, a.reason
          FROM source_events e JOIN inbox_admissions a USING(source_event_id)
         WHERE a.bot_slug = ? AND e.body = ?
      `)
          .all(home.botSlug, 'Create an offer now'),
      );
      expect(sources).toEqual([
        {
          source_event_id: expect.any(String),
          source_kind: 'human-message',
          channel_id: home.channelId,
          message_id: expect.any(String),
          reason: 'human-dm',
        },
      ]);
      const anchor = triage.triage!.current()[0]!;
      probe.transaction((db) =>
        db
          .prepare(
            "UPDATE inbox_admissions SET last_error = 'channel-ended' WHERE source_event_id = ?",
          )
          .run(anchor),
      );
      expect(authority).toThrow('Source Channel has ended');
      expect(() => authority.currentClientTarget!()).toThrow('Source Channel has ended');
      expect(() =>
        f.core.runtime.createMemoryReadAssignment!(triage.sessionId, {
          ...input,
          operationKey: 'triage-memory-refused-0002',
        }),
      ).toThrow('Source Channel has ended');
      probe.transaction((db) =>
        db
          .prepare('UPDATE inbox_admissions SET last_error = NULL WHERE source_event_id = ?')
          .run(anchor),
      );
      expect(authority).not.toThrow();
      triage.triage!.resolve({
        ids: triage.triage!.list().groups.flatMap((g) => g.ids),
        outcome: 'done',
      });
      release();
      releaseAssignment();
      await f.core.runtime.whenIdle();
      expect(await automationQuestion!(() => true)).toBe(true);
      await f.core.runtime.whenIdle();
      expect(automationAnswerChecked).toBe(true);
    } finally {
      if (triage) {
        const remaining = triage.triage!.list().groups.flatMap((g) => g.ids);
        if (remaining.length > 0) triage.triage!.resolve({ ids: remaining, outcome: 'done' });
      }
      release();
      releaseAssignment();
      await f.core.runtime.whenIdle();
      clients.dispose();
      await f.close();
    }
  }, 30000);
  it('invalidates a Human scope on Bot and Group steering and never revives it after a fresh Human capture', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sessionId!: string;
    let original!: () => void;
    const steer = vi.fn(() => true);
    const f = fixture(
      async (run) => {
        sessionId = run.sessionId;
        original = f.core.runtime.captureTobCliAuthority!(sessionId);
        started();
        await released;
      },
      {},
      steer,
    );
    try {
      const home = await f.core.tob.ensure();
      f.core.registry.create({ slug: 'peer', displayName: 'Peer' });
      const bridge = createBridgeMethods({ ...f.core });
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit',
      });
      await start;
      expect(original).not.toThrow();
      f.core.channels.getOrCreateDm('peer', 'Peer');
      const botDm = f.core.channels.getOrCreateBotDm('peer', home.botSlug, 'Peer · Tob')!;
      const messageId = 'bot-' + crypto.randomUUID();
      await f.core.channels.appendMessage(botDm.id, {
        id: messageId,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'peer' },
        body: 'Change the limit',
        botCausation: { rootSourceEventId: 'qa-root', parentSourceEventId: 'qa-parent', hop: 1 },
      });
      f.core.runtime.admitBotDmMessage(botDm.id, messageId);
      expect(original).toThrow('human-dm-required');
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).toThrow('human-dm-required');
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read again',
      });
      const fresh = f.core.runtime.captureTobCliAuthority!(sessionId);
      expect(fresh).not.toThrow();
      expect(original).toThrow('human-dm-required');
      const group = f.core.channels.createGroup({ name: 'Other input', members: [home.botSlug] });
      const groupMessageId = 'human-' + crypto.randomUUID();
      await f.core.channels.appendMessage(group.id, {
        id: groupMessageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Tob make a change',
        mentions: [{ botSlug: home.botSlug, label: 'Tob', start: 0, end: 4 }],
      });
      f.core.runtime.admitGroupMessage(group.id, groupMessageId);
      expect(fresh).toThrow('human-dm-required');
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).toThrow('human-dm-required');
    } finally {
      release();
      await f.core.runtime.whenIdle();
      await f.close();
    }
  });
  it('revokes fresh Human authority on external acceptance even when the accepted Source set does not grow', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sessionId!: string;
    const f = fixture(
      async (run) => {
        sessionId = run.sessionId;
        started();
        await released;
      },
      {},
      () => true,
    );
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit',
      });
      await start;
      const original = f.core.runtime.captureTobCliAuthority!(sessionId);
      const id = crypto.randomUUID();
      const at = new Date().toISOString();
      const probe = attachOperationalModule(f.core.operationalDatabase, 'tob-external-regression');
      probe.transaction((db) => {
        db.prepare(
          "INSERT INTO source_events(source_event_id,source_kind,bot_slug,body,created_at,payload_json) VALUES (?,'bridge-message',?,'External input',?,'{}')",
        ).run(id, home.botSlug, at);
        db.prepare(
          "INSERT INTO inbox_admissions(source_event_id,bot_slug,reason,wake_mode) VALUES (?,?,'human-dm','all')",
        ).run(id, home.botSlug);
      });
      vi.spyOn(f.core.externalMessaging.inbound, 'available').mockReturnValue(true);
      vi.spyOn(f.core.externalMessaging.inbound, 'read').mockReturnValue({
        id,
        body: 'External input',
        at,
        platform: 'discord',
        accountName: 'QA',
        conversationName: 'QA',
        grantId: 'qa-grant',
        grantRevision: 1,
        event: {
          version: 1,
          channel: 'discord',
          botId: 'qa',
          fingerprint: 'qa',
          eventId: id,
          messageId: id,
          actor: { kind: 'user', id: 'external-human' },
          conversation: { kind: 'dm', id: 'external-dm' },
          mentions: [],
          mentionedAccount: false,
          at,
          reply: { messageId: id, conversationId: 'external-dm', actorId: 'external-human' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
      });
      f.core.runtime.admitExternalSource!(home.botSlug, id);
      expect(original).toThrow('human-dm-required');
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).toThrow('human-dm-required');
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit again',
      });
      const fresh = f.core.runtime.captureTobCliAuthority!(sessionId);
      expect(fresh.acceptedSourceEventIds).toContain(id);
      expect(fresh.humanSourceEventIds).not.toContain(id);
      probe.transaction((db) =>
        db
          .prepare(
            "UPDATE inbox_admissions SET attempt_state = 'pending' WHERE source_event_id = ?",
          )
          .run(id),
      );
      f.core.runtime.admitExternalSource!(home.botSlug, id);
      expect(fresh).toThrow('human-dm-required');
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).toThrow('human-dm-required');
    } finally {
      release();
      await f.core.runtime.whenIdle();
      await f.close();
    }
  });
  it('does not restore an earlier Human identity when a reentrant steering delivery accepts newer input', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sessionId!: string;
    let nested: { channelId: string; messageId: string; body: string } | undefined;
    const f = fixture(
      async (run) => {
        sessionId = run.sessionId;
        started();
        await released;
      },
      {},
      () => {
        if (nested) {
          const input = nested;
          nested = undefined;
          f.core.runtime.admitDmMessage(input);
        }
        return true;
      },
    );
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Initial instruction',
      });
      await start;
      const initial = f.core.runtime.captureTobCliAuthority!(sessionId);
      const firstId = 'human-' + crypto.randomUUID(),
        secondId = 'human-' + crypto.randomUUID();
      for (const id of [firstId, secondId])
        await f.core.channels.appendMessage(home.channelId, {
          id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: id,
        });
      nested = { channelId: home.channelId, messageId: secondId, body: secondId };
      f.core.runtime.admitDmMessage({
        channelId: home.channelId,
        messageId: firstId,
        body: firstId,
      });
      expect(initial).toThrow('human-dm-required');
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).toThrow('human-dm-required');
      await bridge.channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Latest fresh instruction',
      });
      expect(() => f.core.runtime.captureTobCliAuthority!(sessionId)).not.toThrow();
      expect(initial).toThrow('human-dm-required');
    } finally {
      release();
      await f.core.runtime.whenIdle();
      await f.close();
    }
  });
  it('restores eligible Human management only after its bound native answer is accepted', async () => {
    let bind: ReturnType<
      NonNullable<ReturnType<typeof fixture>['core']['runtime']['bindNativeQuestionInput']>
    >;
    let checked = false;
    const f = fixture(async (run) => {
      if (run.acceptNativeInput) {
        expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
          'human-dm-required',
        );
        expect(run.acceptNativeInput()).toBe(true);
        const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
        expect(authority).not.toThrow();
        expect(authority.humanSourceEventIds).toHaveLength(1);
        checked = true;
      } else bind = f.core.runtime.bindNativeQuestionInput!(run.sessionId, run.inboundChannelId!);
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Ask a question',
      });
      await f.core.runtime.whenIdle();
      expect(bind).toBeTypeOf('function');
      expect(await bind!(() => true)).toBe(true);
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('does not restore a detached question proof after an intervening Human turn', async () => {
    let bind: ReturnType<
      NonNullable<ReturnType<typeof fixture>['core']['runtime']['bindNativeQuestionInput']>
    >;
    let checked = false;
    const f = fixture(async (run) => {
      if (run.acceptNativeInput) {
        expect(run.acceptNativeInput()).toBe(true);
        expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
          'human-dm-required',
        );
        checked = true;
      } else if (run.message.includes('Original question'))
        bind = f.core.runtime.bindNativeQuestionInput!(run.sessionId, run.inboundChannelId!);
    });
    try {
      const home = await f.core.tob.ensure();
      const bridge = createBridgeMethods({ ...f.core });
      for (const body of ['Original question', 'A later different Human instruction']) {
        await bridge.channelSend({
          channelId: home.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body,
        });
        await f.core.runtime.whenIdle();
      }
      expect(await bind!(() => true)).toBe(true);
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('does not restore management when bound native answer delivery fails', async () => {
    let bind: ReturnType<
      NonNullable<ReturnType<typeof fixture>['core']['runtime']['bindNativeQuestionInput']>
    >;
    let checked = false;
    const f = fixture(async (run) => {
      if (run.acceptNativeInput) {
        expect(run.acceptNativeInput()).toBe(false);
        expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
          'human-dm-required',
        );
        checked = true;
      } else bind = f.core.runtime.bindNativeQuestionInput!(run.sessionId, run.inboundChannelId!);
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Ask a question',
      });
      await f.core.runtime.whenIdle();
      expect(await bind!(() => false)).toBe(false);
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('does not reconstruct management authority from a recovered native question card', async () => {
    let sessionId!: string;
    let checked = false;
    const f = fixture(async (run) => {
      sessionId = run.sessionId;
      if (run.acceptNativeInput) {
        expect(run.acceptNativeInput()).toBe(true);
        expect(() => f.core.runtime.captureTobCliAuthority!(run.sessionId)).toThrow(
          'human-dm-required',
        );
        checked = true;
      }
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Ask a question',
      });
      await f.core.runtime.whenIdle();
      const messageId = crypto.randomUUID();
      await f.core.channels.appendMessage(home.channelId, {
        id: messageId,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: home.botSlug },
        body: 'A recovered native question',
        userQuestionRequest: {
          sessionId,
          callId: 'recovered-call',
          questions: [
            {
              id: 'which',
              header: 'Choice',
              question: 'Which?',
              options: [
                { label: 'One', description: 'One' },
                { label: 'Two', description: 'Two' },
              ],
            },
          ],
        },
      });
      const recover = f.core.runtime.recoverNativeQuestionInput!(
        sessionId,
        home.channelId,
        messageId,
      );
      expect(recover).toBeTypeOf('function');
      expect(await recover!(() => true)).toBe(true);
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it.each([
    'source-kind',
    'source-channel',
    'source-bot',
    'source-message',
    'source-author',
    'admission-reason',
    'owner-role',
    'owner-bot',
    'parent-session',
    'purged-source',
    'archived-session',
  ])('rechecks %s before using a fresh Human scope', async (change) => {
    const archived: string[] = [];
    let checked = false;
    const f = fixture(
      async (run) => {
        const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
        const probe = attachOperationalModule(
          f.core.operationalDatabase,
          'tob-provenance-regression',
        );
        const source = probe.read((db) =>
          db
            .prepare(
              "SELECT source_event_id, channel_id, message_id FROM source_events WHERE source_kind = 'human-message' AND channel_id = ?",
            )
            .get(run.inboundChannelId!),
        )!;
        const sourceId = source.source_event_id;
        const sourceChannel = source.channel_id;
        const sourceMessage = source.message_id;
        if (
          typeof sourceId !== 'string' ||
          typeof sourceChannel !== 'string' ||
          typeof sourceMessage !== 'string'
        )
          throw new Error('Canonical Human Source identity missing');
        if (change === 'archived-session') archived.push(run.sessionId);
        else
          probe.transaction((db) => {
            if (change === 'source-kind')
              db.prepare(
                "UPDATE source_events SET source_kind = 'bot-message' WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'source-bot')
              db.prepare(
                "UPDATE source_events SET bot_slug = 'ordinary' WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'source-channel')
              db.prepare(
                "UPDATE source_events SET channel_id = 'foreign-dm' WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'source-message')
              db.prepare(
                "UPDATE source_events SET message_id = 'foreign-message' WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'source-author')
              db.prepare(
                "UPDATE source_events SET payload_json = json_set(payload_json, '$.author.kind', 'bot') WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'admission-reason')
              db.prepare(
                "UPDATE inbox_admissions SET reason = 'bot-dm' WHERE source_event_id = ?",
              ).run(sourceId);
            if (change === 'owner-role')
              db.prepare(
                "UPDATE session_ownership SET root_role = 'assignment' WHERE session_id = ?",
              ).run(run.sessionId);
            if (change === 'owner-bot')
              db.prepare(
                "UPDATE session_ownership SET bot_slug = 'ordinary' WHERE session_id = ?",
              ).run(run.sessionId);
            if (change === 'parent-session')
              db.prepare(
                "UPDATE session_ownership SET parent_session_id = 'foreign-parent' WHERE session_id = ?",
              ).run(run.sessionId);
            if (change === 'purged-source')
              db.prepare(
                "INSERT INTO messaging_purge_facts(source_event_id,channel_id,message_id,accepted_at,tombstone_json) VALUES (?,?,?,?,'{}')",
              ).run(sourceId, sourceChannel, sourceMessage, new Date().toISOString());
          });
        expect(authority).toThrow();
        await expect(f.core.tob.writeSetting(3, 0, authority)).rejects.toThrow();
        expect(f.core.tob.readSetting().value).toBe(8);
        checked = true;
      },
      {
        workspaces: () => ({ get: () => undefined, list: () => [], archivedSessionIds: archived }),
      },
    );
    try {
      const home = await f.core.tob.ensure();
      f.core.registry.create({ slug: 'ordinary', displayName: 'Ordinary' });
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read the limit',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('marks only the captured accepted sources before a write and refuses marking after the turn', async () => {
    let mark!: () => void;
    let checked = false;
    const f = fixture(async (run) => {
      const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      const port = attachOperationalModule(f.core.operationalDatabase, 'tob-cli-test');
      const marked = () =>
        port.read((db) =>
          db
            .prepare(
              'SELECT side_effect_started_at FROM inbox_admissions WHERE bot_slug = ? AND reason = ?',
            )
            .all(run.bot.slug, 'human-dm'),
        );
      expect(marked()).toEqual([{ side_effect_started_at: null }]);
      authority();
      expect(marked()).toEqual([{ side_effect_started_at: null }]);
      authority.markSideEffect();
      expect(marked()).toEqual([{ side_effect_started_at: expect.any(String) }]);
      mark = authority.markSideEffect;
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Set limit to 3',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
      expect(mark).toThrow('human-dm-required');
    } finally {
      await f.close();
    }
  });
  it('revokes CLI authority when native Session content becomes unavailable', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const authority = f.core.runtime.captureTobCliAuthority!(run.sessionId);
      f.core.ownership.markContentUnavailable();
      expect(authority).toThrow('tob-authority-required');
      expect(authority.markSideEffect).toThrow('tob-authority-required');
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Read limit',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('refuses legacy Group management at the runtime boundary while keeping Tob private replies available', async () => {
    let checked = false;
    const f = fixture(async (run) => {
      const actions = [
        () => run.channels.createGroup('Group'),
        () => run.channels.inviteGroup({ channelId: 'group', targetBotSlug: 'peer' }),
        () => run.channels.respondToGroupInvite({ invitationId: 'invite', accept: true }),
        () => run.channels.requestGroupJoin!({ channelId: 'group' }),
        () =>
          run.channels.decideGroupJoin!({ channelId: 'group', requestId: 'request', accept: true }),
        () => run.channels.renameGroup({ channelId: 'group', name: 'Renamed' }),
        () => run.channels.removeGroupMember({ channelId: 'group', botSlug: 'peer' }),
        () => run.channels.leaveGroup({ channelId: 'group' }),
      ];
      for (const action of actions) expect(action).toThrow('tob-cli-required');
      const sent = await run.channels.send({ body: 'I can manage groups from this private DM.' });
      expect(sent.body).toBe('I can manage groups from this private DM.');
      checked = true;
    });
    try {
      const home = await f.core.tob.ensure();
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: home.channelId,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Create a group',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
  it('keeps ordinary Group tools working but prevents inviting or approving protected Tob', async () => {
    let checked = false;
    let tobSlug!: string;
    const f = fixture(async (run) => {
      if (run.bot.slug !== 'owner') return;
      const group = run.channels.createGroup('Ordinary Group');
      expect(group.members).toContain('owner');
      expect(() =>
        run.channels.inviteGroup({ channelId: group.id, targetBotSlug: tobSlug }),
      ).toThrow('protected-bot');
      const invitation = run.channels.inviteGroup({ channelId: group.id, targetBotSlug: 'peer' });
      expect(invitation.targetBotSlug).toBe('peer');
      const request = f.core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: tobSlug,
        requesterBotCreatedAt: f.core.registry.get(tobSlug)!.createdAt,
      });
      expect(() =>
        run.channels.decideGroupJoin!({ channelId: group.id, requestId: request.id, accept: true }),
      ).toThrow('protected-bot');
      expect(f.core.channels.get(group.id)?.members).not.toContain(tobSlug);
      const peerRequest = f.core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'another-peer',
        requesterBotCreatedAt: f.core.registry.get('another-peer')!.createdAt,
      });
      const decided = run.channels.decideGroupJoin!({
        channelId: group.id,
        requestId: peerRequest.id,
        accept: true,
      });
      expect(decided.channel.members).toContain('another-peer');
      checked = true;
    });
    try {
      tobSlug = (await f.core.tob.ensure()).botSlug;
      for (const slug of ['owner', 'peer', 'another-peer'])
        f.core.registry.create({ slug, displayName: slug });
      const dm = f.core.channels.getOrCreateDm('owner', 'owner')!;
      await createBridgeMethods({ ...f.core }).channelSend({
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Create a group',
      });
      await f.core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await f.close();
    }
  });
});

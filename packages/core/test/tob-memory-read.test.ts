import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import {
  createAssignmentMemoryOperations,
  MEMORY_READ_CAPABILITIES,
} from '../src/tob/cli-memory-operations.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import type {
  AssignmentAgentRun,
  OrchestratorAgentRun,
  AssignmentCreateOutcome,
  MemoryReadAssignmentInput,
} from '../src/runtime/bot-runtime.js';
import type { DshWorkspace } from '../src/workspaces/grants.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function fixture() {
  const home = createTempRoot('tob-memory-read-');
  let workspace: DshWorkspace | undefined;
  let task: ((run: OrchestratorAgentRun) => void | Promise<void>) | undefined;
  const runs: AssignmentAgentRun[] = [];
  const core = createCore({
    dshHome: home,
    ensureTobWorkspace: async (path) => {
      workspace = { id: 'tob-workspace', path, title: 'Tob', status: async () => 'ok' };
      return workspace;
    },
    workspaces: () => ({
      get: (id) => (workspace?.id === id ? workspace : undefined),
      list: () => (workspace ? [workspace] : []),
    }),
    agents: {
      async runOrchestrator(run) {
        const current = task;
        task = undefined;
        await current?.(run);
      },
      async runAssignment(run) {
        runs.push(run);
      },
      requestAssignment(run) {
        runs.push(run);
        return { delivery: 'followup', accepted: Promise.resolve(), done: Promise.resolve() };
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  });
  const tob = await core.tob.ensure();
  core.registry.create({
    slug: 'alpha',
    displayName: 'Alpha',
    coreMemory: 'Alpha prefers green tea.\n',
  });
  core.registry.create({
    slug: 'beta',
    displayName: 'Beta',
    coreMemory: 'Beta prefers black coffee.\n',
  });
  const grantId = core.grants.list(tob.botSlug)[0]!.id;
  const bridge = createBridgeMethods({ ...core });
  async function human(action: NonNullable<typeof task>) {
    task = action;
    const result = await bridge.channelSend({
      channelId: tob.channelId,
      messageId: 'human-' + crypto.randomUUID(),
      body: 'Compare Alpha and Beta Memory, with their sources.',
    });
    expect(result.ok).toBe(true);
    await core.runtime.whenIdle();
  }
  function admittedCreate(sessionId: string, input: MemoryReadAssignmentInput) {
    return core.runtime.createMemoryReadAssignment!(sessionId, {
      ...input,
      expectedTargets: core.runtime.prepareMemoryReadTargets!(sessionId, input.targets),
    });
  }
  async function create(key = 'memory-test-create-1') {
    let result: AssignmentCreateOutcome | undefined;
    await human((run) => {
      result = admittedCreate(run.sessionId, {
        purpose: 'Compare the selected Memory files',
        grantId,
        targets: ['alpha', 'beta'],
        operationKey: key,
      });
    });
    if (result?.outcome !== 'created' && result?.outcome !== 'reused')
      throw new Error('Expected Assignment');
    return result.assignment.sessionId;
  }
  return {
    core,
    tob,
    runs,
    human,
    create,
    admittedCreate,
    grantId,
    workspace: () => workspace!,
    replaceWorkspace: (value: DshWorkspace) => {
      workspace = value;
    },
  };
}
async function scoped(f: Awaited<ReturnType<typeof fixture>>, sessionId: string) {
  const scope = f.core.runtime.assignmentMemoryScope!(sessionId)!;
  const broker = await startTobCliBroker({
    signal: new AbortController().signal,
    scope: 'assignment-memory-read',
    authorize: () => scope.authorize(),
    capabilities: MEMORY_READ_CAPABILITIES,
    prepareOperation: createAssignmentMemoryOperations(f.core.runtime, f.core.memory, sessionId),
    readSetting: () => {
      throw new Error('Unexpected setting');
    },
    writeSetting: async () => {
      throw new Error('Unexpected write');
    },
    approve: async () => {
      throw new Error('Unexpected approval');
    },
  });
  closes.push(() => broker.close());
  const invoke = async (command: string, args: Record<string, unknown>) =>
    (
      await fetch(broker.endpoint + '/invoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + broker.token, 'content-type': 'application/json' },
        body: JSON.stringify({ command, args }),
      })
    ).json();
  const cli = async (argv: string[]) => {
    const output: string[] = [];
    const status = await runBotCreateCli(argv, {
      env: { DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint, DEEPSEEKBOT_AGENT_TOKEN: broker.token },
      stdout: (text) => output.push(text),
      stderr: () => {},
    });
    return { status, value: JSON.parse(output.join('\n')) };
  };
  return { invoke, cli };
}

describe('Tob-owned delegated Memory reading', () => {
  it('deduplicates lost creation responses, keeps Tob ownership and forces scoped permissions', async () => {
    const f = await fixture();
    f.core.assignmentAccess.set(f.tob.botSlug, 'danger-full-access');
    let first: AssignmentCreateOutcome | undefined;
    let retry: AssignmentCreateOutcome | undefined;
    await f.human((run) => {
      const input = {
        purpose: 'Compare selected Memory',
        grantId: f.grantId,
        targets: ['beta', 'alpha'],
        operationKey: 'memory-retry-0001',
      };
      first = f.admittedCreate(run.sessionId, input);
      retry = f.admittedCreate(run.sessionId, input);
      expect(() => f.admittedCreate(run.sessionId, { ...input, targets: ['alpha'] })).toThrow(
        'operation-key-conflict',
      );
    });
    expect(first).toMatchObject({
      outcome: 'created',
      assignment: {
        botSlug: f.tob.botSlug,
        permission: { mode: 'workspace-write', approval: 'ask', grantId: f.grantId },
      },
    });
    expect(retry).toMatchObject({ outcome: 'reused' });
    expect(f.runs).toHaveLength(1);
    const id = f.runs[0]!.sessionId;
    expect(f.core.ownership.resolve(id)).toMatchObject({
      botSlug: f.tob.botSlug,
      rootRole: 'assignment',
    });
    expect(f.core.runtime.assignmentMemoryScope!(id)!.targets).toEqual(['alpha', 'beta']);
    expect(() =>
      f.core.runtime.createMemoryReadAssignment!('forged-session', {
        purpose: 'spoof',
        grantId: f.grantId,
        targets: ['alpha'],
        operationKey: 'memory-spoof-0001',
      }),
    ).toThrow('tob-authority-required');
  });

  it('runs the actual CLI against two immutable revisions with bounded pages and refuses writes/other targets', async () => {
    const f = await fixture();
    const id = await f.create();
    const b = await scoped(f, id);
    const sources: Array<{ botSlug: string; sha: string; path: string; body: string }> = [];
    for (const slug of ['alpha', 'beta']) {
      expect(f.core.memory.revisionQuery(slug, { kind: 'snapshot' })).toBeDefined();
      const snapshot = await b.cli(['memory-snapshot', slug, '--limit', '1']);
      expect(snapshot.status).toBe(0);
      expect(snapshot.value).toMatchObject({
        botSlug: slug,
        readOnly: true,
        partial: true,
        nextOffset: 1,
        contentRole: 'data',
      });
      const sha = snapshot.value.sha;
      const read = await b.cli([
        'memory-file',
        slug,
        '--sha',
        sha,
        '--path',
        'MEMORY.md',
        '--limit',
        '6',
      ]);
      expect(read.status).toBe(0);
      expect(read.value).toMatchObject({ sha, path: 'MEMORY.md', partial: true, nextOffset: 6 });
      const rest = await b.cli([
        'memory-file',
        slug,
        '--sha',
        sha,
        '--path',
        'MEMORY.md',
        '--offset',
        '6',
      ]);
      sources.push({
        botSlug: slug,
        sha,
        path: 'MEMORY.md',
        body: read.value.body + rest.value.body,
      });
      expect((await b.cli(['memory-history', slug, '--sha', sha, '--limit', '1'])).status).toBe(0);
      expect((await b.cli(['memory-diff', slug, '--sha', sha, '--limit', '8'])).status).toBe(0);
      writeFileSync(
        join(f.core.registry.memoryDirFor(slug)!, 'MEMORY.md'),
        'Uncommitted injected replacement',
      );
      expect(
        (await b.cli(['memory-file', slug, '--sha', sha, '--path', 'MEMORY.md'])).value.body,
      ).toBe(sources.at(-1)!.body);
      expect(await b.invoke('memory-file', { slug, sha, path: '../secret' })).toMatchObject({
        ok: false,
        error: { code: 'memory-invalid' },
      });
    }
    expect(sources.map((source) => source.body)).toEqual([
      'Alpha prefers green tea.\n',
      'Beta prefers black coffee.\n',
    ]);
    expect(await b.invoke('settings-set', {})).toMatchObject({
      ok: false,
      error: { code: 'memory-read-only' },
    });
    expect(await b.invoke('memory-save', { slug: 'alpha', body: 'overwrite' })).toMatchObject({
      ok: false,
      error: { code: 'memory-read-only' },
    });
    expect(await b.invoke('memory-snapshot', { slug: f.tob.botSlug })).toMatchObject({
      ok: false,
      error: { code: 'memory-target-denied' },
    });
    expect(await b.invoke('memory-file', { slug: 'alpha', path: 'MEMORY.md' })).toMatchObject({
      ok: false,
      error: { code: 'memory-invalid' },
    });
  });

  it('rechecks archived targets, source authority, explicit revocation and Workspace Grant lifetime', async () => {
    const f = await fixture();
    const id = await f.create();
    const b = await scoped(f, id);
    f.core.registry.setPaused('beta', true);
    expect(await b.invoke('memory-snapshot', { slug: 'beta' })).toMatchObject({
      ok: false,
      error: { code: 'memory-target-unavailable' },
    });
    expect(await b.invoke('memory-snapshot', { slug: 'alpha' })).toMatchObject({ ok: true });
    await f.human((run) => {
      f.core.runtime.revokeMemoryReadAssignment!(run.sessionId, id);
    });
    expect(await b.invoke('memory-snapshot', { slug: 'alpha' })).toMatchObject({
      ok: false,
      error: { code: 'memory-scope-unavailable' },
    });
    f.core.registry.setPaused('beta', false);
    const another = await f.create('memory-grant-0002');
    const grantScope = f.core.runtime.assignmentMemoryScope!(another)!;
    f.core.grants.revoke(f.tob.botSlug, f.grantId);
    expect(grantScope.authorize).toThrow();
  });

  it('retains scope and normal report lifecycle during resumed Assignment requests', async () => {
    const f = await fixture();
    const id = await f.create();
    const initial = f.core.runtime.assignmentMemoryScope!(id)!;
    await f.runs[0]!.report({
      state: 'completed',
      summary: 'Alpha MEMORY.md at its revision prefers tea; Beta prefers coffee.',
    });
    await f.human((run) => {
      run.assignments.request({
        sessionId: id,
        mode: 'next-turn',
        text: 'Explain the contrast using the same selected sources.',
      });
    });
    expect(f.runs).toHaveLength(2);
    expect(f.runs[1]).toMatchObject({ sessionId: id, resume: true, bot: { slug: f.tob.botSlug } });
    expect(f.core.runtime.assignmentMemoryScope!(id)).toMatchObject({
      targets: initial.targets,
      sourceEventId: initial.sourceEventId,
    });
    await f.runs[1]!.report({ state: 'completed', summary: 'Source-grounded resumed comparison.' });
    expect(f.core.runtime.getAssignment(f.tob.botSlug, id)?.latestReport?.summary).toBe(
      'Source-grounded resumed comparison.',
    );
    expect(f.core.runtime.getAssignment('alpha', id)).toBeUndefined();
  });

  it('rechecks the original canonical Human source and Assignment archive state', async () => {
    const f = await fixture();
    const id = await f.create();
    const b = await scoped(f, id);
    const scope = f.core.runtime.assignmentMemoryScope!(id)!;
    const db = attachOperationalModule(f.core.operationalDatabase, 'memory-scope-test');
    db.transaction((connection) =>
      connection
        .prepare('UPDATE assignments SET archived_at = ? WHERE session_id = ?')
        .run(new Date().toISOString(), id),
    );
    expect(await b.invoke('memory-snapshot', { slug: 'alpha' })).toMatchObject({
      ok: false,
      error: { code: 'memory-scope-unavailable' },
    });
    db.transaction((connection) =>
      connection.prepare('UPDATE assignments SET archived_at = NULL WHERE session_id = ?').run(id),
    );
    expect(scope.authorize).not.toThrow();
    db.transaction((connection) =>
      connection
        .prepare("UPDATE source_events SET source_kind = 'schedule' WHERE source_event_id = ?")
        .run(scope.sourceEventId),
    );
    expect(await b.invoke('memory-snapshot', { slug: 'alpha' })).toMatchObject({
      ok: false,
      error: { code: 'human-dm-required' },
    });
  });

  it('refuses an incarnation that differs from the reviewed target snapshot', async () => {
    const f = await fixture();
    await f.human((run) => {
      const expectedTargets = f.core.runtime.prepareMemoryReadTargets!(run.sessionId, [
        'alpha',
        'beta',
      ]);
      expectedTargets[0]!.createdAt = '2000-01-01T00:00:00.000Z';
      expect(() =>
        f.core.runtime.createMemoryReadAssignment!(run.sessionId, {
          purpose: 'Compare',
          grantId: f.grantId,
          targets: ['alpha', 'beta'],
          expectedTargets,
          operationKey: 'memory-stale-0001',
        }),
      ).toThrow('memory-target-changed');
    });
    expect(f.runs).toHaveLength(0);
  });

  it('refuses a workspace spanning the Bot data root', async () => {
    const f = await fixture();
    const original = f.workspace();
    f.replaceWorkspace({ ...original, id: 'broad', path: f.core.registry.rootDir });
    const broad = await f.core.grants.create(f.tob.botSlug, 'broad');
    await f.human((run) => {
      expect(() =>
        f.admittedCreate(run.sessionId, {
          purpose: 'Compare',
          grantId: broad.id,
          targets: ['alpha'],
          operationKey: 'memory-broad-0001',
        }),
      ).toThrow('memory-workspace-denied');
    });
    expect(f.runs).toHaveLength(0);
  });
});

import { afterEach, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import type {
  OrchestratorAgentRun,
  AssignmentAgentRun,
  BotAgentAdapter,
} from '../src/runtime/bot-runtime.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
};

it('reads canonical actions and message activity without changing read state or provisioning Tob', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-home-dashboard-'), agents });
  try {
    for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
    const older = core.channels.getOrCreateDm('ada')!;
    const newer = core.channels.getOrCreateDm('bea')!;
    await core.channels.appendMessage(newer.id, {
      id: 'new',
      at: '2026-10-18T09:00:00Z',
      author: { kind: 'bot', slug: 'bea' },
      body: 'Progress',
    });
    await core.channels.appendMessage(older.id, {
      id: 'old',
      at: '2026-10-17T09:00:00Z',
      author: { kind: 'human' },
      body: 'Earlier',
    });
    for (let index = 0; index < 7; index++)
      await core.channels.appendMessage(older.id, {
        id: 'grant-' + index,
        at: '2026-10-17T09:01:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Choose Workspace',
        grantRequest: true,
      });
    const hidden = core.channels.getOrCreateBotDm('ada', 'bea', 'Private Bots')!;
    await core.channels.appendMessage(hidden.id, {
      id: 'hidden',
      at: '2026-10-17T01:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Private',
      botCausation: { rootSourceEventId: 'qa-root', parentSourceEventId: 'qa-parent', hop: 1 },
    });
    core.channels.setHumanNickname(older.id, 'Recent visit is not activity');
    const before = core.humanAttention.status();
    const readUsageSessionLog = vi.fn(async () => {
      throw new Error('Home must not read Session logs');
    });
    const result = await createBridgeMethods({
      ...core,
      runningSessionIds: () => new Set(),
      readUsageSessionLog,
    }).homeDashboard({});
    expect(readUsageSessionLog).not.toHaveBeenCalled();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.attention).toMatchObject({
      status: 'ready',
      value: { actionCount: 7, hasMore: true },
    });
    if (result.value.attention.status !== 'ready') throw new Error('attention unavailable');
    expect(result.value.attention.value.items).toHaveLength(5);
    expect(result.value.recent).toMatchObject({
      status: 'ready',
      value: [{ channelId: newer.id, messageId: 'new' }, { channelId: older.id }],
    });
    expect(result.value.usage).toMatchObject({
      status: 'ready',
      value: { totalTokens: 0, status: 'ready' },
    });
    expect(core.humanAttention.status()).toEqual(before);
    expect(
      core.registry
        .list()
        .map((bot) => bot.slug)
        .sort(),
    ).toEqual(['ada', 'bea']);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('shows only currently executing roots and keeps unavailable owners distinct from empty facts', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-home-working-'), agents });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    for (const [sessionId, parentSessionId, state] of [
      ['live', undefined, 'thinking'],
      ['child', 'live', 'working'],
      ['stale', undefined, 'working'],
      ['waiting', undefined, 'waiting'],
    ] as const) {
      core.ownership.claim({
        sessionId,
        botSlug: 'ada',
        rootRole: 'orchestrator',
        ...(parentSessionId ? { parentSessionId } : {}),
        at: '2026-10-18T09:00:00Z',
      });
      core.states.setSessionState('ada', sessionId, state);
    }
    const live = new Set(['live', 'child', 'waiting']);
    const methods = createBridgeMethods({ ...core, runningSessionIds: () => live });
    expect(await methods.homeDashboard({ range: '24h' })).toMatchObject({
      ok: true,
      value: {
        working: { status: 'ready', value: [{ slug: 'ada', sessions: [{ sessionId: 'live' }] }] },
      },
    });
    live.clear();
    expect(await methods.homeDashboard({})).toMatchObject({
      ok: true,
      value: { working: { status: 'ready', value: [] } },
    });
    const unavailable = createBridgeMethods({
      registry: core.registry,
      channels: core.channels,
      ownership: core.ownership,
      states: core.states,
      roster: core.roster,
    });
    expect(await unavailable.homeDashboard({})).toMatchObject({
      ok: true,
      value: {
        working: { status: 'unavailable' },
        attention: { status: 'unavailable' },
        recent: { status: 'unavailable' },
      },
    });
    expect(await methods.homeDashboard({ range: 'today' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.homeDashboard({ range: '24h', botSlug: 'ada' })).toMatchObject({
      ok: false,
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

afterEach(() => vi.useRealTimers());
it('orders tasks by canonical report activity rather than root creation or Channel visits', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
  let orchestrator: OrchestratorAgentRun | undefined;
  let assignment: AssignmentAgentRun | undefined;
  let finish!: () => void;
  const workspace = {
    id: 'project',
    path: realpathSync(createTempRoot('bh-home-project-')),
    title: 'Project',
    status: async () => 'ok' as const,
  };
  const core = createCore({
    dshHome: createTempRoot('bh-home-task-'),
    workspaces: () => ({ get: () => workspace, list: () => [workspace] }),
    agents: {
      ...agents,
      async runOrchestrator(run) {
        orchestrator = run;
      },
      runAssignment(run) {
        assignment = run;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm('ada')!;
    const grant = await core.grants.create('ada', workspace.id);
    const methods = createBridgeMethods({ ...core });
    await methods.channelSend({ channelId: dm.id, body: 'Start a task' });
    await core.runtime.whenIdle();
    const created = orchestrator!.assignments.create({
      grantId: grant.id,
      purpose: 'Prepare release',
    });
    if (created.outcome !== 'created') throw new Error('Task missing');
    vi.setSystemTime(new Date('2026-10-18T11:00:00Z'));
    await assignment!.report({ state: 'progress', summary: 'Release prepared' });
    core.channels.setHumanNickname(dm.id, 'Visited later');
    const result = await methods.homeDashboard({});
    expect(result).toMatchObject({
      ok: true,
      value: {
        recent: {
          status: 'ready',
          value: expect.arrayContaining([
            expect.objectContaining({
              kind: 'assignment',
              sessionId: created.assignment.sessionId,
              label: 'Prepare release',
              at: '2026-10-18T11:00:00.000Z',
            }),
          ]),
        },
      },
    });
  } finally {
    finish?.();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

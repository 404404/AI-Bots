import { describe, expect, it, vi } from 'vitest';
import { parseAgentManagement } from '../src/bots/cli-agent-management.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';

const orchestrator = { provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' };
const assignmentDefault = { provider: 'deepseek', model: 'chat' };
const assignmentModels = [
  { ...assignmentDefault, allowedEfforts: ['', 'high'], defaultEffort: '', note: 'Quick tasks' },
];
const plan = { orchestrator, assignmentDefault, assignmentModels };
const presetFlags = {
  name: 'Balanced',
  'orchestrator-provider': 'deepseek',
  'orchestrator-model': 'reasoner',
  'orchestrator-effort': 'high',
  'assignment-provider': 'deepseek',
  'assignment-model': 'chat',
};
function parser(stdin = '') {
  const readStdin = vi.fn(async () => stdin);
  const stdout = vi.fn();
  const stderr = vi.fn();
  const parse = (command: string, rest: string[] = [], values: Record<string, unknown> = {}) =>
    parseAgentManagement(command, rest, values, { env: {}, stdout, stderr, readStdin });
  return { parse, readStdin, stdout, stderr };
}

describe('scoped management CLI arguments', () => {
  it('only recognizes the scoped management surface', async () => {
    const { parse } = parser();
    expect(await parse('settings')).toBeUndefined();
    expect(await parse('channel-create')).toBeUndefined();
    expect(await parse('model-preset-delete')).toBeUndefined();
  });

  it.each([
    'list',
    'model-catalog',
    'model-presets',
    'telemetry-status',
    'git-status',
    'release-check',
  ])('classifies %s as a bounded Host read without consuming input', async (command) => {
    const { parse, readStdin, stdout, stderr } = parser('private input');
    expect(await parse(command, [], { compact: true, timeout: '1000' })).toEqual({
      command,
      args: {},
      write: false,
    });
    expect(readStdin).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('normalizes targeted reads and optional release metadata', async () => {
    const { parse } = parser();
    expect(await parse('model-plan', ['research'])).toEqual({
      command: 'model-plan',
      args: { slug: 'research' },
      write: false,
    });
    expect(await parse('release-info', [], { since: '1.2.3' })).toEqual({
      command: 'release-info',
      args: { since: '1.2.3' },
      write: false,
    });
    await expect(parse('model-plan')).rejects.toMatchObject({ code: 'usage' });
    await expect(parse('model-catalog', ['research'])).rejects.toMatchObject({ code: 'usage' });
  });

  it.each(['host', 'token', 'token-file', 'home', 'bot', 'config', 'provider-api-key'])(
    'rejects --%s without reflecting its private value or consuming stdin',
    async (flag) => {
      const { parse, readStdin } = parser('private secret');
      try {
        await parse('model-plan-set', ['research'], {
          [flag]: 'private secret',
          'plan-stdin': true,
          'expected-revision': '4',
        });
        expect.fail('must reject option');
      } catch (error) {
        expect(error).toBeInstanceOf(CliLiveError);
        expect(error).toMatchObject({ code: 'agent-scope-denied' });
        expect(String(error)).not.toContain('private secret');
      }
      expect(readStdin).not.toHaveBeenCalled();
    },
  );

  it('requires the observed revision for default model and preserves reasoning effort', async () => {
    const { parse } = parser();
    const flags = { provider: 'deepseek', model: 'reasoner', 'orchestrator-effort': 'high' };
    await expect(parse('home-model-set', [], flags)).rejects.toMatchObject({ code: 'usage' });
    expect(await parse('home-model-set', [], { ...flags, 'expected-revision': '7' })).toEqual({
      command: 'home-model-set',
      args: { route: orchestrator, expectedRevision: 7 },
      write: true,
    });
  });

  it('keeps customization and inheritance targeted at the reviewed Bot revision', async () => {
    const { parse } = parser();
    expect(
      await parse('model-plan-customize', ['research'], {
        'orchestrator-provider': 'deepseek',
        'orchestrator-model': 'reasoner',
        'orchestrator-effort': 'high',
        'expected-revision': '0',
      }),
    ).toEqual({
      command: 'model-plan-customize',
      args: { slug: 'research', expectedRevision: 0, orchestrator },
      write: true,
    });
    expect(await parse('model-plan-inherit', ['research'], { 'expected-revision': '8' })).toEqual({
      command: 'model-plan-inherit',
      args: { slug: 'research', expectedRevision: 8 },
      write: true,
    });
  });

  it.each([undefined, '-1', '1.5', '1e2', '9007199254740992', 3])(
    'rejects unsafe revision %s before reading the plan',
    async (revision) => {
      const { parse, readStdin } = parser(JSON.stringify(plan));
      await expect(
        parse('model-plan-set', ['research'], {
          'plan-stdin': true,
          'expected-revision': revision,
        }),
      ).rejects.toMatchObject({ code: 'usage' });
      expect(readStdin).not.toHaveBeenCalled();
    },
  );

  it('preserves all full-plan choices and notes from private stdin', async () => {
    const { parse, stdout, stderr } = parser(JSON.stringify(plan));
    expect(
      await parse('model-plan-set', ['research'], { 'plan-stdin': true, 'expected-revision': '9' }),
    ).toEqual({
      command: 'model-plan-set',
      args: { slug: 'research', expectedRevision: 9, ...plan },
      write: true,
    });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('updates only Assignment routes without supplying an Orchestrator', async () => {
    const { parse } = parser(JSON.stringify({ assignmentDefault, assignmentModels }));
    expect(
      await parse('model-plan-assignments-set', ['research'], {
        'plan-stdin': true,
        'expected-revision': '9',
      }),
    ).toEqual({
      command: 'model-plan-assignments-set',
      args: { slug: 'research', expectedRevision: 9, assignmentDefault, assignmentModels },
      write: true,
    });
  });

  it.each([
    '{"private secret":',
    JSON.stringify({ ...plan, apiKey: 'private secret' }),
    JSON.stringify({ ...plan, orchestrator: { ...orchestrator, apiKey: 'private secret' } }),
    JSON.stringify({
      ...plan,
      assignmentModels: [{ ...assignmentModels[0], token: 'private secret' }],
    }),
    JSON.stringify({ ...plan, assignmentModels: [...assignmentModels, ...assignmentModels] }),
    JSON.stringify({ ...plan, assignmentDefault: { ...assignmentDefault, model: 'missing' } }),
    JSON.stringify({
      ...plan,
      assignmentModels: [{ ...assignmentModels[0], defaultEffort: 'high' }],
    }),
    JSON.stringify({ ...plan, assignmentModels: [] }),
    ' '.repeat(16 * 1024 + 1),
  ])('rejects invalid private plan input without echoing it', async (stdin) => {
    const { parse } = parser(stdin);
    try {
      await parse('model-plan-set', ['research'], { 'plan-stdin': true, 'expected-revision': '4' });
      expect.fail('must reject invalid plan');
    } catch (error) {
      expect(error).toMatchObject({ code: 'usage' });
      expect(String(error)).not.toContain('private secret');
    }
  });

  it('creates a preset without fetching a default or requiring an existing revision', async () => {
    const { parse, readStdin } = parser();
    expect(await parse('model-preset-create', [], presetFlags)).toEqual({
      command: 'model-preset-create',
      args: { name: 'Balanced', orchestrator, assignmentDefault },
      write: true,
    });
    expect(readStdin).not.toHaveBeenCalled();
    await expect(
      parse('model-preset-create', [], { ...presetFlags, 'expected-revision': '1' }),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
  });

  it('updates a preset with explicit routes, revision and optional Assignment choices', async () => {
    const { parse } = parser(JSON.stringify({ assignmentModels }));
    expect(
      await parse('model-preset-update', ['preset-1'], {
        ...presetFlags,
        'expected-revision': '2',
        'plan-stdin': true,
      }),
    ).toEqual({
      command: 'model-preset-update',
      args: {
        id: 'preset-1',
        name: 'Balanced',
        expectedRevision: 2,
        orchestrator,
        assignmentDefault,
        assignmentModels,
      },
      write: true,
    });
    await expect(
      parse('model-preset-update', ['preset-1'], { ...presetFlags, 'expected-revision': '0' }),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('model-preset-update', ['preset-1'], { name: 'Balanced', 'expected-revision': '2' }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('requires both the reviewed Bot and source preset revisions when applying', async () => {
    const { parse } = parser();
    const flags = { preset: 'preset-1', 'expected-revision': '4', 'preset-revision': '2' };
    expect(await parse('model-preset-apply', ['research'], flags)).toEqual({
      command: 'model-preset-apply',
      args: {
        slug: 'research',
        presetId: 'preset-1',
        expectedRevision: 4,
        expectedPresetRevision: 2,
      },
      write: true,
    });
    await expect(
      parse('model-preset-apply', ['research'], { ...flags, 'preset-revision': undefined }),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('accepts exactly one telemetry preference and treats Git installation as a write', async () => {
    const { parse } = parser();
    expect(await parse('telemetry-set', [], { enabled: true })).toEqual({
      command: 'telemetry-set',
      args: { enabled: true },
      write: true,
    });
    expect(await parse('telemetry-set', [], { disabled: true })).toEqual({
      command: 'telemetry-set',
      args: { enabled: false },
      write: true,
    });
    await expect(parse('telemetry-set')).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parse('telemetry-set', [], { enabled: true, disabled: true }),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(await parse('git-install')).toEqual({ command: 'git-install', args: {}, write: true });
  });

  it.each(['release-install', 'release-restart'])(
    'requires explicit confirmation for %s',
    async (command) => {
      const { parse } = parser();
      const rest = command === 'release-install' ? ['1.2.3'] : [];
      await expect(parse(command, rest)).rejects.toMatchObject({ code: 'usage' });
      await expect(parse(command, rest, { confirm: 'true' })).rejects.toMatchObject({
        code: 'usage',
      });
      expect(await parse(command, rest, { confirm: true })).toEqual({
        command,
        args: { ...(rest.length ? { version: '1.2.3' } : {}), confirm: true },
        write: true,
      });
    },
  );
});

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTobPolicyOperations } from '../src/tob/cli-policy-operations.js';
import { parseAgentPolicies } from '../src/bots/cli-agent-policies.js';
import { createApprovalTemplateLibrary } from '../src/workspaces/approval-templates.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const close: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of close.splice(0)) await cleanup();
});

function fixture() {
  const root = createTempRoot('tob-policy-');
  const workspacePath = join(root, 'work');
  mkdirSync(workspacePath);
  let status = async () => 'ok' as const;
  const workspace = {
    id: 'workspace-one',
    title: 'Synthetic workspace',
    path: workspacePath,
    status: () => status(),
  };
  const core = createCore({
    dshHome: root,
    workspaces: () => ({
      list: () => [workspace],
      get: (id) => (id === workspace.id ? workspace : undefined),
    }),
  });
  expect(core.registry.create({ slug: 'research', displayName: 'Research' }).ok).toBe(true);
  core.channels.getOrCreateDm('research');
  const approvalTemplates = createApprovalTemplateLibrary(join(root, 'templates'));
  const bridge = createBridgeMethods({ ...core, approvalTemplates });
  const prepare = createTobPolicyOperations({
    bridge: () => bridge,
    registry: core.registry,
    grants: core.grants,
  });
  const args = (
    rest: string[],
    options: Record<string, unknown> = {},
    expectedState?: string,
    input?: string,
  ) => ({
    rest,
    options,
    ...(expectedState === undefined ? {} : { expectedState }),
    ...(input === undefined ? {} : { input }),
  });
  const read = async (command: string, rest = ['research']) => {
    const operation = (await prepare(command, args(rest)))!;
    return (await operation.run(() => {})) as {
      value: Record<string, unknown>;
      stateFingerprint: string;
    };
  };
  const write = async (
    command: string,
    options: Record<string, unknown>,
    expectedState: string,
    rest = ['research'],
  ) => {
    const operation = (await prepare(command, args(rest, options, expectedState)))!;
    expect(operation.proposal).toMatchObject({ command, requireHumanReview: true });
    return (await operation.run(() => {})) as {
      value: Record<string, unknown>;
      stateFingerprint: string;
    };
  };
  close.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    core,
    bridge,
    prepare,
    args,
    read,
    write,
    approvalTemplates,
    setStatus: (next: typeof status) => {
      status = next;
    },
  };
}

describe('Tob policy operations reuse canonical owners', () => {
  it('creates, grants write access and revokes a real Workspace grant with exact readback', async () => {
    const f = fixture();
    const before = await f.read('grants');
    const granted = await f.write(
      'grant-create',
      { workspace: 'workspace-one' },
      before.stateFingerprint,
    );
    const record = f.core.grants.list('research')[0]!;
    expect(granted.value.grants).toEqual([record]);
    const writable = await f.write(
      'grant-write-set',
      { grant: record.id, enabled: true },
      granted.stateFingerprint,
    );
    expect(f.core.grants.requireActive('research', record.id).orchestratorWrite).toBe(true);
    const revoked = await f.write(
      'grant-revoke',
      { grant: record.id, confirm: true },
      writable.stateFingerprint,
    );
    expect(revoked.value.grants).toEqual(f.core.grants.list('research'));
    expect(() => f.core.grants.requireActive('research', record.id)).toThrow();
    await expect(
      f.prepare(
        'grant-write-set',
        f.args(['research'], { grant: record.id, enabled: true }, writable.stateFingerprint),
      ),
    ).rejects.toThrow('stale-policy');
  });

  it('rechecks source authority after the Workspace availability await and before persistence', async () => {
    const f = fixture();
    const before = await f.read('grants');
    const operation = (await f.prepare(
      'grant-create',
      f.args(['research'], { workspace: 'workspace-one' }, before.stateFingerprint),
    ))!;
    let authorized = true;
    f.setStatus(async () => {
      authorized = false;
      return 'ok';
    });
    await expect(
      operation.run(() => {
        if (!authorized) throw new TobError('agent-context-expired');
      }),
    ).rejects.toThrow('agent-context-expired');
    expect(f.core.grants.list('research')).toEqual([]);
  });

  it('refuses a stale approved policy and checks revoked authority on the subsequent call', async () => {
    const f = fixture();
    const before = await f.read('access');
    const prepared = (await f.prepare(
      'browser-access-set',
      f.args(['research'], { enabled: true }, before.stateFingerprint),
    ))!;
    f.core.registry.setComputerAccess('research', true);
    await expect(prepared.run(() => {})).rejects.toThrow('stale-policy');
    expect(f.core.registry.get('research')!.browserAccess).not.toBe(true);
    const next = (await f.prepare('access', f.args(['research'])))!;
    await expect(
      next.run(() => {
        throw new TobError('agent-context-expired');
      }),
    ).rejects.toThrow('agent-context-expired');
  });

  it('requires explicit risk acknowledgement and changes access without launching a runtime', async () => {
    const f = fixture();
    const before = await f.read('access');
    await expect(
      f.prepare(
        'access-set',
        f.args(['research'], { mode: 'danger-full-access' }, before.stateFingerprint),
      ),
    ).rejects.toThrow('confirmation-required');
    const enabled = await f.write('browser-access-set', { enabled: true }, before.stateFingerprint);
    expect(enabled.value.browserAccess).toBe(true);
    const limited = await f.write(
      'access-set',
      { mode: 'workspace-write', scope: 'assignments' },
      enabled.stateFingerprint,
    );
    expect(limited.value.preset).toMatchObject({ mode: 'workspace-write', scope: 'chat' });
  });

  it('selects an existing Approval Template and detects concurrent library and selection edits', async () => {
    const f = fixture();
    const before = await f.read('approval-templates', []);
    const updated = await f.write('approval-template-set', {}, before.stateFingerprint, [
      'research',
      'cautious',
    ]);
    expect(f.core.registry.get('research')!.approvalTemplate).toBe('cautious');
    expect(updated.value.selections).toContainEqual({ slug: 'research', template: 'cautious' });
    const prepared = (await f.prepare(
      'approval-template-set',
      f.args(['research', 'off'], {}, updated.stateFingerprint),
    ))!;
    f.approvalTemplates.create('other', '# Changed policy');
    await expect(prepared.run(() => {})).rejects.toThrow('stale-policy');
    expect(f.core.registry.get('research')!.approvalTemplate).toBe('cautious');
    expect(
      await f.prepare('tool-approval-decide', {
        channelId: 'dm-research',
        messageId: 'card',
        outcome: 'allowed-once',
      }),
    ).toBeUndefined();
  });

  it('edits an existing failure-alert connector policy without sending externally', async () => {
    const f = fixture();
    const test = vi.spyOn(f.core.externalMessaging.failureAlerts, 'test');
    const before = await f.read('failure-alerts');
    const after = await f.write('failure-alerts-set', { disabled: true }, before.stateFingerprint);
    expect(after.value).toMatchObject({ failureAlerts: { enabled: false, revision: 1 } });
    const exact = await f.bridge.messagingSnapshot({ slug: 'research' });
    expect(exact).toEqual({ ok: true, value: after.value });
    expect(test).not.toHaveBeenCalled();
    expect(await f.prepare('failure-alerts-test', f.args(['research']))).toBeUndefined();
    expect(await f.prepare('messaging-send', f.args(['research']))).toBeUndefined();
  });

  it('keeps real Provider unavailability and never accepts credential setup over ordinary policy input', async () => {
    const f = fixture();
    const apps = await f.read('im-apps', []);
    expect(apps.value).toEqual({ apps: [], setups: [] });
    expect(
      await f.prepare('im-credentials', f.args(['attempt'], {}, undefined, 'private-value')),
    ).toBeUndefined();
    const state = await f.read('access');
    await expect(
      f.prepare('browser-access-set', {
        ...f.args(['research'], { enabled: true }, state.stateFingerprint),
        sessionId: 'forged',
      }),
    ).rejects.toThrow('invalid-input');
    await expect(
      f.prepare(
        'browser-access-set',
        f.args(
          ['research'],
          { enabled: true, credentials: 'private-value' },
          state.stateFingerprint,
        ),
      ),
    ).rejects.toThrow('invalid-input');
  });
});

describe('connector concurrency at the owner boundary', () => {
  it('refuses a connector change that races an internal CLI read after approval', async () => {
    const f = fixture();
    const before = await f.read('failure-alerts');
    const prepared = (await f.prepare(
      'failure-alerts-set',
      f.args(['research'], { disabled: true }, before.stateFingerprint),
    ))!;
    const original = f.bridge.messagingSnapshot.bind(f.bridge);
    let reads = 0;
    vi.spyOn(f.bridge, 'messagingSnapshot').mockImplementation(async (input) => {
      if (++reads === 2) f.core.externalMessaging.failureAlerts.set('research', false, 0);
      return original(input);
    });
    const mutation = vi.spyOn(f.bridge, 'failureAlertsSet');
    await expect(prepared.run(() => {})).rejects.toThrow('stale-policy');
    expect(mutation).not.toHaveBeenCalled();
    expect(await original({ slug: 'research' })).toMatchObject({
      value: { failureAlerts: { revision: 1 } },
    });
  });
});

describe('scoped policy CLI inputs', () => {
  it('carries only admitted arguments and stdin; refuses Human Host tokens and unreviewed writes', async () => {
    const readStdin = vi.fn(async () => '{"kind":"mute"}');
    const state = 'a'.repeat(64);
    expect(
      await parseAgentPolicies(
        'messaging-conversation',
        ['research'],
        { 'input-stdin': true, 'expected-state': state },
        { readStdin },
      ),
    ).toEqual({
      command: 'messaging-conversation',
      write: true,
      args: {
        rest: ['research'],
        options: { 'input-stdin': true },
        expectedState: state,
        input: '{"kind":"mute"}',
      },
    });
    await expect(
      parseAgentPolicies('grant-create', ['research'], { workspace: 'one' }, {}),
    ).rejects.toThrow();
    await expect(
      parseAgentPolicies('grants', ['research'], { 'token-file': '/private/token' }, {}),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
    await expect(
      parseAgentPolicies('access-set', ['research'], { mode: {}, 'expected-state': state }, {}),
    ).rejects.toThrow();
    expect(await parseAgentPolicies('tool-approval-decide', [], {}, {})).toBeUndefined();
  });
});

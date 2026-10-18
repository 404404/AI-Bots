import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTobMemoryEditOperations } from '../src/tob/cli-memory-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { TobError } from '../src/tob/service.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { PrepareTobOperation } from '../src/tob/cli-operations.js';
import type { DshWorkspace } from '../src/workspaces/grants.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function fixture() {
  let task: ((run: OrchestratorAgentRun) => Promise<void>) | undefined;
  let workspace: DshWorkspace | undefined;
  const core = createCore({
    dshHome: createTempRoot('tob-memory-edit-'),
    ensureTobWorkspace: async (path) =>
      (workspace = { id: 'tob-workspace', path, title: 'Tob', status: async () => 'ok' }),
    workspaces: () => ({
      get: (id) => (workspace?.id === id ? workspace : undefined),
      list: () => (workspace ? [workspace] : []),
    }),
    agents: {
      async runOrchestrator(run) {
        const action = task;
        task = undefined;
        await action?.(run);
      },
      async runAssignment() {},
      requestAssignment() {
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
  expect(
    core.registry.create({
      slug: 'alpha',
      displayName: 'Alpha',
      coreMemory: 'Original tea preference.\n',
    }).ok,
  ).toBe(true);
  expect(
    core.registry.create({
      slug: 'beta',
      displayName: 'Beta',
      coreMemory: 'Keep Beta unchanged.\n',
    }).ok,
  ).toBe(true);
  const bridge = createBridgeMethods({ ...core });
  async function human(
    action: (prepare: PrepareTobOperation, run: OrchestratorAgentRun) => Promise<void>,
  ) {
    let failure: unknown;
    task = async (run) => {
      try {
        await action(createTobMemoryEditOperations(core.runtime, core.memory, run.sessionId), run);
      } catch (error) {
        failure = error;
      }
    };
    expect(
      (
        await bridge.channelSend({
          channelId: tob.channelId,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Update the selected Bot Memory as reviewed.',
        })
      ).ok,
    ).toBe(true);
    await core.runtime.whenIdle();
    if (failure) throw failure;
  }
  const input = () => ({
    slug: 'alpha',
    path: 'MEMORY.md',
    body: 'Reviewed jasmine tea preference.\n',
    expectedHead: core.memory.snapshot('alpha').head!,
    editId: 'reviewed-edit-1',
  });
  return { core, tob, human, input };
}

describe('Tob reviewed Memory owner operations', () => {
  it('reads multiple Bots directly without per-Bot grants, write review or an Assignment', async () => {
    const f = await fixture();
    const before = ['alpha', 'beta'].map((slug) => f.core.memory.snapshot(slug));
    await f.human(async (prepare) => {
      for (const [index, slug] of ['alpha', 'beta'].entries()) {
        expect(f.core.grants.list(slug)).toEqual([]);
        const snapshot = (await prepare('memory-snapshot', { slug }))!;
        expect(snapshot.proposal).toBeUndefined();
        const observed = (await snapshot.run(() => {})) as { sha: string };
        const file = (await prepare('memory-file', {
          slug,
          sha: observed.sha,
          path: 'MEMORY.md',
        }))!;
        expect(file.proposal).toBeUndefined();
        const result = await file.run(() => {});
        expect(result).toMatchObject({ readOnly: true, contentRole: 'data' });
        expect(JSON.stringify(result)).toContain(
          index === 0 ? 'Original tea preference.' : 'Keep Beta unchanged.',
        );
      }
    });
    expect(['alpha', 'beta'].map((slug) => f.core.memory.snapshot(slug))).toEqual(before);
  });

  it('binds the exact target, diff, branch and HEAD, then reads the same commit on identical retry', async () => {
    const f = await fixture();
    const beta = f.core.memory.snapshot('beta');
    await f.human(async (prepare) => {
      const args = f.input();
      const operation = (await prepare('memory-save', args))!;
      expect(operation.proposal).toMatchObject({
        target: 'alpha',
        previousValue: {
          head: args.expectedHead,
          body: 'Original tea preference.\n',
          bot: { slug: 'alpha' },
        },
        patch: {
          path: args.path,
          body: args.body,
          expectedHead: args.expectedHead,
          editId: args.editId,
          botSlug: 'alpha',
          cleanRepositoryRequired: true,
        },
      });
      expect(JSON.stringify(operation.proposal)).toContain(
        '-Original tea preference.\\n+Reviewed jasmine tea preference.',
      );
      expect(Object.isFrozen(operation.proposal!.patch)).toBe(true);
      args.body = 'Attempted mutation of reviewed input';
      const effect = vi.fn();
      const saved = (await operation.run(() => {}, effect)) as {
        commit: { sha: string };
        promptEffect: string;
      };
      expect(effect).toHaveBeenCalledOnce();
      expect(saved.promptEffect).toContain('remains frozen');
      expect(f.core.memory.readAccepted('alpha', 'MEMORY.md')).toMatchObject({
        head: saved.commit.sha,
        body: 'Reviewed jasmine tea preference.\n',
      });
      const retryArgs = { ...args, body: 'Reviewed jasmine tea preference.\n' };
      const retry = (await prepare('memory-save', retryArgs))!;
      expect(retry.proposal).toBeUndefined();
      expect(await retry.run(() => {}, effect)).toMatchObject({
        commit: { sha: saved.commit.sha },
        replayed: true,
      });
      expect(effect).toHaveBeenCalledOnce();
      await expect(
        prepare('memory-save', { ...retryArgs, path: 'other.md' }),
      ).rejects.toMatchObject({ code: 'memory-conflict' });
      await expect(
        prepare('memory-save', { ...retryArgs, expectedHead: saved.commit.sha }),
      ).rejects.toMatchObject({ code: 'memory-conflict' });
      const read = (await prepare('memory-file', {
        slug: 'alpha',
        sha: saved.commit.sha,
        path: 'MEMORY.md',
      }))!;
      expect(await read.run(() => {})).toMatchObject({
        body: retryArgs.body,
        sha: saved.commit.sha,
        readOnly: true,
        contentRole: 'data',
      });
    });
    expect(f.core.memory.snapshot('beta')).toEqual(beta);
  });

  it.each(['head', 'dirty', 'branch', 'archived', 'revoked'] as const)(
    'refuses %s changes made during review and preserves independent work',
    async (kind) => {
      const f = await fixture();
      await f.human(async (prepare) => {
        const args = f.input();
        const operation = (await prepare('memory-save', args))!;
        const root = f.core.registry.memoryDirFor('alpha')!;
        if (kind === 'head')
          f.core.memory.saveHuman({
            ...args,
            botSlug: 'alpha',
            body: 'Independent edit.\n',
            editId: 'other-edit',
          });
        if (kind === 'dirty')
          writeFileSync(join(root, 'MEMORY.md'), 'Unfinished independent work.\n');
        if (kind === 'branch')
          execFileSync('git', ['switch', '-c', 'preserved-branch'], { cwd: root, stdio: 'pipe' });
        if (kind === 'archived') f.core.registry.setPaused('alpha', true);
        const before = readFileSync(join(root, 'MEMORY.md'), 'utf8');
        const effect = vi.fn();
        await expect(
          Promise.resolve().then(() =>
            operation.run(() => {
              if (kind === 'revoked') throw new TobError('approval-authority-changed');
            }, effect),
          ),
        ).rejects.toMatchObject({
          code:
            kind === 'archived'
              ? 'memory-target-unavailable'
              : kind === 'revoked'
                ? 'approval-authority-changed'
                : 'memory-conflict',
        });
        expect(effect).not.toHaveBeenCalled();
        expect(readFileSync(join(root, 'MEMORY.md'), 'utf8')).toBe(before);
      });
    },
  );

  it('pins Bot incarnation before review and allows an explicitly requested Tob self edit', async () => {
    const f = await fixture();
    await f.human(async (prepare) => {
      const initial = f.core.memory.snapshot(f.tob.botSlug).head!;
      await expect(
        prepare('memory-save', {
          slug: f.tob.botSlug,
          path: 'MEMORY.md',
          body: 'Do not bypass an unaccepted baseline.\n',
          expectedHead: initial,
          editId: 'unaccepted-self-edit',
        }),
      ).rejects.toMatchObject({ code: 'memory-conflict' });
      expect(f.core.memory.snapshot(f.tob.botSlug).head).toBe(initial);
    });
    await f.human(async (prepare) => {
      const operation = (await prepare('memory-save', f.input()))!;
      const original = f.core.registry.get.bind(f.core.registry);
      const spy = vi.spyOn(f.core.registry, 'get').mockImplementation((slug) => {
        const record = original(slug);
        return slug === 'alpha' && record
          ? { ...record, createdAt: 'replacement-incarnation' }
          : record;
      });
      expect(() => operation.run(() => {})).toThrow('memory-target-changed');
      spy.mockRestore();
      expect(f.core.memory.workingChanges(f.tob.botSlug)).toEqual([]);
      const self = (await prepare('memory-save', {
        slug: f.tob.botSlug,
        path: 'MEMORY.md',
        body: 'Human reviewed Tob memory.\n',
        expectedHead: f.core.memory.snapshot(f.tob.botSlug).head!,
        editId: 'tob-self-edit',
      }))!;
      expect(self.proposal?.target).toBe(f.tob.botSlug);
      await self.run(() => {});
      expect(f.core.memory.readAccepted(f.tob.botSlug, 'MEMORY.md')?.body).toBe(
        'Human reviewed Tob memory.\n',
      );
    });
  });

  it('keeps the owner-supported current branch when saving and restoring an idle target', async () => {
    const f = await fixture();
    await f.human(async (prepare) => {
      const input = f.input();
      const root = f.core.registry.memoryDirFor('alpha')!;
      execFileSync('git', ['switch', '-c', 'personal-memory'], { cwd: root, stdio: 'pipe' });
      const save = (await prepare('memory-save', input))!;
      expect(save.proposal).toMatchObject({
        previousValue: { branch: 'personal-memory', acceptedHead: null },
      });
      await save.run(() => {});
      const current = f.core.memory.snapshot('alpha').head!;
      const restore = (await prepare('memory-restore-commit', {
        slug: 'alpha',
        sha: input.expectedHead,
        expectedHead: current,
        restoreId: 'branch-restore',
      }))!;
      await restore.run(() => {});
      expect(f.core.memory.gitGraph('alpha').currentBranch).toBe('personal-memory');
      expect(f.core.memory.readAccepted('alpha', 'MEMORY.md')?.body).toBe(
        'Original tea preference.\n',
      );
    });
  });

  it('restores through a separately reviewed owner commit and refuses dirty or stale restore without reset', async () => {
    const f = await fixture();
    await f.human(async (prepare) => {
      const args = f.input();
      const save = (await prepare('memory-save', args))!;
      await save.run(() => {});
      const expectedHead = f.core.memory.snapshot('alpha').head!;
      const input = { slug: 'alpha', sha: args.expectedHead, expectedHead, restoreId: 'restore-1' };
      const restore = (await prepare('memory-restore-commit', input))!;
      expect(restore.proposal).toMatchObject({
        command: 'memory-restore-commit',
        previousValue: { head: expectedHead },
        patch: { sha: args.expectedHead, cleanRepositoryRequired: true },
      });
      const result = (await restore.run(() => {})) as { head: string };
      expect(result.head).not.toBe(args.expectedHead);
      expect(f.core.memory.readAccepted('alpha', 'MEMORY.md')?.body).toBe(
        'Original tea preference.\n',
      );
      expect(f.core.memory.history('alpha')[0]).toMatchObject({
        sha: result.head,
        parentSha: expectedHead,
      });
      await expect(prepare('memory-restore-commit', input)).rejects.toMatchObject({
        code: 'memory-conflict',
      });
      writeFileSync(
        join(f.core.registry.memoryDirFor('alpha')!, 'unfinished.md'),
        'Preserve untracked work.',
      );
      await expect(
        prepare('memory-restore-commit', {
          ...input,
          expectedHead: result.head,
          sha: expectedHead,
        }),
      ).rejects.toMatchObject({ code: 'memory-conflict' });
      expect(
        readFileSync(join(f.core.registry.memoryDirFor('alpha')!, 'unfinished.md'), 'utf8'),
      ).toBe('Preserve untracked work.');
    });
  });

  it('uses shipped scoped CLI parsing, reviews writes, denies without effect and requires stable edit identity', async () => {
    const f = await fixture();
    await f.human(async (prepare, run) => {
      let deny = true;
      const approve = vi.fn(async () => {
        if (deny) throw new TobError('approval-denied');
      });
      const broker = await startTobCliBroker({
        signal: new AbortController().signal,
        authorize: f.core.runtime.captureTobCliAuthority!(run.sessionId),
        prepareOperation: prepare,
        approve,
        readSetting: () => {
          throw Error('unexpected settings');
        },
        writeSetting: async () => {
          throw Error('unexpected settings write');
        },
      });
      closes.push(() => broker.close());
      const cli = async (argv: string[]) => {
        const output: string[] = [];
        const status = await runBotCreateCli(argv, {
          env: {
            DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint,
            DEEPSEEKBOT_AGENT_TOKEN: broker.token,
          },
          stdout: (text) => output.push(text),
          stderr: () => {},
          readStdin: async () => 'CLI reviewed memory.\n',
        });
        return { status, json: JSON.parse(output.join('\n')) };
      };
      const args = f.input();
      const argv = [
        'memory-save',
        'alpha',
        '--path',
        'MEMORY.md',
        '--body-stdin',
        '--expected-head',
        args.expectedHead,
        '--edit-id',
        'cli-edit-1',
      ];
      expect(await cli(argv.slice(0, -2))).toMatchObject({
        status: 2,
        json: { error: { code: 'usage' } },
      });
      expect(approve).not.toHaveBeenCalled();
      expect(await cli(argv)).toMatchObject({
        status: 1,
        json: { error: { code: 'approval-denied' } },
      });
      expect(f.core.memory.snapshot('alpha').head).toBe(args.expectedHead);
      deny = false;
      expect(await cli(argv)).toMatchObject({ status: 0 });
      expect(await cli(argv)).toMatchObject({ status: 0 });
      expect(approve).toHaveBeenCalledTimes(2);
      expect(f.core.memory.readAccepted('alpha', 'MEMORY.md')?.body).toBe('CLI reviewed memory.\n');
    });
  });
});

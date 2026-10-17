import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { backupJson, runBackupCommand } from '../src/bots/cli-backup.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createProfileBackupHttp } from '../src/portability/http.js';
import { inspectProfileBackup, restoreProfileBackup } from '../src/portability/package.js';
import { createTobBackupOperations } from '../src/tob/cli-backup-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { parseAgentBackup } from '../src/bots/cli-agent-backup.js';
const roots: string[] = [],
  cores: BotHarnessCore[] = [],
  servers: ReturnType<typeof createServer>[] = [];
const catalog = { list: async () => [], validate: async () => undefined };
const logs: string[] = [];
const brokerClosers: Array<() => Promise<void>> = [];
const route = { provider: 'deepseek', model: 'deepseek-chat' };
function root() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'bh-cli-backup-')));
  roots.push(path);
  return path;
}
function mount(home = root()) {
  const core = createCore({ dshHome: home });
  cores.push(core);
  return core;
}
function handler(core: BotHarnessCore) {
  return createProfileBackupHttp(
    {
      database: core.operationalDatabase,
      registry: core.registry,
      deletions: core.deletions,
      attachments: core.attachments,
      purge: core.contentPurge,
      version: 'test',
      dshVersion: '0.2.0-rc.2',
      sessionCount: () => core.ownership.list().length,
      log: (line) => logs.push(line),
    },
    root(),
    core.profileRecovery,
    catalog,
  );
}
afterEach(async () => {
  vi.useRealTimers();
  for (const close of brokerClosers.splice(0)) await close();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
  logs.splice(0);
});
async function live(http: (request: Request) => Promise<Response>) {
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith('/?token=')) {
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    calls.push(req.method + ' ' + req.url);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request('http://localhost' + req.url, {
      method: req.method!,
      ...(req.method === 'GET' ? {} : { body: new Uint8Array(Buffer.concat(chunks)) }),
    });
    const response = await http(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error();
  const url = `http://127.0.0.1:${address.port}`;
  const invoke = async (argv: string[]) => {
    const output: string[] = [],
      errors: string[] = [];
    const code = await runBotCreateCli(argv, {
      env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'host-private-token' },
      stdout: (line) => output.push(line),
      stderr: (line) => errors.push(line),
    });
    expect(output).toHaveLength(1);
    return { code, value: JSON.parse(output[0]!), output: output.join('') + errors.join('') };
  };
  return { invoke, calls };
}
function seed() {
  const core = mount();
  const created = core.registry.create({
    slug: 'keeper',
    displayName: 'Keeper',
    persona: 'PRIVATE_ARCHIVE_CONTENT',
  });
  expect(created.ok).toBe(true);
  core.registry.customizeModelPlan('keeper', route, 0);
  return core;
}
it('runs the direct CLI export, Host inspect, new-home restore and one-Bot recovery through the real owners', async () => {
  const core = seed(),
    source = await live(handler(core)),
    files = root(),
    plan = join(files, 'review.json'),
    archive = join(files, 'environment.botharness-backup');
  const preview = await source.invoke(['profile-backup-preview', '--out', plan]);
  expect(preview.code).toBe(0);
  expect(preview.value).toMatchObject({ bots: 1, planFile: plan });
  const token = JSON.parse(readFileSync(plan, 'utf8')).token;
  expect(preview.output).not.toContain(token);
  expect(statSync(plan).mode & 0o777).toBe(0o600);
  const exported = await source.invoke([
    'profile-backup-export',
    '--file',
    plan,
    '--out',
    archive,
    '--confirm',
  ]);
  expect(exported.code).toBe(0);
  expect(exported.output).not.toContain('PRIVATE_ARCHIVE_CONTENT');
  expect(exported.output).not.toContain(token);
  expect(statSync(archive).mode & 0o777).toBe(0o600);
  const inspected = await source.invoke(['profile-backup-inspect', '--file', archive]);
  expect(inspected.code).toBe(0);
  expect(inspected.value).toMatchObject({ sha256: exported.value.sha256, counts: { bots: 1 } });
  expect(inspected.value).not.toHaveProperty('manifest');
  expect(inspectProfileBackup(readFileSync(archive)).manifest.producer.dsh).toBe('0.2.0-rc.2');
  const restoredHome = join(files, 'new-home');
  await restoreProfileBackup(readFileSync(archive), restoredHome);
  const restored = mount(restoredHome),
    target = await live(handler(restored));
  expect(restored.registry.get('keeper')?.paused).toBe(true);
  expect((await target.invoke(['profile-recovery'])).value).toMatchObject({
    restored: true,
    bots: [{ slug: 'keeper', activated: false, reason: 'model-authorization-required' }],
  });
  expect(
    (
      await target.invoke([
        'profile-recovery-activate',
        'keeper',
        '--confirm',
        '--acknowledge-split-brain',
      ])
    ).value,
  ).toMatchObject({ error: { code: 'activation-required' } });
  expect((await target.invoke(['profile-recovery-authorize', 'keeper', '--confirm'])).code).toBe(0);
  const activated = await target.invoke([
    'profile-recovery-activate',
    'keeper',
    '--confirm',
    '--acknowledge-split-brain',
  ]);
  expect(activated.code).toBe(0);
  expect(activated.value.bots).toMatchObject([{ slug: 'keeper', activated: true }]);
  expect(() => restored.profileRecovery.requireExecution('keeper')).not.toThrow();
  expect(restored.registry.get('keeper')?.paused === true).toBe(false);
  expect(restored.ownership.resolve(activated.value.bots[0].sessionId)?.botSlug).toBe('keeper');
  expect(logs.join('')).not.toContain(token);
  expect(logs.join('')).not.toContain('PRIVATE_ARCHIVE_CONTENT');
});
it('preserves stale/corrupt owner refusals, removes failed output and never overwrites a protected file', async () => {
  const core = seed(),
    host = await live(handler(core)),
    files = root(),
    plan = join(files, 'review.json'),
    archive = join(files, 'environment.botharness-backup');
  await host.invoke(['profile-backup-preview', '--out', plan]);
  core.registry.update('keeper', { displayName: 'Changed' });
  const stale = await host.invoke([
    'profile-backup-export',
    '--file',
    plan,
    '--out',
    archive,
    '--confirm',
  ]);
  expect(stale.value).toMatchObject({ error: { code: 'preview-stale' } });
  expect(existsSync(archive)).toBe(false);
  writeFileSync(archive, 'corrupt');
  expect((await host.invoke(['profile-backup-inspect', '--file', archive])).value).toMatchObject({
    error: { code: 'package-invalid' },
  });
  expect((await host.invoke(['profile-backup-preview', '--out', archive])).value).toMatchObject({
    error: { code: 'destination-exists' },
  });
  expect(readFileSync(archive, 'utf8')).toBe('corrupt');
});
it('rejects symlink/wide review plans, missing acknowledgements and mismatched Host plans before effects', async () => {
  const core = seed(),
    host = await live(handler(core)),
    files = root(),
    plan = join(files, 'review.json'),
    out = join(files, 'archive');
  await host.invoke(['profile-backup-preview', '--out', plan]);
  const calls = host.calls.length;
  chmodSync(plan, 0o644);
  expect(
    (await host.invoke(['profile-backup-export', '--file', plan, '--out', out, '--confirm'])).code,
  ).toBe(1);
  chmodSync(plan, 0o600);
  const link = join(files, 'link');
  symlinkSync(plan, link);
  expect(
    (await host.invoke(['profile-backup-export', '--file', link, '--out', out, '--confirm'])).code,
  ).toBe(1);
  expect(
    (await host.invoke(['profile-recovery-activate', 'keeper', '--confirm'])).value,
  ).toMatchObject({ error: { code: 'usage' } });
  expect(host.calls).toHaveLength(calls);
  const other = await live(handler(core));
  expect(
    (await other.invoke(['profile-backup-export', '--file', plan, '--out', out, '--confirm']))
      .value,
  ).toMatchObject({ error: { code: 'protected-file-invalid' } });
});
it('keeps scoped preview tokens Host-local and exports/inspects only through protected receipts after review', async () => {
  const core = seed(),
    http = handler(core),
    files = root(),
    prepare = createTobBackupOperations({
      http,
      root: join(files, 'protected'),
      registry: core.registry,
    });
  const guard = vi.fn(),
    effect = vi.fn();
  const preview = await prepare('profile-backup-preview', {}),
    view = (await preview!.run(guard)) as { planId: string };
  expect(view).not.toHaveProperty('token');
  const operation = await prepare('profile-backup-export', { planId: view.planId, confirm: true });
  expect(operation?.proposal).toMatchObject({ target: 'Profile', patch: { export: true } });
  expect(JSON.stringify(operation?.proposal)).not.toContain('token');
  const receipt = (await operation!.run(guard, effect)) as {
    receiptId: string;
    archiveFile: string;
    sha256: string;
  };
  expect(effect).toHaveBeenCalledOnce();
  expect(statSync(receipt.archiveFile).mode & 0o777).toBe(0o600);
  const inspection = await prepare('profile-backup-inspect', { receiptId: receipt.receiptId });
  expect(await inspection!.run(guard)).toMatchObject({
    sha256: receipt.sha256,
    counts: { bots: 1 },
  });
  expect(receipt.receiptId).toBe(view.planId);
  const replay = await prepare('profile-backup-export', { planId: view.planId, confirm: true });
  expect(replay?.proposal).toBeUndefined();
  expect(await replay!.run(guard)).toMatchObject({ ...receipt, reconciled: true });
  const reconnected = createTobBackupOperations({
    http,
    root: join(files, 'protected'),
    registry: core.registry,
  });
  const afterRestart = await reconnected('profile-backup-export', {
    planId: view.planId,
    confirm: true,
  });
  expect(afterRestart?.proposal).toBeUndefined();
  expect(await afterRestart!.run(guard)).toMatchObject({ ...receipt, reconciled: true });
  expect(readdirSync(join(files, 'protected'))).toEqual([view.planId + '.botharness-backup']);
  // A completed filename is not proof that the retained package is still intact.
  writeFileSync(receipt.archiveFile, Buffer.alloc(0));
  const corrupted = await reconnected('profile-backup-export', {
    planId: view.planId,
    confirm: true,
  });
  expect(corrupted?.proposal).toBeUndefined();
  await expect(corrupted!.run(guard)).rejects.toMatchObject({ code: 'package-invalid' });
  const rebuilt = createTobBackupOperations({
    http,
    root: join(files, 'protected'),
    registry: core.registry,
  });
  const corruptedAfterRestart = await rebuilt('profile-backup-export', {
    planId: view.planId,
    confirm: true,
  });
  await expect(corruptedAfterRestart!.run(guard)).rejects.toMatchObject({
    code: 'package-invalid',
  });
  expect(readdirSync(join(files, 'protected'))).toEqual([view.planId + '.botharness-backup']);
  expect(effect).toHaveBeenCalledOnce();

  expect(JSON.stringify([view, operation?.proposal, receipt])).not.toContain(
    'PRIVATE_ARCHIVE_CONTENT',
  );
});
it('rechecks scope and stale preview after Human review before exporting', async () => {
  const core = seed(),
    prepare = createTobBackupOperations({
      http: handler(core),
      root: root(),
      registry: core.registry,
    });
  const view = (await (await prepare('profile-backup-preview', {}))!.run(() => {})) as {
    planId: string;
  };
  const exportOp = await prepare('profile-backup-export', { planId: view.planId, confirm: true });
  const before = vi.fn();
  await expect(
    exportOp!.run(() => {
      throw new Error('expired authority');
    }, before),
  ).rejects.toThrow('expired authority');
  expect(before).not.toHaveBeenCalled();
  core.registry.update('keeper', { displayName: 'Independent change' });
  await expect(exportOp!.run(() => {}, before)).rejects.toMatchObject({ code: 'preview-stale' });
});
it('requires explicit scoped model authorization/activation review and refuses Model Plan drift during review', async () => {
  const core = seed(),
    host = await live(handler(core)),
    dir = root(),
    plan = join(dir, 'review'),
    archive = join(dir, 'archive');
  await host.invoke(['profile-backup-preview', '--out', plan]);
  await host.invoke(['profile-backup-export', '--file', plan, '--out', archive, '--confirm']);
  const home = join(dir, 'restored');
  await restoreProfileBackup(readFileSync(archive), home);
  const restored = mount(home),
    prepare = createTobBackupOperations({
      http: handler(restored),
      root: root(),
      registry: restored.registry,
    });
  await expect(prepare('profile-recovery-authorize', { slug: 'keeper' })).rejects.toMatchObject({
    code: 'confirmation-required',
  });
  const auth = await prepare('profile-recovery-authorize', { slug: 'keeper', confirm: true });
  expect(auth?.proposal?.target).toBe('keeper');
  const current = restored.registry.get('keeper')!.modelPlan!;
  restored.registry.customizeModelPlan('keeper', { ...route, model: 'drifted' }, current.revision);
  const before = vi.fn();
  await expect(auth!.run(() => {}, before)).rejects.toMatchObject({ code: 'stale-setting' });
  expect(before).not.toHaveBeenCalled();
  await expect(
    prepare('profile-recovery-activate', { slug: 'keeper', confirm: true }),
  ).rejects.toMatchObject({ code: 'activation-required' });
  const fresh = await prepare('profile-recovery-authorize', { slug: 'keeper', confirm: true });
  await fresh!.run(() => {});
  const activation = await prepare('profile-recovery-activate', {
    slug: 'keeper',
    confirm: true,
    acknowledgeSplitBrain: true,
  });
  await activation!.run(() => {});
  expect(restored.registry.get('keeper')?.paused === true).toBe(false);
});
it('does not admit arbitrary archive paths, tokens or output destinations in scoped CLI parsing', () => {
  for (const flag of ['file', 'out', 'token-file', 'host'])
    expect(() =>
      parseAgentBackup('profile-backup-export', [], { [flag]: '/private/input', confirm: true }),
    ).toThrow('protected Host');
  expect(
    parseAgentBackup('profile-backup-export', [], {
      plan: '00000000-0000-0000-0000-000000000000',
      confirm: true,
    }),
  ).toMatchObject({
    write: true,
    args: { planId: '00000000-0000-0000-0000-000000000000', confirm: true },
  });
});

it('removes an interrupted or digest-mismatched download and sanitizes unknown owner errors', async () => {
  const files = root(),
    plan = join(files, 'review'),
    out = join(files, 'archive'),
    token = '00000000-0000-0000-0000-000000000000';
  writeFileSync(plan, JSON.stringify({ origin: 'http://127.0.0.1:1234', token }), { mode: 0o600 });
  const io = {
    env: { DEEPSEEKBOT_HOST: 'http://127.0.0.1:1234' },
    stdout: () => {},
    stderr: () => {},
  };
  await expect(
    runBackupCommand(
      'profile-backup-export',
      [],
      { file: plan, out, confirm: true },
      io,
      async () => ({
        stream: async () =>
          new Response('truncated bytes', { headers: { 'x-backup-sha256': 'wrong-digest' } }),
      }),
    ),
  ).rejects.toMatchObject({ code: 'package-invalid' });
  expect(existsSync(out)).toBe(false);
  await expect(
    backupJson(Response.json({ error: { code: token, message: token } }, { status: 400 })),
  ).rejects.toMatchObject({ code: 'host-refused' });
  await expect(
    backupJson(new Response('expired authority', { status: 401 })),
  ).rejects.toMatchObject({ code: 'host-unauthorized' });
});

async function restoredSeed() {
  const core = seed(),
    http = handler(core);
  const preview = await (
    await http(new Request('http://host/api/botharness/profile-backup'))
  ).json();
  const response = await http(
    new Request('http://host/api/botharness/profile-backup', {
      method: 'POST',
      body: JSON.stringify({ token: preview.token }),
    }),
  );
  expect(response.ok).toBe(true);
  const home = join(root(), 'restored');
  await restoreProfileBackup(Buffer.from(await response.arrayBuffer()), home);
  return mount(home);
}
it.each(['authorize', 'activate'] as const)(
  'binds reviewed revision through the async HTTP boundary before %s owner capture',
  async (action) => {
    const restored = await restoredSeed();
    if (action === 'activate') await restored.profileRecovery.authorizeModel('keeper', catalog);
    const http = handler(restored);
    const prepare = createTobBackupOperations({
      root: root(),
      registry: restored.registry,
      http: async (request, guard) => {
        if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/' + action)) {
          const current = restored.registry.get('keeper')!.modelPlan!;
          restored.registry.customizeModelPlan(
            'keeper',
            { ...route, model: 'independent-later-plan' },
            current.revision,
          );
        }
        return http(request, guard);
      },
    });
    const operation = await prepare('profile-recovery-' + action, {
      slug: 'keeper',
      confirm: true,
      ...(action === 'activate' ? { acknowledgeSplitBrain: true } : {}),
    });
    const sessions = restored.ownership.list();
    await expect(operation!.run(() => {})).rejects.toMatchObject({ code: 'plan-changed' });
    expect(restored.ownership.list()).toEqual(sessions);
    expect((await restored.profileRecovery.status(catalog)).bots[0]?.reason).toBe(
      'model-authorization-required',
    );
    expect(restored.registry.get('keeper')?.paused).toBe(true);
  },
);
it('binds activation recovery state and current authority at the owner commit after model validation', async () => {
  const restored = await restoredSeed();
  await restored.profileRecovery.authorizeModel('keeper', catalog);
  const observed = (await restored.profileRecovery.status(catalog)).bots[0]!;
  const sessions = restored.ownership.list();
  restored.registry.setPaused('keeper', false);
  expect(() =>
    restored.profileRecovery.activate('keeper', true, {
      planRevision: observed.planRevision,
      stateFingerprint: observed.stateFingerprint,
    }),
  ).toThrowError(expect.objectContaining({ code: 'plan-changed' }));
  expect(restored.ownership.list()).toEqual(sessions);
  let authorized = true;
  const fresh = await restoredSeed();
  const now = (await fresh.profileRecovery.status(catalog)).bots[0]!;
  await expect(
    fresh.profileRecovery.authorizeModel(
      'keeper',
      {
        list: catalog.list,
        validate: async () => {
          authorized = false;
        },
      },
      { planRevision: now.planRevision, stateFingerprint: now.stateFingerprint },
      () => {
        if (!authorized) throw new TobError('agent-context-expired');
      },
    ),
  ).rejects.toMatchObject({ code: 'agent-context-expired' });
  expect((await fresh.profileRecovery.status(catalog)).bots[0]?.reason).toBe(
    'model-authorization-required',
  );
});
it.each(['preview-stale', 'too-large', 'package-invalid', 'plan-changed'])(
  'preserves scoped backup owner refusal %s through the actual broker and CLI',
  async (code) => {
    const core = seed();
    const prepare = createTobBackupOperations({
      root: root(),
      registry: core.registry,
      http: async (request) =>
        request.method === 'POST'
          ? Response.json({ error: { code } }, { status: 400 })
          : Response.json({
              token: '00000000-0000-0000-0000-000000000000',
              bots: 1,
              files: 1,
              estimatedBytes: 10,
              sessions: 'unsupported',
            }),
    });
    const broker = await startTobCliBroker({
      signal: new AbortController().signal,
      authorize() {},
      readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
      writeSetting: async () => ({ scope: 'global', value: 8, revision: 0 }),
      prepareOperation: prepare,
      approve: async () => {},
    });
    brokerClosers.push(broker.close);
    const invoke = async (argv: string[]) => {
      const output: string[] = [];
      await runBotCreateCli(argv, {
        env: { DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint, DEEPSEEKBOT_AGENT_TOKEN: broker.token },
        stdout: (value) => output.push(value),
        stderr() {},
      });
      expect(output).toHaveLength(1);
      return JSON.parse(output[0]!);
    };
    const preview = await invoke(['profile-backup-preview']);
    expect(
      await invoke(['profile-backup-export', '--plan', preview.planId, '--confirm']),
    ).toMatchObject({ error: { code } });
  },
);
it.each([false, true])(
  'publishes only fully hashed sibling staging bytes and preserves a concurrent destination (race=%s)',
  async (race) => {
    const files = root(),
      plan = join(files, 'plan'),
      out = join(files, 'archive');
    writeFileSync(
      plan,
      JSON.stringify({
        origin: 'http://127.0.0.1:1234',
        token: '00000000-0000-0000-0000-000000000000',
      }),
      { mode: 0o600 },
    );
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const bytes = Buffer.from('first chunk followed by verified complete bytes');
    const { createHash } = await import('node:crypto');
    const running = runBackupCommand(
      'profile-backup-export',
      [],
      { file: plan, out, confirm: true },
      { env: { DEEPSEEKBOT_HOST: 'http://127.0.0.1:1234' }, stdout() {}, stderr() {} },
      async () => ({
        stream: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(value) {
                controller = value;
                value.enqueue(bytes.subarray(0, 11));
              },
            }),
            { headers: { 'x-backup-sha256': createHash('sha256').update(bytes).digest('hex') } },
          ),
      }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(existsSync(out)).toBe(false);
    const stage = readdirSync(files).find((name) => name.endsWith('.part'))!;
    expect(stage).toBeTruthy();
    expect(statSync(join(files, stage)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(files, stage))).toEqual(bytes.subarray(0, 11));
    if (race) writeFileSync(out, 'independent verified file', { flag: 'wx' });
    controller!.enqueue(bytes.subarray(11));
    controller!.close();
    if (race) {
      await expect(running).rejects.toMatchObject({ code: 'destination-exists' });
      expect(readFileSync(out, 'utf8')).toBe('independent verified file');
    } else {
      expect(await running).toMatchObject({ state: 'exported', bytes: bytes.length });
      expect(readFileSync(out)).toEqual(bytes);
    }
    expect(readdirSync(files).some((name) => name.endsWith('.part'))).toBe(false);
  },
);

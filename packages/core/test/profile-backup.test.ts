import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  validateOperationalSnapshot,
  withOperationalBackup,
} from '../src/database/owner.js';
import {
  exportProfileBackup,
  profileBackupReviewScope,
  inspectProfileBackup,
  restoreProfileBackup,
  type ProfileBackupSource,
} from '../src/portability/package.js';
import { physicalDirectory } from '../src/portability/files.js';
import { writeZip } from '../src/bots/zip-archive.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { selectAssignmentRoute, type ModelRoute } from '../src/models/presets.js';
import { createModelRouteReadiness } from '../src/models/readiness.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createDeviceGateway, DEVICE_GATEWAY_PREFIX } from '../src/devices/gateway.js';
import { createSecretMcpStore } from '../src/credentials/secret-mcp-store.js';
import { createProfileBackupHttp, PROFILE_BACKUP_PATH } from '../src/portability/http.js';

const roots: string[] = [];
const cores: BotHarnessCore[] = [];
const route = { provider: 'deepseek', model: 'deepseek-chat' };
const catalog: ModelCatalog = { list: async () => [], validate: async () => undefined };
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function root() {
  const value = realpathSync(mkdtempSync(join(tmpdir(), 'bh-profile-backup-')));
  roots.push(value);
  return value;
}
function mount(home = root()) {
  const core = createCore({ dshHome: home });
  cores.push(core);
  expect(core.operationalDatabase.mode).toBe('ready');
  return core;
}
function source(core: BotHarnessCore): ProfileBackupSource {
  return {
    database: core.operationalDatabase,
    registry: core.registry,
    deletions: core.deletions,
    attachments: core.attachments,
    purge: core.contentPurge,
    version: 'test',
    dshVersion: '0.2.0-rc.1',
    sessionCount: () => core.ownership.list().length,
  };
}
async function scene() {
  const home = root();
  const core = mount(home);
  const custom = join(root(), 'custom-memory');
  expect(
    core.registry.create({
      slug: 'keeper',
      displayName: 'Keeper',
      persona: 'Synthetic Soul',
      memoryDir: custom,
    }).ok,
  ).toBe(true);
  expect(core.registry.create({ slug: 'deleted-retained', displayName: 'Retained' }).ok).toBe(true);
  expect(core.registry.create({ slug: 'deleted-erased', displayName: 'Erased' }).ok).toBe(true);
  const preset = core.modelPresets.create({
    name: 'Reusable',
    orchestrator: route,
    assignmentDefault: route,
  });
  core.registry.applyModelPreset('keeper', preset);
  core.registry.customizeModelPlan('keeper', { ...route, model: 'independent-model' }, 1);
  core.modelPresets.update(preset.id, {
    name: 'Reusable edited later',
    expectedRevision: preset.revision,
    orchestrator: route,
    assignmentDefault: route,
  });
  core.registry.setComputerAccess('keeper', true);
  core.registry.setBrowserAccess('keeper', true);
  core.ownership.claim({
    sessionId: 'old-orchestrator',
    botSlug: 'keeper',
    rootRole: 'orchestrator',
    at: '2026-10-08T00:00:00Z',
  });
  const retained = core.deletions.preview('deleted-retained');
  await core.deletions.confirm(retained.slug, retained.token, false);
  const erased = core.deletions.preview('deleted-erased');
  expect(erased.eraseAvailable).toBe(true);
  await core.deletions.confirm(erased.slug, erased.token, true);
  const channel = core.channels.createGroup({ name: 'Synthetic history', members: [] });
  const file = await core.attachments.upload({
    name: 'editable.txt',
    data: (async function* () {
      yield Buffer.from('original');
    })(),
  });
  await core.channels.appendMessage(channel.id, {
    id: 'kept',
    at: '2026-10-08T00:00:00Z',
    body: 'Sensitive synthetic history',
    author: { kind: 'human' },
    attachments: [file],
  });
  writeFileSync(core.attachments.fileTarget(file.fileId!).path, 'current editable bytes');
  await core.channels.appendMessage(channel.id, {
    id: 'purged',
    at: '2026-10-08T00:00:01Z',
    body: 'Synthetic erased body',
    author: { kind: 'human' },
  });
  core.channels.deleteGroup(channel.id);
  const selected = core.contentPurge
    .sources(channel.id)
    .sources.find((item) => item.messageId === 'purged')!;
  const preview = core.contentPurge.preview(channel.id, [selected.sourceEventId]);
  core.contentPurge.confirm(channel.id, [selected.sourceEventId], preview.token);
  return { core, home, custom, file, channel };
}

it('refuses a managed path reached through a symlink while canonical roots export', () => {
  const target = root();
  const child = join(target, 'child');
  mkdirSync(child);
  const link = join(root(), 'linked-home');
  try {
    symlinkSync(target, link);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EPERM') return;
    throw error;
  }
  expect(physicalDirectory(child)).toBe(realpathSync(child));
  expect(() => physicalDirectory(join(link, 'child'))).toThrowError(
    expect.objectContaining({ code: 'snapshot-changed' }),
  );
});

it('round trips the complete core, custom/deleted Memory, editable attachment identity, real purge checkpoint and independent plans across cold restart', async () => {
  const { core, file, channel } = await scene();
  const parent = root();
  const packagePath = join(parent, 'complete.botharness-backup');
  const originalPlan = core.registry.get('keeper')!.modelPlan;
  const templates = core.modelPresets.list();
  const receipt = await exportProfileBackup(source(core), packagePath);
  expect(receipt.bytes).toBe(readFileSync(packagePath).length);
  expect(receipt.manifest.purge.facts).toHaveLength(1);
  expect(
    receipt.manifest.memories.find((repo) => repo.slug === 'deleted-erased')?.disposition,
  ).toBe('erased');
  const destination = join(parent, 'restored');
  await restoreProfileBackup(readFileSync(packagePath), destination);
  let restored = mount(destination);
  expect(restored.modelPresets.list()).toEqual(templates);
  expect(restored.registry.get('keeper')?.modelPlan).toEqual(originalPlan);
  expect(restored.registry.get('keeper')).toMatchObject({
    paused: true,
    browserAccess: false,
    computerAccess: false,
    workspaces: [],
  });
  expect(
    readFileSync(join(restored.registry.memoryDirFor('keeper')!, 'SOUL.md'), 'utf8'),
  ).toContain('Synthetic Soul');
  expect(readFileSync(restored.attachments.fileTarget(file.fileId!).path, 'utf8')).toBe(
    'current editable bytes',
  );
  expect(restored.contentPurge.checkpoint().facts).toHaveLength(1);
  expect(restored.channels.message(channel.id, 'purged')?.body).toBe('');
  expect(restored.channels.message(channel.id, 'kept')?.body).toBe('Sensitive synthetic history');
  expect(restored.ownership.resolve('old-orchestrator')?.botSlug).toBe('keeper');
  expect(restored.ownership.contentAvailable('old-orchestrator')).toBe(false);
  expect(() => restored.profileRecovery.requireExecution('keeper')).toThrow('explicitly activate');
  expect(() => restored.profileRecovery.activate('keeper', true)).toThrow();
  await restored.profileRecovery.authorizeModel('keeper', catalog);
  expect(() => restored.profileRecovery.activate('keeper', false)).toThrow();
  const fresh = restored.profileRecovery.activate('keeper', true);
  expect(fresh).not.toBe('old-orchestrator');
  expect(restored.ownership.contentAvailable(fresh)).toBe(true);
  expect(() => restored.profileRecovery.requireExecution('keeper')).not.toThrow();
  restored.schedules.close();
  await restored.runtime.close();
  restored.operationalDatabase.close();
  restored = mount(destination);
  expect(restored.profileRecovery.activate('keeper', true)).toBe(fresh);
  expect(restored.registry.getHistorical('deleted-retained')).toBeDefined();
  expect(restored.deletions.get('deleted-retained')?.memoryDir).toContain(destination);
  expect(
    restored.registry.create({ slug: 'new-after-restore', displayName: 'New identity' }).ok,
  ).toBe(true);
  expect(() => restored.profileRecovery.requireExecution('new-after-restore')).not.toThrow();
  expect((await restored.profileRecovery.status(catalog)).bots.map((bot) => bot.slug)).toEqual([
    'keeper',
  ]);
});

it('preserves independent model snapshots, Assignment choices and template revisions without importing credentials or falling back after restore', async () => {
  const home = root();
  const core = mount(home);
  for (const slug of ['customized', 'applied'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const reasoning = { ...route, model: 'reasoner', reasoningEffort: 'high' };
  const choices = [
    { ...route, allowedEfforts: [''], defaultEffort: '' },
    {
      provider: reasoning.provider,
      model: reasoning.model,
      allowedEfforts: ['low', 'high'],
      defaultEffort: 'high',
      note: 'Use for hard debugging',
    },
  ];
  const template = core.modelPresets.create({
    name: 'Shared template',
    orchestrator: route,
    assignmentDefault: reasoning,
    assignmentModels: choices,
  });
  for (const slug of ['customized', 'applied'])
    expect(core.registry.applyModelPreset(slug, template).ok).toBe(true);
  expect(core.registry.customizeModelPlan('customized', reasoning, 1).ok).toBe(true);
  expect(core.registry.setAssignmentModels('customized', route, choices, 2).ok).toBe(true);
  const editedTemplate = core.modelPresets.update(template.id, {
    expectedRevision: template.revision,
    name: 'Edited after applying',
    orchestrator: { ...route, model: 'template-only-model' },
    assignmentDefault: route,
    assignmentModels: [choices[0]!],
  });
  expect(editedTemplate?.revision).toBe(2);
  const customized = core.registry.get('customized')!.modelPlan!;
  const applied = core.registry.get('applied')!.modelPlan!;
  expect(customized).toMatchObject({ revision: 3, sourcePresetId: '', assignmentDefault: route });
  expect(applied).toMatchObject({
    revision: 1,
    sourcePresetId: template.id,
    sourcePresetName: template.name,
    assignmentDefault: reasoning,
  });
  const credential = 'SYNTHETIC-EXCLUDED-PROFILE-CREDENTIAL';
  writeFileSync(join(home, '.credentials.yaml'), 'deepseek: ' + credential);
  const path = join(root(), 'model-plans.botharness-backup');
  await exportProfileBackup(source(core), path);
  const archive = readFileSync(path);
  const inspected = inspectProfileBackup(archive);
  expect(inspected.entries.some((entry) => entry.data.includes(Buffer.from(credential)))).toBe(
    false,
  );
  expect(inspected.manifest.dependencies).toContainEqual({
    kind: 'model',
    scope: 'customized/assignment-option',
    reference: JSON.stringify(choices[1]),
    required: false,
    contract: 'assignment-model-option/1',
  });
  const destination = join(root(), 'restored');
  await restoreProfileBackup(archive, destination);
  expect(existsSync(join(destination, '.credentials.yaml'))).toBe(false);
  let restored = mount(destination);
  expect(restored.modelPresets.list()).toEqual([editedTemplate]);
  const restoredCustomized = restored.registry.get('customized')!.modelPlan!;
  const restoredApplied = restored.registry.get('applied')!.modelPlan!;
  expect(restoredCustomized).toEqual(customized);
  expect(restoredApplied).toEqual(applied);
  const validated: ModelRoute[] = [];
  let available = false;
  const targetCatalog: ModelCatalog = {
    list: async () => [],
    validate: async (selected) => {
      validated.push(selected);
      if (!available) throw new Error('Target provider, model or credential is unavailable');
    },
  };
  await expect(
    restored.profileRecovery.authorizeModel('customized', targetCatalog),
  ).rejects.toThrow('unavailable');
  expect(() => restored.profileRecovery.activate('customized', true)).toThrow();
  available = true;
  await restored.profileRecovery.authorizeModel('customized', targetCatalog);
  restored.profileRecovery.activate('customized', true);
  const readiness = createModelRouteReadiness(restored.registry, targetCatalog);
  expect(selectAssignmentRoute(restoredCustomized)).toEqual(route);
  expect(selectAssignmentRoute(restoredApplied)).toEqual(reasoning);
  const selected = selectAssignmentRoute(restoredCustomized, {
    provider: reasoning.provider,
    model: reasoning.model,
  });
  await readiness.prepare('customized', 'assignment', selected);
  expect(validated.at(-1)).toEqual(reasoning);
  expect(() =>
    selectAssignmentRoute(restoredCustomized, { ...route, model: 'outside-allowlist' }),
  ).toThrow('not allowed');
  expect(() =>
    selectAssignmentRoute(restoredCustomized, { ...reasoning, reasoningEffort: 'medium' }),
  ).toThrow('not allowed');
  available = false;
  const attempts = validated.length;
  await expect(readiness.prepare('customized', 'assignment', selected)).rejects.toThrow(
    'unavailable',
  );
  expect(validated.slice(attempts)).toEqual([reasoning]);
  restored.modelPresets.update(template.id, {
    expectedRevision: editedTemplate!.revision,
    name: 'Target-local template edit',
    orchestrator: route,
    assignmentDefault: route,
    assignmentModels: [choices[0]!],
  });
  restored.schedules.close();
  await restored.runtime.close();
  restored.operationalDatabase.close();
  restored = mount(destination);
  expect(restored.modelPresets.get(template.id)?.revision).toBe(3);
  expect(restored.registry.get('customized')?.modelPlan).toEqual(customized);
  expect(restored.registry.get('applied')?.modelPlan).toEqual(applied);
  expect(() => restored.profileRecovery.requireExecution('customized')).not.toThrow();
  expect(() => restored.profileRecovery.requireExecution('applied')).toThrow();
});

it('suspends a real provider grant and preserves issued Outbox uncertainty without replay across restore', async () => {
  const core = mount();
  expect(core.registry.create({ slug: 'keeper', displayName: 'Keeper' }).ok).toBe(true);
  core.registry.applyModelPreset(
    'keeper',
    core.modelPresets.create({
      name: 'Explicit route',
      orchestrator: route,
      assignmentDefault: route,
    }),
  );
  let sends = 0;
  let settle!: (value: { accepted: true }) => void;
  let entered!: () => void;
  const issuing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const effect = new Promise<{ accepted: true }>((resolve) => {
    settle = resolve;
  });
  const account = {
    ref: 'account',
    platform: 'test',
    name: 'Synthetic account',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = { ref: 'self', name: 'Synthetic target', digest: 'b'.repeat(64) };
  const provider: MessagingProvider = {
    id: 'test-provider',
    accounts: async () => [account],
    targets: async () => [target],
    inspect: async () => ({ account, target }),
    send: async () => {
      sends++;
      entered();
      return effect;
    },
  };
  core.externalMessaging.register(provider);
  const grant = await core.externalMessaging.authorize({
    botSlug: 'keeper',
    providerId: provider.id,
    accountRef: account.ref,
    targetRef: target.ref,
    fingerprint: account.fingerprint,
    targetDigest: target.digest,
  });
  const sending = core.externalMessaging.send(
    'keeper',
    grant.id,
    'issued-request',
    'Synthetic issued effect',
  );
  await issuing;
  const path = join(root(), 'in-flight.botharness-backup');
  await exportProfileBackup(source(core), path);
  settle({ accepted: true });
  await sending;
  const destination = join(root(), 'restored');
  await restoreProfileBackup(readFileSync(path), destination);
  const restored = mount(destination);
  restored.externalMessaging.register(provider);
  expect(restored.registry.get('keeper')?.paused).toBe(true);
  expect((await restored.externalMessaging.snapshot('keeper')).grants[0]?.suspendedReason).toBe(
    'rebind-required',
  );
  await restored.profileRecovery.authorizeModel('keeper', catalog);
  restored.profileRecovery.activate('keeper', true);
  const snapshot = await restored.externalMessaging.snapshot('keeper');
  expect(snapshot.grants[0]).toMatchObject({
    suspendedReason: 'rebind-required',
    availability: 'unavailable',
  });
  expect(snapshot.intents[0]).toMatchObject({
    state: 'unknown-outcome',
    reason: 'disaster-restore-no-replay',
  });
  expect(sends).toBe(1);
  await expect(
    restored.externalMessaging.send(
      'keeper',
      grant.id,
      'new-after-restore',
      'Must remain suspended',
    ),
  ).rejects.toThrow();
  expect(sends).toBe(1);
});

it('keeps existing output and releases the Backup Barrier after mutable-file failure, space refusal and cancellation', async () => {
  const { core, custom } = await scene();
  const parent = root();
  const target = join(parent, 'complete.botharness-backup');
  await expect(
    exportProfileBackup(source(core), target, { availableBytes: () => 0 }),
  ).rejects.toMatchObject({ code: 'disk-space-insufficient' });
  expect(existsSync(target)).toBe(false);
  await expect(
    exportProfileBackup(source(core), target, {
      captured: () => writeFileSync(join(custom, 'SOUL.md'), 'changed while captured'),
    }),
  ).rejects.toMatchObject({ code: 'snapshot-changed' });
  expect(core.registry.update('keeper', { displayName: 'Still writable' }).ok).toBe(true);
  const controller = new AbortController();
  await expect(
    exportProfileBackup(source(core), target, {
      signal: controller.signal,
      captured: () => controller.abort(),
    }),
  ).rejects.toThrow();
  expect(existsSync(target)).toBe(false);
  await exportProfileBackup(source(core), target);
  const prior = readFileSync(target);
  await expect(exportProfileBackup(source(core), target)).rejects.toMatchObject({
    code: 'destination-exists',
  });
  expect(readFileSync(target)).toEqual(prior);
});

it('refuses missing retained Memory or attachment bytes rather than publishing a partial core', async () => {
  const { core, file } = await scene();
  const target = join(root(), 'missing.botharness-backup');
  rmSync(core.attachments.fileTarget(file.fileId!).path);
  await expect(exportProfileBackup(source(core), target)).rejects.toMatchObject({
    code: 'required-file-missing',
  });
  const retained = core.deletions.get('deleted-retained')!.memoryDir;
  rmSync(retained, { recursive: true });
  await expect(exportProfileBackup(source(core), target)).rejects.toMatchObject({
    code: 'required-file-missing',
  });
});

it('rejects damaged/hash-missing/unsafe/newer packages and cancelled or racing restore without a committed destination', async () => {
  const { core } = await scene();
  const parent = root();
  const packagePath = join(parent, 'complete.botharness-backup');
  await exportProfileBackup(source(core), packagePath);
  const archive = readFileSync(packagePath);
  const parsed = inspectProfileBackup(archive);
  const destination = join(parent, 'new-home');
  const damaged = parsed.entries.map((entry) =>
    entry.path === 'database.sqlite' ? { ...entry, data: Buffer.from('bad sqlite') } : entry,
  );
  await expect(restoreProfileBackup(writeZip(damaged), destination)).rejects.toMatchObject({
    code: 'package-invalid',
  });
  const metadata = parsed.entries.find((entry) => entry.path === 'manifest.json')!;
  const incompatible = {
    ...parsed.manifest,
    dependencies: [
      ...parsed.manifest.dependencies,
      {
        kind: 'runtime',
        scope: 'required-extension',
        reference: 'unavailable@1',
        required: true,
        contract: 'unknown/1',
      },
    ],
  };
  await expect(
    restoreProfileBackup(
      writeZip(
        parsed.entries.map((entry) =>
          entry === metadata
            ? { ...entry, data: Buffer.from(JSON.stringify(incompatible)) }
            : entry,
        ),
      ),
      destination,
    ),
  ).rejects.toMatchObject({ code: 'dependency-incompatible' });
  expect(existsSync(destination)).toBe(false);
  const future = { ...parsed.manifest, schemaGeneration: 9999 };
  await expect(
    restoreProfileBackup(
      writeZip(
        parsed.entries.map((entry) =>
          entry === metadata ? { ...entry, data: Buffer.from(JSON.stringify(future)) } : entry,
        ),
      ),
      destination,
    ),
  ).rejects.toMatchObject({ code: 'upgrade-required' });
  expect(() =>
    inspectProfileBackup(
      writeZip([...parsed.entries, { path: '../escape', data: Buffer.from('bad') }]),
    ),
  ).toThrow();
  const badDb = Buffer.from('not a database');
  const consistent = {
    ...parsed.manifest,
    files: parsed.manifest.files.map((file) =>
      file.path === 'database.sqlite'
        ? { ...file, bytes: badDb.length, sha256: createHash('sha256').update(badDb).digest('hex') }
        : file,
    ),
  };
  consistent.counts.bytes = consistent.files.reduce((sum, file) => sum + file.bytes, 0);
  await expect(
    restoreProfileBackup(
      writeZip(
        parsed.entries.map((entry) =>
          entry === metadata
            ? { ...entry, data: Buffer.from(JSON.stringify(consistent)) }
            : entry.path === 'database.sqlite'
              ? { ...entry, data: badDb }
              : entry,
        ),
      ),
      destination,
    ),
  ).rejects.toThrow();
  expect(existsSync(destination)).toBe(false);
  const controller = new AbortController();
  await expect(
    restoreProfileBackup(archive, destination, {
      signal: controller.signal,
      beforeCommit: () => controller.abort(),
    }),
  ).rejects.toThrow();
  expect(existsSync(destination)).toBe(false);
  await expect(
    restoreProfileBackup(archive, destination, { beforeCommit: () => mkdirSync(destination) }),
  ).rejects.toMatchObject({ code: 'destination-exists' });
  expect(existsSync(join(destination, 'botharness'))).toBe(false);
});

it('uses the real Writer Lease and refuses reentrant mutations at the owner cutoff', () => {
  const core = mount();
  const parent = root();
  const second = mountOperationalDatabase({ dshHome: join(core.rootDir, '..', '..') });
  expect(second.recovery?.code).toBe('lease-unavailable');
  second.close();
  const port = attachOperationalModule(core.operationalDatabase, 'test');
  withOperationalBackup(core.operationalDatabase, join(parent, 'snapshot.sqlite'), () => {
    expect(() => port.transaction(() => undefined)).toThrow('Backup Barrier');
    expect(validateOperationalSnapshot(join(parent, 'snapshot.sqlite'))).toBe(
      core.operationalDatabase.generation,
    );
  });
  expect(() => port.transaction(() => undefined)).not.toThrow();
});

it('exports through the Settings transport only after a current preview, inspects the resulting file and gates activation on authorization', async () => {
  const { core } = await scene();
  const handler = createProfileBackupHttp(source(core), root(), core.profileRecovery, catalog);
  const request = (suffix = '', value?: unknown) =>
    new Request('http://dsh.internal' + PROFILE_BACKUP_PATH + suffix, {
      ...(value === undefined ? {} : { method: 'POST', body: JSON.stringify(value) }),
    });
  const stale = await (await handler(request())).json();
  core.registry.update('keeper', { displayName: 'Changed since preview' });
  expect(await (await handler(request('', { token: stale.token }))).json()).toMatchObject({
    error: { code: 'preview-stale' },
  });
  const preview = await (await handler(request())).json();
  const downloaded = await handler(request('', { token: preview.token }));
  expect(downloaded.status).toBe(200);
  const archive = Buffer.from(await downloaded.arrayBuffer());
  expect(Number(downloaded.headers.get('content-length'))).toBe(archive.length);
  const inspected = await handler(
    new Request('http://dsh.internal' + PROFILE_BACKUP_PATH + '/inspect', {
      method: 'POST',
      body: new Uint8Array(archive),
    }),
  );
  expect(await inspected.json()).toMatchObject({
    bytes: archive.length,
    restore: 'trusted-local-stopped-profile-only',
  });
  const destination = join(root(), 'restored');
  await restoreProfileBackup(archive, destination);
  const restored = mount(destination);
  const targetHandler = createProfileBackupHttp(
    source(restored),
    root(),
    restored.profileRecovery,
    catalog,
  );
  expect(
    await (
      await targetHandler(request('/activate', { slug: 'keeper', acknowledgeSplitBrain: true }))
    ).json(),
  ).toMatchObject({ error: { code: 'activation-required' } });
  await targetHandler(request('/authorize', { slug: 'keeper' }));
  expect(
    await (
      await targetHandler(request('/activate', { slug: 'keeper', acknowledgeSplitBrain: true }))
    ).json(),
  ).toMatchObject({ restored: true, bots: [{ slug: 'keeper', activated: true }] });
  const plan = restored.registry.get('keeper')!.modelPlan!;
  restored.registry.customizeModelPlan(
    'keeper',
    { ...route, model: 'drifted-model' },
    plan.revision,
  );
  expect(() => restored.profileRecovery.requireExecution('keeper')).toThrow();
  const unavailable: ModelCatalog = {
    list: async () => [],
    validate: async () => {
      throw new Error('missing target credential');
    },
  };
  await expect(restored.profileRecovery.authorizeModel('keeper', unavailable)).rejects.toThrow();
  expect(() => restored.profileRecovery.requireExecution('keeper')).toThrow();
});

it('rejects a self-consistent manifest whose database references omitted attachment bytes and preserves the source', async () => {
  const { core, file } = await scene();
  const path = join(root(), 'complete.botharness-backup');
  await exportProfileBackup(source(core), path);
  const parsed = inspectProfileBackup(readFileSync(path));
  const prefix = 'attachments/files/' + file.fileId!.slice(5) + '/';
  const files = parsed.manifest.files.filter((entry) => !entry.path.startsWith(prefix));
  expect(files.length).toBeLessThan(parsed.manifest.files.length);
  const manifest = {
    ...parsed.manifest,
    files,
    counts: {
      ...parsed.manifest.counts,
      files: files.length,
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    },
  };
  const archive = writeZip(
    parsed.entries
      .filter((entry) => !entry.path.startsWith(prefix))
      .map((entry) =>
        entry.path === 'manifest.json'
          ? { ...entry, data: Buffer.from(JSON.stringify(manifest)) }
          : entry,
      ),
  );
  const destination = join(root(), 'bad-closure');
  await expect(restoreProfileBackup(archive, destination)).rejects.toMatchObject({
    code: 'required-file-missing',
  });
  expect(existsSync(destination)).toBe(false);
  expect(readFileSync(core.attachments.fileTarget(file.fileId!).path, 'utf8')).toBe(
    'current editable bytes',
  );
});

it('restores content without imported device, push, secret execution or protected steward authority', async () => {
  const core = mount();
  expect(
    core.registry.create({
      slug: 'keeper',
      displayName: 'Keeper',
      persona: 'Retain this personality',
    }).ok,
  ).toBe(true);
  const steward = await core.tob.ensure();
  const pair = createDevicePairing({
    database: attachOperationalModule(core.operationalDatabase, 'device-pairing'),
    hostName: 'source',
  });
  const sourceHost = pair.host();
  const paired = pair.redeem({ offer: pair.createOffer().offer, name: 'Fixture phone' });
  if (!paired.ok) throw new Error('pairing precondition');
  const secrets = createSecretMcpStore(
    attachOperationalModule(core.operationalDatabase, 'secret-mcp'),
  );
  secrets.put({
    botSlug: 'keeper',
    serverName: 'fixture-server',
    account: 'fixture-account',
    program: 'fixture-program',
    args: [],
    env: [],
    references: ['fixture-ref'],
  });
  secrets.setEnabled('keeper', 'keeper', 'fixture-server', true);
  attachOperationalModule(core.operationalDatabase, 'push').transaction((db) =>
    db
      .prepare(
        'INSERT INTO push_devices (device_id,token,platform,preferences_json,registered_at) VALUES (?,?,?,?,?)',
      )
      .run(paired.device.id, 'synthetic-push-token', 'ios', '{}', new Date().toISOString()),
  );
  const archive = join(root(), 'source.botharness-backup');
  await exportProfileBackup(source(core), archive);
  const targetHome = join(root(), 'restored');
  await restoreProfileBackup(readFileSync(archive), targetHome);
  const target = mount(targetHome);
  const targetPair = createDevicePairing({
    database: attachOperationalModule(target.operationalDatabase, 'device-pairing'),
    hostName: 'target',
  });
  expect(targetPair.host().id).not.toBe(sourceHost.id);
  expect(targetPair.admit('Device ' + paired.credential)).toMatchObject({ ok: false });
  expect(targetPair.list()).toEqual([
    expect.objectContaining({ id: paired.device.id, revokedAt: expect.any(String) }),
  ]);
  expect(
    createSecretMcpStore(
      attachOperationalModule(target.operationalDatabase, 'secret-mcp'),
    ).listAll(),
  ).toEqual([]);
  expect(
    attachOperationalModule(target.operationalDatabase, 'push').read(
      (db) => db.prepare('SELECT COUNT(*) AS n FROM push_devices').get()?.n,
    ),
  ).toBe(0);
  expect(target.tob.isTob(steward.botSlug)).toBe(false);
  expect(target.registry.get(steward.botSlug)?.paused).toBe(true);
  const freshSteward = await target.tob.ensure();
  expect(freshSteward.botSlug).not.toBe(steward.botSlug);
  expect(target.tob.isTob(freshSteward.botSlug)).toBe(true);
  expect(readFileSync(join(target.registry.memoryDirFor('keeper')!, 'SOUL.md'), 'utf8')).toContain(
    'Retain this personality',
  );
  expect(pair.host()).toEqual(sourceHost);
  expect(pair.admit('Device ' + paired.credential).ok).toBe(true);
  expect(core.tob.isTob(steward.botSlug)).toBe(true);
  expect(secrets.listAll()).toHaveLength(1);
  let gateway: ReturnType<typeof createDeviceGateway>;
  let cookieLookups = 0;
  const server = createServer((request, response) => void gateway.handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test address');
  gateway = createDeviceGateway({
    pairing: targetPair,
    port: () => address.port,
    authenticatedUrl: () => {
      cookieLookups++;
      return 'http://invalid';
    },
  });
  try {
    const response = await fetch(
      'http://127.0.0.1:' +
        address.port +
        DEVICE_GATEWAY_PREFIX +
        '/api/botharness/profile-backup/recovery',
      { headers: { authorization: 'Device ' + paired.credential } },
    );
    expect(response.status).toBe(401);
    expect(cookieLookups).toBe(0);
    const http = createProfileBackupHttp(source(target), root(), target.profileRecovery, catalog);
    expect(
      (await http(new Request('http://operator' + PROFILE_BACKUP_PATH + '/recovery'))).status,
    ).toBe(200);
    const newPair = targetPair.redeem({
      offer: targetPair.createOffer().offer,
      name: 'Re-paired phone',
    });
    if (!newPair.ok) throw new Error('target pairing');
    expect(targetPair.admit('Device ' + newPair.credential).ok).toBe(true);
    expect(targetPair.admit('Device ' + paired.credential).ok).toBe(false);
  } finally {
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
});

it.each([
  'allow',
  'other-review',
  'wrong-plan-review',
  'different-context',
  'revoked-authority',
] as const)(
  'keeps only its own canonical export approval outside scope CAS: %s',
  async (caseName) => {
    const core = mount();
    expect(core.registry.create({ slug: 'keeper', displayName: 'Keeper' }).ok).toBe(true);
    const channel = core.channels.getOrCreateDm('keeper', 'Keeper')!;
    core.ownership.claim({
      sessionId: 'review-session',
      botSlug: 'keeper',
      rootRole: 'orchestrator',
      at: '2026-10-18T00:00:00Z',
    });
    await core.channels.appendMessage(channel.id, {
      id: 'accepted-human',
      at: '2026-10-18T00:00:01Z',
      body: 'Export my Profile',
      author: { kind: 'human' },
    });
    const port = attachOperationalModule(core.operationalDatabase, 'backup-review-test');
    const accepted = String(
      port.read(
        (db) =>
          db
            .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
            .get('accepted-human')!.source_event_id,
      ),
    );
    const context = {
      sessionId: 'review-session',
      sourceEventIds: [accepted],
      callIds: ['export-call'],
    };
    const handler = createProfileBackupHttp(source(core), root(), core.profileRecovery, catalog);
    const preview = await (
      await handler(new Request('http://localhost' + PROFILE_BACKUP_PATH), undefined, context)
    ).json();
    await core.channels.appendMessage(
      channel.id,
      {
        id: 'export-progress',
        at: '2026-10-18T00:00:02Z',
        body: 'Review this complete Profile export',
        author: { kind: 'bot', slug: 'keeper' },
      },
      { sessionId: 'review-session', sourceEventId: accepted },
    );
    await core.channels.appendMessage(channel.id, {
      id: 'export-review',
      at: '2026-10-18T00:00:03Z',
      body: 'Review export',
      author: { kind: 'bot', slug: 'keeper' },
      toolApprovalRequest: {
        sessionId: 'review-session',
        callId: 'export-call:cli:11111111-1111-4111-8111-111111111111',
        toolName: 'deepseekbot profile-backup-export',
        role: 'orchestrator',
        cwd: core.registry.memoryDirFor('keeper')!,
        input: JSON.stringify({
          parentShellCallId: 'export-call',
          command: 'profile-backup-export',
          target: 'Profile',
          patch: {
            export: true,
            planId: '33333333-3333-4333-8333-333333333333',
            destination: 'protected-host-file',
          },
        }),
      },
    });
    await core.channels.appendMessage(channel.id, {
      id: 'export-decision',
      at: '2026-10-18T00:00:04Z',
      body: 'Allow once',
      author: { kind: 'human' },
      replyTo: 'export-review',
      toolApprovalDecision: { requestMessageId: 'export-review', outcome: 'allowed-once' },
    });
    if (caseName === 'other-review' || caseName === 'wrong-plan-review')
      await core.channels.appendMessage(channel.id, {
        id: 'unrelated-review',
        at: '2026-10-18T00:00:05Z',
        body: 'Different export execution',
        author: { kind: 'bot', slug: 'keeper' },
        toolApprovalRequest: {
          sessionId: 'review-session',
          callId:
            (caseName === 'other-review' ? 'different-call' : 'export-call') +
            ':cli:22222222-2222-4222-8222-222222222222',
          toolName: 'deepseekbot profile-backup-export',
          role: 'orchestrator',
          cwd: core.registry.memoryDirFor('keeper')!,
          input: JSON.stringify({
            parentShellCallId: caseName === 'other-review' ? 'different-call' : 'export-call',
            command: 'profile-backup-export',
            target: 'Profile',
            patch: {
              export: true,
              planId:
                caseName === 'wrong-plan-review'
                  ? '44444444-4444-4444-8444-444444444444'
                  : '33333333-3333-4333-8333-333333333333',
              destination: 'protected-host-file',
            },
          }),
        },
      });
    const exportContext = { ...context, exportPlanId: '33333333-3333-4333-8333-333333333333' };
    const request = new Request('http://localhost' + PROFILE_BACKUP_PATH, {
      method: 'POST',
      body: JSON.stringify({ token: preview.token }),
    });
    if (caseName === 'revoked-authority') {
      await expect(
        handler(
          request,
          () => {
            throw new Error('current accepted authority revoked');
          },
          context,
        ),
      ).rejects.toThrow('current accepted authority revoked');
      return;
    }
    const response = await handler(
      request,
      undefined,
      caseName === 'different-context'
        ? { ...exportContext, sourceEventIds: ['unrelated-source'] }
        : exportContext,
    );
    if (caseName !== 'allow') {
      expect(await response.json()).toMatchObject({ error: { code: 'preview-stale' } });
      return;
    }
    expect(response.status).toBe(200);
    const archive = Buffer.from(await response.arrayBuffer());
    expect(inspectProfileBackup(archive).manifest.counts.bots).toBe(1);
  },
);

it.each([
  'source',
  'memory',
  'profile',
  'grant',
  'approval-route',
  'failure-alert',
  'same-count-session',
] as const)('refuses a scoped reviewed export after an actual %s change', async (change) => {
  const core = mount();
  expect(core.registry.create({ slug: 'keeper', displayName: 'Keeper', persona: 'AAAA' }).ok).toBe(
    true,
  );
  const channel = core.channels.getOrCreateDm('keeper', 'Keeper')!;
  if (change === 'same-count-session')
    core.ownership.claim({
      sessionId: 'same-count',
      botSlug: 'keeper',
      rootRole: 'orchestrator',
      at: '2026-10-18T00:00:00Z',
    });
  const handler = createProfileBackupHttp(source(core), root(), core.profileRecovery, catalog);
  const preview = await (
    await handler(new Request('http://localhost' + PROFILE_BACKUP_PATH))
  ).json();
  if (change === 'source')
    await core.channels.appendMessage(channel.id, {
      id: 'new-human',
      at: '2026-10-18T00:00:01Z',
      body: 'Another request',
      author: { kind: 'human' },
    });
  else if (change === 'memory') {
    const file = join(core.registry.memoryDirFor('keeper')!, 'SOUL.md');
    const before = readFileSync(file);
    const after = Buffer.from(before);
    after[0] = after[0] === 65 ? 66 : 65;
    writeFileSync(file, after);
    expect(after.length).toBe(before.length);
  } else if (change === 'profile') core.registry.update('keeper', { displayName: 'Different' });
  else if (change === 'approval-route' || change === 'failure-alert')
    attachOperationalModule(core.operationalDatabase, 'messaging').transaction((db) => {
      if (change === 'approval-route')
        db.prepare(
          'INSERT INTO messaging_approval_routes (bot_slug, revision, body) VALUES (?, ?, ?)',
        ).run('keeper', 1, '{}');
      else
        db.prepare(
          'INSERT INTO messaging_failure_alert_settings (bot_slug, enabled, revision) VALUES (?, ?, ?)',
        ).run('keeper', 1, 1);
    });
  else if (change === 'same-count-session')
    attachOperationalModule(core.operationalDatabase, 'session-ownership').transaction((db) => {
      db.prepare('UPDATE session_ownership SET created_at = ? WHERE session_id = ?').run(
        '2026-10-18T00:00:02Z',
        'same-count',
      );
    });
  else
    attachOperationalModule(core.operationalDatabase, 'workspace-grants').transaction((db) => {
      db.prepare(
        'INSERT INTO workspace_grants (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('new-grant', 'keeper', 'workspace', root(), 'Workspace', '2026-10-18T00:00:01Z');
    });
  const response = await handler(
    new Request('http://localhost' + PROFILE_BACKUP_PATH, {
      method: 'POST',
      body: JSON.stringify({ token: preview.token }),
    }),
  );
  expect(await response.json()).toMatchObject({ error: { code: 'preview-stale' } });
});

it('requires an explicit backup review classification for every future canonical schema table', async () => {
  const core = mount();
  attachOperationalModule(core.operationalDatabase, 'future-module').transaction((db) =>
    db.exec('CREATE TABLE future_review_authority (id TEXT PRIMARY KEY)'),
  );
  const handler = createProfileBackupHttp(source(core), root(), core.profileRecovery, catalog);
  const response = await handler(new Request('http://localhost' + PROFILE_BACKUP_PATH));
  expect(await response.json()).toMatchObject({ error: { code: 'dependency-incompatible' } });
});

it('binds reviewed file bytes to the actual barrier capture instead of only a preflight observation', async () => {
  const core = mount();
  expect(core.registry.create({ slug: 'keeper', displayName: 'Keeper', persona: 'AAAA' }).ok).toBe(
    true,
  );
  const reviewed = profileBackupReviewScope(source(core));
  const file = join(core.registry.memoryDirFor('keeper')!, 'SOUL.md');
  const before = readFileSync(file);
  const after = Buffer.from(before);
  after[0] = after[0] === 65 ? 66 : 65;
  writeFileSync(file, after);
  const destination = join(root(), 'reviewed.botharness-backup');
  await expect(
    exportProfileBackup(source(core), destination, { reviewedFiles: reviewed.files }),
  ).rejects.toMatchObject({ code: 'preview-stale' });
  expect(existsSync(destination)).toBe(false);
});

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncBotDescriptor } from '../src/bots/bot-descriptor-sync.js';
import { createBotTransfer } from '../src/bots/transfer.js';
import { createBotZipHttp } from '../src/bots/bot-zip-http.js';
import { BOT_ZIP_HISTORY_PATH, readBotZip } from '../src/bots/bot-zip.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTobBotTransferOperations } from '../src/tob/cli-bot-transfer.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { TobError, isTob } from '../src/tob/service.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot } from './helpers.js';

function fixture() {
  const root = createTempRoot('bh-transfer-');
  const registry = createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    syncDescriptor: (memoryDir, record, options) => syncBotDescriptor(memoryDir, record, options),
  });
  registry.create({
    slug: 'helper',
    displayName: 'Helper',
    persona: 'Portable soul',
    coreMemory: 'Portable memory',
  });
  const memory = registry.memoryDirFor('helper')!;
  writeFileSync(join(memory, 'private.env'), 'SHOULD_NOT_EXPORT');
  writeFileSync(join(memory, '.gitignore'), 'private.env\n');
  symlinkSync('/etc/hosts', join(memory, 'link'));
  mkdirSync(join(memory, 'notes'));
  writeFileSync(join(memory, 'notes', 'approved.md'), 'selected note');
  writeFileSync(join(memory, 'notes', 'other.md'), 'other note');
  return { root, registry, memory, transfer: createBotTransfer(registry) };
}
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});
async function cli(args: string[], env: NodeJS.ProcessEnv) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(args, {
    env,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toMatch(
    /scoped-secret|human-secret|SHOULD_NOT_EXPORT|Portable soul/,
  );
  return { code, value: JSON.parse(stdout[0]!) };
}
describe('portable Bot transfer owner', () => {
  it('binds actual bytes, identity and history, and exports only selected files plus required presentation', () => {
    const f = fixture();
    const first = f.transfer.files('helper');
    expect(JSON.stringify(first)).not.toContain(f.memory);
    expect(first.files.map((file) => file.path)).not.toContain('private.env');
    expect(first.files.map((file) => file.path)).not.toContain('link');
    const exported = f.transfer.exportZip('helper', {
      include: ['notes/approved.md'],
      history: false,
      expectedState: first.stateFingerprint,
    });
    const files = readBotZip(exported.archive).files;
    expect(files.map((file) => file.path).sort()).toEqual(
      [...first.always, 'notes/approved.md'].sort(),
    );
    expect(files.find((file) => file.path === 'notes/approved.md')?.data.toString()).toBe(
      'selected note',
    );
    writeFileSync(join(f.memory, 'notes', 'approved.md'), 'CHANGED note!');
    expect(() =>
      f.transfer.exportZip('helper', {
        include: ['notes/approved.md'],
        history: false,
        expectedState: first.stateFingerprint,
      }),
    ).toThrow('stale-bot-files');
    const latest = f.transfer.files('helper');
    const all = f.transfer.exportZip('helper', {
      history: true,
      expectedState: latest.stateFingerprint,
    });
    expect(readBotZip(all.archive).history).toBeDefined();
    expect(all.metadata.sha256).toBe(createHash('sha256').update(all.archive).digest('hex'));
    expect(() => f.transfer.prepare('helper', { history: true, include: ['SOUL.md'] })).toThrow(
      'invalid-input',
    );
    expect(() =>
      f.transfer.prepare('helper', { history: false, include: ['../private.env'] }),
    ).toThrow('unsafe-path');
    expect(() =>
      f.transfer.prepare('helper', { history: false, include: ['private.env'] }),
    ).toThrow('invalid-input');
    expect(() => f.transfer.files('missing')).toThrow('unknown-bot');
    expect(BOT_ZIP_HISTORY_PATH).toBe('.botharness/git-history.bundle');
  });
  it('exports protected Tob personality without transferring its local role or unrelated Host data', async () => {
    const f = fixture();
    const database = attachOperationalModule(
      registryDatabase(join(f.root, 'bots')),
      'transfer-test',
    );
    database.transaction((db) =>
      db.prepare('INSERT INTO tob_identity (singleton,bot_slug) VALUES (1,?)').run('helper'),
    );
    expect(isTob(database, 'helper')).toBe(true);
    const snapshot = f.transfer.files('helper');
    const exported = f.transfer.exportZip('helper', {
      history: false,
      expectedState: snapshot.stateFingerprint,
    });
    const contents = readBotZip(exported.archive);
    const descriptor = JSON.parse(
      contents.files.find((file) => file.path === '.botharness/bot.json')!.data.toString(),
    );
    expect(descriptor).not.toHaveProperty('systemRole');
    expect(descriptor).not.toHaveProperty('workspaces');
    expect(
      contents.files.some((file) => /tob_identity|credentials|operational.sqlite/u.test(file.path)),
    ).toBe(false);
    const http = createBotZipHttp({
      registry: f.registry,
      detail: (slug) => ({ ok: true, value: { slug } }),
      createBotId: () => 'ordinary-copy',
    });
    const reply = await http(
      new Request('http://host/api/botharness/bot-zip/import', {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: new Uint8Array(exported.archive),
      }),
    );
    expect(reply.status).toBe(200);
    expect(f.registry.get('ordinary-copy')).toBeDefined();
    expect(isTob(database, 'ordinary-copy')).toBe(false);
  });
  it('uses the same checked owner for HTTP snapshot/export while retaining legacy selection semantics', async () => {
    const f = fixture();
    const http = createBotZipHttp({
      registry: f.registry,
      transfer: f.transfer,
      detail: () => ({ ok: true, value: {} }),
    });
    const listing = await (
      await http(new Request('http://host/api/botharness/bot-zip/files?slug=helper&snapshot=1'))
    ).json();
    const request = () =>
      new Request('http://host/api/botharness/bot-zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'helper',
          include: ['SOUL.md'],
          history: false,
          expectedState: listing.stateFingerprint,
        }),
      });
    const exported = await http(request());
    expect(exported.status).toBe(200);
    expect(exported.headers.get('x-botharness-result')).toBeTruthy();
    writeFileSync(join(f.memory, 'SOUL.md'), 'changed');
    const stale = await http(request());
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'stale-bot-files' } });
    expect((await http(new Request('http://host/api/botharness/bot-zip?slug=helper'))).status).toBe(
      200,
    );
  });
});
describe('reviewed scoped Bot transfer', () => {
  it('keeps bytes out of CLI stdout, exclusively writes 0600, denies and rechecks changed content and authority', async () => {
    const f = fixture();
    const snapshot = f.transfer.files('helper');
    let approved = true;
    let active = true;
    let mutate = false;
    const proposals: unknown[] = [];
    const operations = createTobBotTransferOperations(f.transfer);
    const broker = await startTobCliBroker({
      signal: new AbortController().signal,
      authorize: () => {
        if (!active) throw new Error('revoked');
      },
      readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
      writeSetting: async () => ({ scope: 'global', value: 8, revision: 0 }),
      prepareOperation: operations,
      approve: async (proposal) => {
        proposals.push(proposal);
        if (!approved) throw new TobError('approval-denied');
        if (mutate) writeFileSync(join(f.memory, 'SOUL.md'), 'changed during review');
      },
    });
    cleanup.push(broker.close);
    const env = {
      DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint,
      DEEPSEEKBOT_AGENT_TOKEN: broker.token,
    };
    const target = join(f.root, 'selected.zip');
    const args = [
      'bot-zip-export',
      'helper',
      '--include',
      'SOUL.md',
      '--expected-state',
      snapshot.stateFingerprint,
      '--out',
      target,
    ];
    const result = await cli(args, env);
    expect(result.code).toBe(0);
    expect(result.value.download.path).toBe(target);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(readBotZip(readFileSync(target)).files.map((file) => file.path)).toContain('SOUL.md');
    expect((await cli(args, env)).value.error.code).toBe('output-exists');
    expect(proposals[0]).toMatchObject({
      command: 'bot-zip-export',
      target: 'helper',
      patch: { history: false, files: expect.arrayContaining(['SOUL.md']) },
    });
    expect(JSON.stringify(proposals)).not.toContain('Portable soul');
    approved = false;
    const denied = join(f.root, 'denied.zip');
    expect((await cli([...args.slice(0, -1), denied], env)).value.error.code).toBe(
      'approval-denied',
    );
    expect(existsSync(denied)).toBe(false);
    approved = true;
    mutate = true;
    const stale = join(f.root, 'stale.zip');
    expect((await cli([...args.slice(0, -1), stale], env)).value.error.code).toBe(
      'stale-bot-files',
    );
    expect(existsSync(stale)).toBe(false);
    active = false;
    expect((await cli(['bot-zip-files', 'helper'], env)).code).toBe(1);
  });
  it('does not treat JSON as archive success or accept missing scope/selection', async () => {
    const result = await cli(['bot-zip-export', 'helper', '--all', '--out', 'x'], {
      DEEPSEEKBOT_AGENT_ENDPOINT: 'http://127.0.0.1:1',
      DEEPSEEKBOT_AGENT_TOKEN: 'scoped-secret',
    });
    expect(result.value.error.code).toBe('usage');
  });
  it('runs independent Human CLI against the existing authenticated HTTP owner', async () => {
    const f = fixture();
    const http = createBotZipHttp({
      registry: f.registry,
      transfer: f.transfer,
      detail: () => ({ ok: true, value: {} }),
    });
    const server = createServer(async (req, res) => {
      if (req.url?.includes('token=human-secret')) {
        res.setHeader('set-cookie', 'session=ok');
        res.end('ok');
        return;
      }
      expect(req.headers.cookie).toBe('session=ok');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const reply = await http(
        new Request('http://host' + req.url, {
          method: req.method ?? 'GET',
          headers: { 'content-type': 'application/json' },
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
        }),
      );
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      res.end(Buffer.from(await reply.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address');
    const env = {
      DEEPSEEKBOT_HOST: 'http://127.0.0.1:' + address.port,
      DEEPSEEKBOT_HOST_TOKEN: 'human-secret',
    };
    const listing = await cli(['bot-zip-files', 'helper'], env);
    expect(listing.code).toBe(0);
    const target = join(f.root, 'human.zip');
    const exported = await cli(
      [
        'bot-zip-export',
        'helper',
        '--all',
        '--history',
        '--out',
        target,
        '--expected-state',
        listing.value.stateFingerprint,
      ],
      env,
    );
    expect(exported.code).toBe(0);
    expect(readBotZip(readFileSync(target)).history).toBeDefined();
  });
});

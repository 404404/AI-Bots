import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createMemoryService } from '../src/memory/service.js';
import { createMemoryImageHttp, MEMORY_IMAGE_PATH } from '../src/memory/image-http.js';
import { MAX_MEMORY_IMAGE_BYTES, type MemoryImage } from '../src/memory/image.js';

const png = (color: string) =>
  Buffer.from(
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="${color}"/></svg>`,
    )
      .render()
      .asPng(),
  );
const one = png('blue'),
  two = png('orange'),
  three = png('green');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const home = createTempRoot();
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({
    database,
    rootDir: join(home, 'bots'),
    initializeMemory(memoryDir) {
      const r = ensureMemoryRepository({ memoryDir });
      return r.ok ? { ok: true } : { ok: false, message: r.message };
    },
  });
  expect(registry.create({ slug: 'atlas', displayName: 'Atlas' }).ok).toBe(true);
  const memory = createMemoryService({ registry, ownership: createTestOwnership(), database });
  const root = registry.memoryDirFor('atlas')!;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const save = (bytes: Buffer, commit = false, path = 'preview.png') => {
    writeFileSync(join(root, path), bytes);
    if (commit) {
      git('add', '--', path);
      git('commit', '-m', 'Image version');
    }
    return git('rev-parse', 'HEAD');
  };
  const http = createMemoryImageHttp(memory);
  const get = (image: MemoryImage, path = 'preview.png', slug = 'atlas') =>
    http(
      new Request(
        'http://host' +
          MEMORY_IMAGE_PATH +
          '?' +
          new URLSearchParams({
            slug,
            path,
            source: image.source,
            revision: image.revision ?? '0'.repeat(64),
          }),
      ),
    );
  return { home, root, memory, git, save, get, http };
}

describe('version-bound Memory PNGs through the owning service and byte route', () => {
  it('distinguishes current, staged, unstaged and HEAD-to-current versions without writing Git', async () => {
    const { memory, git, save, get } = fixture();
    const head = save(one, true);
    save(two);
    git('add', 'preview.png');
    save(three);
    const status = git('status', '--porcelain');
    expect(memory.readAccepted('atlas', 'preview.png')?.image?.revision).toBe(digest(three));
    const staged = memory.workingDiff('atlas', 'preview.png', 'staged').images!;
    const unstaged = memory.workingDiff('atlas', 'preview.png', 'unstaged').images!;
    const current = memory.workingDiff('atlas', 'preview.png', 'current').images!;
    for (const [image, expected] of [
      [staged.before!, one],
      [staged.after!, two],
      [unstaged.before!, two],
      [unstaged.after!, three],
      [current.before!, one],
      [current.after!, three],
    ] as const) {
      expect(image.revision).toBe(digest(expected));
      const response = await get(image);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
    }
    expect(git('rev-parse', 'HEAD')).toBe(head);
    expect(git('status', '--porcelain')).toBe(status);
  });
  it('reads the exact commit and first-parent blobs after the current file is removed', async () => {
    const { memory, save, root, get, git } = fixture();
    const parent = save(one, true);
    const sha = save(two, true);
    rmSync(join(root, 'preview.png'));
    const detail = memory
      .gitCommitDiff('atlas', sha)
      .files.find((f) => f.path === 'preview.png')!.images!;
    expect(detail.before?.source).toBe(parent);
    expect(detail.after?.source).toBe(sha);
    expect(Buffer.from(await (await get(detail.before!)).arrayBuffer())).toEqual(one);
    expect(Buffer.from(await (await get(detail.after!)).arrayBuffer())).toEqual(two);
    const deletion = memory.workingDiff('atlas', 'preview.png', 'current').images!;
    expect(deletion.after).toBeUndefined();
    expect(deletion.before?.revision).toBe(digest(two));
    git('add', 'preview.png');
    git('commit', '-m', 'Remove image');
    expect(
      memory.gitCommitDiff('atlas', git('rev-parse', 'HEAD')).files[0]?.images?.after,
    ).toBeUndefined();
  });
  it('shows additions and untracked PNGs without the text preview limit', () => {
    const { memory, save, git } = fixture();
    const padded = Buffer.concat([one, Buffer.alloc(1024 * 1024 + 1)]);
    save(padded);
    const untracked = memory.workingDiff('atlas', 'preview.png', 'untracked').images!;
    expect(untracked.before).toBeUndefined();
    expect(untracked.after?.status).toBe('ready');
    git('add', 'preview.png');
    expect(memory.workingDiff('atlas', 'preview.png', 'staged').images?.before).toBeUndefined();
    git('commit', '-m', 'Added PNG');
    expect(
      memory.gitCommitDiff('atlas', git('rev-parse', 'HEAD')).files[0]?.images?.before,
    ).toBeUndefined();
  });
  it('refuses stale mutable content while immutable historical bytes remain available', async () => {
    const { memory, save, get, git } = fixture();
    const sha = save(one, true);
    save(two);
    git('add', 'preview.png');
    const oldCurrent = memory.readAccepted('atlas', 'preview.png')!.image!;
    const oldIndex = memory.workingDiff('atlas', 'preview.png', 'staged').images!.after!;
    save(three);
    git('add', 'preview.png');
    for (const image of [oldCurrent, oldIndex]) {
      const r = await get(image);
      expect(r.status).toBe(409);
      expect((await r.json()).error.code).toBe('memory-image-stale');
    }
    const historical = memory
      .gitCommitDiff('atlas', sha)
      .files.find((f) => f.path === 'preview.png')!.images!.after!;
    expect(Buffer.from(await (await get(historical)).arrayBuffer())).toEqual(one);
  });
  it('bounds PNG byte and decoded dimensions and rejects disguised content', () => {
    const { memory, root, save } = fixture();
    save(Buffer.from('<svg/>'));
    expect(memory.readAccepted('atlas', 'preview.png')?.image?.status).toBe('unsupported');
    save(one);
    truncateSync(join(root, 'preview.png'), MAX_MEMORY_IMAGE_BYTES + 1);
    expect(memory.readAccepted('atlas', 'preview.png')?.image?.status).toBe('too-large');
    const huge = Buffer.from(one);
    huge.writeUInt32BE(20000, 16);
    save(huge);
    expect(memory.readAccepted('atlas', 'preview.png')?.image?.status).toBe('too-large');
  });
  it('rejects repository escapes, control-directory aliases, non-regular Git objects and unreachable commits', async () => {
    const { root, home, memory, git, save, get } = fixture();
    save(one, true);
    const image = memory.readAccepted('atlas', 'preview.png')!.image!;
    writeFileSync(join(home, 'outside.png'), one);
    symlinkSync(join(home, 'outside.png'), join(root, 'escape.png'));
    symlinkSync(join(root, '.git'), join(root, 'alias'));
    writeFileSync(join(root, '.git', 'secret.png'), one);
    for (const path of [
      '../outside.png',
      '.git/secret.png',
      'alias/secret.png',
      'escape.png',
      '/etc/passwd',
    ])
      expect((await get(image, path)).status).toBe(400);
    git('add', 'escape.png');
    expect(memory.workingDiff('atlas', 'escape.png', 'staged').images?.after?.status).toBe(
      'unsupported',
    );
    const tree = git('rev-parse', 'HEAD^{tree}');
    const orphan = git('commit-tree', tree, '-m', 'Unreachable');
    expect((await get({ ...image, source: orphan })).status).toBe(400);
    expect((await get({ ...image, source: 'HEAD:preview.png' })).status).toBe(400);
    expect((await get(image, 'preview.png', 'absent')).status).toBe(400);
  });
  it('uses merge first-parent comparison and safely handles nested Unicode filenames', async () => {
    const { memory, save, git, root, get } = fixture();
    save(one, true);
    git('switch', '-c', 'side');
    save(two, true);
    git('switch', 'main');
    writeFileSync(join(root, 'other.md'), 'main');
    git('add', 'other.md');
    git('commit', '-m', 'Main change');
    const parent = git('rev-parse', 'HEAD');
    git('merge', '--no-ff', 'side', '-m', 'Merge image');
    const images = memory
      .gitCommitDiff('atlas', git('rev-parse', 'HEAD'))
      .files.find((f) => f.path === 'preview.png')!.images!;
    expect(images.before?.source).toBe(parent);
    expect(images.before?.revision).toBe(digest(one));
    expect(images.after?.revision).toBe(digest(two));
    mkdirSync(join(root, '图 notes'));
    save(three, true, '图 notes/a [1].png');
    const image = memory.readAccepted('atlas', '图 notes/a [1].png')!.image!;
    expect(Buffer.from(await (await get(image, '图 notes/a [1].png')).arrayBuffer())).toEqual(
      three,
    );
  });
});

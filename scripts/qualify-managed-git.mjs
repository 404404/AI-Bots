import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unrun } from 'unrun';

const output = process.argv[2];
if (!output) throw Error('Use node scripts/qualify-managed-git.mjs <private-evidence-directory>');
if (!['darwin', 'linux'].includes(process.platform))
  throw Error('This PATH-isolated qualification supports macOS and Linux only');
const out = resolve(output);
mkdirSync(out, { recursive: true });
const home = mkdtempSync(join(out, 'disposable-home-'));
const bin = join(home, 'bin');
mkdirSync(bin);
symlinkSync('/usr/bin/tar', join(bin, 'tar'));
const { module: gitModule } = await unrun({
  path: fileURLToPath(new URL('../packages/core/src/memory/managed-git.ts', import.meta.url)),
});
const previousPath = process.env.PATH;
const lifecycle = [];
const save = (result) =>
  writeFileSync(join(out, 'managed-git-result.json'), JSON.stringify(result, null, 2));
try {
  process.env.PATH = bin;
  const service = gitModule.createGitService({
    dshHome: home,
    log: (message) => lifecycle.push(message),
  });
  const before = service.status();
  assert.deepEqual(
    { available: before.available, reason: before.reason },
    { available: false, reason: 'missing' },
  );
  assert.equal(before.installable, true);
  service.install();
  await service.settled();
  const installed = service.status();
  save({
    evidence: 'real owner, pinned download/checksum/unpack/execution; process-only PATH isolation',
    before,
    installed,
    lifecycle,
  });
  assert.equal(
    installed.available,
    true,
    'real managed Git installation failed; inspect saved lifecycle',
  );
  assert.equal(installed.source, 'managed');
  const repository = join(home, 'repository');
  mkdirSync(repository);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--initial-branch=qualification');
  git('config', '--local', 'user.name', 'Isolated Git qualification');
  git('config', '--local', 'user.email', 'qualification@example.invalid');
  writeFileSync(join(repository, 'proof.txt'), 'Managed Git qualification\n');
  git('add', 'proof.txt');
  git('commit', '-m', 'Verify disposable managed Git repository');
  const commit = git('rev-parse', 'HEAD');
  assert.match(commit, /^[a-f0-9]{40}$/u);
  process.env.PATH = bin;
  const recovered = gitModule.createGitService({ dshHome: home }).resolve();
  assert.equal(recovered.available, true);
  assert.equal(recovered.source, 'managed');
  assert.equal(git('show', 'HEAD:proof.txt'), 'Managed Git qualification');
  save({
    evidence:
      'actual pinned artifact install and real Git commit/readback; no Host, Tob, UI or reboot claim',
    before,
    installed,
    recovered,
    commit,
    lifecycle,
  });
  console.log(JSON.stringify({ out, installed, recovered, commit }));
} finally {
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
}

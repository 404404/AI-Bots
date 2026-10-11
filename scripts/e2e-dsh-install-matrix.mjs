import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productDshVersions } from './product-artifacts.mjs';
import { verifiedProductArtifacts } from './packaged-profile.mjs';

const artifactsDirectory = resolve(process.argv[2] ?? '');
const outputDirectory = resolve(process.argv[3] ?? '');
if (process.argv.length !== 4)
  throw new Error('Use node scripts/e2e-dsh-install-matrix.mjs <artifacts> <fresh-output>');
if (existsSync(outputDirectory)) throw new Error('Use a fresh output directory');
const artifacts = verifiedProductArtifacts(artifactsDirectory);
const launcher = fileURLToPath(new URL('./dev-instance.mjs', import.meta.url));
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const report = {
  productVersion: artifacts.productVersion,
  node: process.version,
  platform: process.platform,
  artifacts: artifacts.artifacts,
  scope:
    'Real packaged Profile installation, composition, Host boot, authenticated API and restart persistence; browser/model/IM delivery are separate gates.',
  rows: [],
};
for (const [index, version] of productDshVersions.entries()) {
  const home = join(outputDirectory, `dsh-${version}`);
  const row = { dsh: version, state: 'failed', install: false, api: false, restart: false };
  report.rows.push(row);
  const port = 32960 + index;
  let pid;
  const launch = () => {
    const result = spawnSync(
      process.execPath,
      [
        launcher,
        '--home',
        home,
        '--port',
        String(port),
        '--product-artifacts',
        artifactsDirectory,
        '--dsh-version',
        version,
        '--json',
      ],
      { encoding: 'utf8', timeout: 300_000, maxBuffer: 20 * 1024 * 1024 },
    );
    writeFileSync(
      join(outputDirectory, `${version}-launch.private.log`),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
      { mode: 0o600 },
    );
    assert.equal(result.status, 0, `DSH ${version} launch failed; inspect private log`);
    const offset = result.stdout.lastIndexOf('\n{\n');
    const summary = JSON.parse(result.stdout.slice(offset + 1));
    pid = summary.pid;
    assert.equal(summary.productArtifacts.dsh, version);
    assert.equal(summary.health.ok, true);
    assert.equal(existsSync(join(home, 'profiles/web-dev/compatibility.json')), false);
    const cookie = readFileSync(
      join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
      'utf8',
    ).split(';')[0];
    const origin = new URL(summary.url).origin;
    return async (method, args = {}) => {
      const response = await fetch(`${origin}/api/botharness/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: `botharness/${method}`,
          payload: { args },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      assert.equal(response.status, 200);
      const envelope = await response.json();
      assert.equal(envelope.result?.ok, true);
      return envelope.result.value;
    };
  };
  const stop = async () => {
    if (!pid) return;
    process.kill(pid, 'SIGTERM');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        pid = undefined;
        return;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`DSH ${version} did not stop within 15 seconds`);
  };
  try {
    const rpc = launch();
    row.install = true;
    const bot = (await rpc('create', { displayName: 'Compatibility matrix Bot' })).bot;
    const channel = (await rpc('channelDm', { slug: bot.slug })).channel;
    assert.ok(channel.id);
    assert.ok((await rpc('list')).bots.some((entry) => entry.slug === bot.slug));
    row.api = true;
    await stop();
    const restarted = launch();
    assert.ok((await restarted('list')).bots.some((entry) => entry.slug === bot.slug));
    row.restart = true;
    row.state = 'passed';
  } catch (error) {
    row.error = error instanceof Error ? error.message : 'Matrix failed';
    throw error;
  } finally {
    await stop();
    writeFileSync(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${version}: ${row.state}`);
  }
}

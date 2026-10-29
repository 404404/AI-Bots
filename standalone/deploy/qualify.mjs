import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  lstatSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const install = join(repo, '.local/standalone-bot');
const sha = (value) => createHash('sha256').update(value).digest('hex');
function fail(condition, message) {
  if (!condition) throw new Error(message);
}
function run(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}
function inspect(name) {
  try {
    return JSON.parse(run('docker', ['inspect', name]))[0];
  } catch {
    return undefined;
  }
}
export function validateCandidate(record, ci) {
  fail(
    record.schemaVersion === 1 &&
      record.product === 'standalone-bot' &&
      record.repository === '404404/AI-Bots',
    'Wrong qualification artifact',
  );
  fail(
    record.runId === ci.databaseId &&
      record.commit === ci.headSha &&
      ci.workflowName === 'Standalone Bot' &&
      ci.conclusion === 'success',
    'Candidate CI provenance is not accepted',
  );
  fail(
    /^[a-f0-9]{40}$/u.test(record.commit) &&
      /^sha256:[a-f0-9]{64}$/u.test(record.imageId) &&
      /^[a-f0-9]{64}$/u.test(record.archiveSha256),
    'Invalid immutable identity',
  );
  fail(
    record.platform === 'linux/amd64' && record.published === false,
    'Unexpected qualification platform/state',
  );
  for (const gate of [
    'independentBuild',
    'protocolTests',
    'containerSmoke',
    'restartPersistence',
    'trivy',
  ])
    fail(record.gates?.[gate] === true, `Missing gate: ${gate}`);
  return record;
}
function snapshot() {
  return [
    'deepseekbot-gui',
    'hermesstatus-2-3-server',
    'hermesstatus-2-3-client',
    'hermesstatus-2-3-proxy',
    'ddnsto',
  ].map((name) => {
    const item = inspect(name);
    return {
      name,
      status: item?.State?.Status ?? 'absent',
      startedAt: item?.State?.StartedAt ?? null,
      finishedAt: item?.State?.FinishedAt ?? null,
    };
  });
}
function validateInstalled(container) {
  fail(
    container.Config?.Labels?.['io.404404.product'] === 'standalone-bot',
    'Existing target is not the standalone product',
  );
  fail(
    container.HostConfig?.Privileged === false && container.HostConfig?.NetworkMode === 'bridge',
    'Unexpected target permissions/network',
  );
  fail(
    container.Config?.User === '10001:10001' && container.HostConfig?.ReadonlyRootfs === true,
    'Unexpected target user/filesystem',
  );
  fail(
    container.Mounts?.filter((mount) => mount.Type === 'bind').length === 1 &&
      container.Mounts.some(
        (mount) => mount.Source === join(install, 'data') && mount.Destination === '/data/bot',
      ),
    'Unexpected target data mount',
  );
}
async function health() {
  for (let i = 0; i < 30; i++) {
    const item = inspect('gk50-standalone-bot');
    if (item?.State?.Health?.Status === 'healthy') return;
    if (item?.State?.Status === 'exited') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    'Qualification container did not become healthy; stopped without touching the comparison deployment',
  );
}
async function main() {
  process.umask(0o077);
  const args = process.argv.slice(2),
    execute = args.includes('--execute'),
    rollback = args.includes('--rollback');
  const idIndex = args.indexOf('--run-id'),
    runId = idIndex >= 0 ? args[idIndex + 1] : undefined;
  fail(
    args.every(
      (value, index) =>
        ['--execute', '--rollback', '--run-id'].includes(value) ||
        (index === idIndex + 1 && /^\d+$/u.test(value)),
    ),
    'Unknown arguments',
  );
  fail(
    hostname() === 'gk50' && repo === '/home/hermes/bots' && run('id', ['-un']).trim() === 'hermes',
    'Wrong target machine/account',
  );
  fail(
    run('git', ['remote', 'get-url', 'origin']).trim() === 'https://github.com/404404/AI-Bots.git',
    'Wrong fork remote',
  );
  const before = snapshot();
  const current = inspect('gk50-standalone-bot');
  if (current) validateInstalled(current);
  if (rollback) {
    fail(
      existsSync(join(install, 'previous.env')),
      'No prior independent deployment to roll back to; comparison data was never migrated',
    );
    const previous = readFileSync(join(install, 'previous.env'), 'utf8');
    fail(
      /^IMAGE_REF=sha256:[a-f0-9]{64}\n$/u.test(previous),
      'Previous candidate is not immutable',
    );
    const image = inspect(previous.trim().slice(10));
    fail(
      image?.Config?.Labels?.['io.404404.product'] === 'standalone-bot',
      'Prior image identity mismatch',
    );
    if (execute) {
      writeFileSync(join(install, '.env'), previous, { mode: 0o600 });
      run('docker', [
        'compose',
        '--project-directory',
        install,
        '-f',
        join(install, 'compose.yml'),
        'up',
        '-d',
        '--no-build',
        '--pull',
        'never',
        'bot',
      ]);
      await health();
    }
    return {
      status: execute ? 'qualification-rolled-back' : 'rollback-ready',
      executed: execute,
      imageId: previous.trim().slice(10),
      comparisonUnchanged: JSON.stringify(before) === JSON.stringify(snapshot()),
    };
  }
  fail(runId && /^\d+$/u.test(runId), 'Expected --run-id <successful qualification run>');
  const ci = JSON.parse(
    run('gh', [
      'run',
      'view',
      runId,
      '--repo',
      '404404/AI-Bots',
      '--json',
      'databaseId,workflowName,headSha,conclusion,status',
    ]),
  );
  fail(ci.status === 'completed' && ci.conclusion === 'success', 'CI is incomplete or failed');
  mkdirSync(install, { recursive: true, mode: 0o700 });
  fail(!lstatSync(install).isSymbolicLink(), 'Unsafe installation directory');
  const artifacts = join(install, 'artifacts', runId);
  mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  if (!existsSync(join(artifacts, 'standalone-candidate.json')))
    run(
      'gh',
      [
        'run',
        'download',
        runId,
        '--repo',
        '404404/AI-Bots',
        '--name',
        'standalone-candidate',
        '--dir',
        artifacts,
      ],
      { timeout: 300000 },
    );
  const candidate = validateCandidate(
    JSON.parse(readFileSync(join(artifacts, 'standalone-candidate.json'), 'utf8')),
    ci,
  );
  run('git', [
    'diff',
    '--exit-code',
    candidate.commit,
    '--',
    'standalone/src',
    'standalone/public',
    'standalone/package.json',
    'standalone/package-lock.json',
    'standalone/Dockerfile',
    'standalone/scripts',
    'standalone/deploy/compose.yml',
  ]);
  fail(
    sha(readFileSync(join(artifacts, 'standalone-candidate.tar'))) === candidate.archiveSha256,
    'Candidate archive digest mismatch',
  );
  if (!current)
    fail(
      run('ss', ['-H', '-ltn', 'sport = :22443']).trim() === '',
      'Port 22443 is in use by another listener',
    );
  const result = {
    schemaVersion: 1,
    status: 'qualification-ready',
    candidate,
    source: 'GitHub CI artifact, unpublished',
    fullAcceptance: 'pending',
    publicUrl: 'http://192.168.68.11:22443',
    comparison: before,
    executed: false,
  };
  if (!execute) return result;
  run('docker', ['load', '--input', join(artifacts, 'standalone-candidate.tar')], {
    timeout: 300000,
  });
  const image = inspect(candidate.imageId);
  fail(
    image?.Id === candidate.imageId &&
      image?.Architecture === 'amd64' &&
      image?.Os === 'linux' &&
      image?.Config?.Labels?.['org.opencontainers.image.revision'] === candidate.commit &&
      image?.Config?.Labels?.['io.404404.product'] === 'standalone-bot',
    'Loaded image identity mismatch',
  );
  const data = join(install, 'data');
  if (!existsSync(data))
    run('sudo', ['-n', 'install', '-d', '-m', '0700', '-o', '10001', '-g', '10001', data]);
  const stat = lstatSync(data);
  fail(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === 10001 &&
      stat.gid === 10001 &&
      (stat.mode & 0o777) === 0o700,
    'Data owner or mode is not accepted',
  );
  const envFile = join(install, '.env');
  if (current && existsSync(envFile)) {
    run('docker', [
      'compose',
      '--project-directory',
      install,
      '-f',
      join(install, 'compose.yml'),
      'stop',
      'bot',
    ]);
    const backup = join(install, `backup-${Date.now()}.tgz`);
    run('sudo', ['-n', 'tar', '-czf', backup, '-C', data, '.']);
    run('sudo', ['-n', 'chmod', '0600', backup]);
    copyFileSync(envFile, join(install, 'previous.env'));
  }
  copyFileSync(join(repo, 'standalone/deploy/compose.yml'), join(install, 'compose.yml'));
  writeFileSync(envFile, `IMAGE_REF=${candidate.imageId}\n`, { mode: 0o600 });
  run('docker', [
    'compose',
    '--project-directory',
    install,
    '-f',
    join(install, 'compose.yml'),
    'config',
    '--quiet',
  ]);
  run('docker', [
    'compose',
    '--project-directory',
    install,
    '-f',
    join(install, 'compose.yml'),
    'up',
    '-d',
    '--no-build',
    '--pull',
    'never',
    'bot',
  ]);
  await health();
  validateInstalled(inspect('gk50-standalone-bot'));
  result.status = 'qualification-running';
  result.executed = true;
  result.comparisonUnchanged = JSON.stringify(before) === JSON.stringify(snapshot());
  writeFileSync(join(install, 'qualification.json'), JSON.stringify(result, null, 2) + '\n', {
    mode: 0o600,
  });
  fail(
    result.comparisonUnchanged,
    'A comparison service changed during qualification; preserve evidence and stop',
  );
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(await main(), null, 2) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: 'stopped',
        error: error instanceof Error ? error.message : 'qualification-failed',
        fullAcceptance: 'pending',
      }) + '\n',
    );
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
// Application-owned deployment orchestration; DSH remains the owner of runtime data.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = '404404/AI-Bots';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = 'deepseekbot-gui';
// D-Bus requires the image's named dsh account, which CI tests with this identity.
const runtimeUid = 10001;
const runtimeGid = 10001;
const hash = (value) => createHash('sha256').update(value).digest('hex');
function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}
export function validateRelease(receipt, run, compose, seccomp) {
  requireCheck(
    run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.workflowName === 'GUI container',
    'release-run-not-passed',
  );
  requireCheck(
    receipt.schemaVersion === 1 &&
      receipt.repository === repo &&
      receipt.productionGate === 'passed',
    'release-receipt-invalid',
  );
  requireCheck(
    String(receipt.runId) === String(run.databaseId) &&
      receipt.commit === run.headSha &&
      /^[a-f0-9]{40}$/.test(receipt.commit),
    'release-run-mismatch',
  );
  requireCheck(
    /^ghcr\.io\/404404\/ai-bots@sha256:[a-f0-9]{64}$/.test(receipt.imageRef) &&
      /^sha256:[a-f0-9]{64}$/.test(receipt.imageId),
    'release-image-not-immutable',
  );
  requireCheck(
    receipt.composeSha256 === hash(compose) && receipt.seccompSha256 === hash(seccomp),
    'release-config-mismatch',
  );
  return receipt;
}
export function choosePort(listeners) {
  const occupied = new Set(
    listeners
      .trim()
      .split('\n')
      .map((line) => Number(line.trim().split(/\s+/)[3]?.split(':').at(-1))),
  );
  requireCheck(!occupied.has(1455), 'codex-callback-port-occupied');
  const port = [20443, 21443, 22443].find((value) => !occupied.has(value));
  requireCheck(port, 'deployment-ports-occupied');
  return port;
}
export function guiReport(stdout) {
  const start = stdout.indexOf('{');
  requireCheck(start >= 0, 'gui-report-missing');
  const value = JSON.parse(stdout.slice(start));
  requireCheck(
    value.status === 'passed' &&
      value.namespaceSandbox === 'yes' &&
      value.seccompBpf === 'yes' &&
      value.chromiumNoSandboxFlag === false &&
      value.sandboxedRenderer === true &&
      value.browserTitleSeenByComputer === true &&
      value.computerClickAndTypingObservedByBrowser === true &&
      value.computerScreenshot === 'returned',
    'gui-acceptance-failed',
  );
  const renderers = value.chromiumRendererSandbox;
  requireCheck(
    renderers?.rendererProcessCount > 0 &&
      renderers.rendererProcessCount === renderers.rendererSeccompFilterCount &&
      renderers.rendererSeccompUnfilteredCount === 0 &&
      renderers.rendererSeccompStatusMissingCount === 0 &&
      renderers.devtoolsRendererProcessCount > 0 &&
      renderers.devtoolsRendererProcessCount === renderers.devtoolsRendererProcessMatchedCount,
    'renderer-sandbox-incomplete',
  );
  return value;
}
export function validatePulledImage(receipt, image, rawManifest) {
  const manifestDigest = receipt.imageRef.split('@')[1];
  requireCheck(`sha256:${hash(rawManifest)}` === manifestDigest, 'image-manifest-digest-mismatch');
  const manifest = JSON.parse(rawManifest);
  requireCheck(
    manifest.schemaVersion === 2 &&
      [
        'application/vnd.oci.image.manifest.v1+json',
        'application/vnd.docker.distribution.manifest.v2+json',
      ].includes(manifest.mediaType) &&
      !manifest.manifests &&
      manifest.config?.digest === receipt.imageId,
    'image-manifest-config-mismatch',
  );
  // Classic Docker identifies an image by config digest; containerd may use manifest digest.
  // Both are accepted only after the original manifest bytes bind them to the tested receipt.
  requireCheck(
    [receipt.imageId, manifestDigest].includes(image.Id) &&
      image.RepoDigests?.includes(receipt.imageRef) &&
      image.Config?.Labels?.['org.opencontainers.image.revision'] === receipt.commit &&
      image.Os === 'linux' &&
      image.Architecture === 'amd64',
    'pulled-image-identity-mismatch',
  );
  return image.Id;
}
export function validateInstalledDeployment(
  receipt,
  container,
  root,
  compose,
  seccomp,
  envText,
  image,
  rawManifest,
) {
  const verifiedImageId = validatePulledImage(receipt, image, rawManifest);
  requireCheck(
    hash(compose) === receipt.composeSha256 && hash(seccomp) === receipt.seccompSha256,
    'installed-config-mismatch',
  );
  const lines = envText.trim().split('\n');
  const entries = lines.map((line) => line.split(/=(.*)/s).slice(0, 2));
  const env = Object.fromEntries(entries);
  requireCheck(
    entries.length === 7 &&
      Object.keys(env).length === 7 &&
      env.IMAGE_REF === receipt.imageRef &&
      env.PUID === String(runtimeUid) &&
      env.PGID === String(runtimeGid) &&
      ['20443', '21443', '22443'].includes(env.HOST_PORT) &&
      env.PUBLIC_URL === `http://127.0.0.1:${env.HOST_PORT}` &&
      env.WORKSPACE_ID === service &&
      env.CODEX_CALLBACK_PORT === '1455',
    'installed-environment-mismatch',
  );
  const labels = container.Config?.Labels;
  requireCheck(
    container.Image === verifiedImageId &&
      container.Config?.Image === receipt.imageRef &&
      labels?.['com.docker.compose.project'] === service &&
      labels?.['com.docker.compose.service'] === service &&
      labels?.['com.docker.compose.project.working_dir'] === root &&
      labels?.['com.docker.compose.project.config_files'] === join(root, 'compose.yml'),
    'installed-container-mismatch',
  );
  requireCheck(container.Config?.User === `${env.PUID}:${env.PGID}`, 'installed-user-mismatch');
  const config = container.HostConfig;
  requireCheck(
    config?.Privileged === false &&
      config.NetworkMode !== 'host' &&
      !config.CapAdd?.length &&
      config.CapDrop?.includes('ALL') &&
      config.SecurityOpt?.some((value) => value.startsWith('no-new-privileges')),
    'installed-security-mismatch',
  );
  const policy = config.SecurityOpt?.find((value) => value.startsWith('seccomp='));
  requireCheck(
    policy && JSON.stringify(JSON.parse(policy.slice(8))) === JSON.stringify(JSON.parse(seccomp)),
    'installed-seccomp-mismatch',
  );
  const ports = config.PortBindings;
  requireCheck(Object.keys(ports ?? {}).length === 2, 'installed-port-mismatch');
  for (const [target, port] of [
    ['3080/tcp', env.HOST_PORT],
    ['1455/tcp', '1455'],
  ]) {
    requireCheck(
      ports?.[target]?.length === 1 &&
        ports[target][0].HostIp === '127.0.0.1' &&
        ports[target][0].HostPort === port,
      'installed-port-mismatch',
    );
  }
  requireCheck(
    container.Mounts?.length === 1 &&
      container.Mounts.some(
        (mount) =>
          mount.Type === 'bind' &&
          mount.Source === join(root, 'data') &&
          mount.Destination === '/data/dsh',
      ),
    'installed-data-mount-mismatch',
  );
  return Number(env.HOST_PORT);
}
function command(program, args, { input, timeout = 60_000, allowFailure = false } = {}) {
  return new Promise((resolveCommand, reject) => {
    const env = { ...process.env };
    for (const key of [
      'IMAGE_REF',
      'PUID',
      'PGID',
      'HOST_PORT',
      'PUBLIC_URL',
      'WORKSPACE_ID',
      'CODEX_CALLBACK_PORT',
    ])
      delete env[key];
    const child = spawn(program, args, {
      cwd: source,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    let stdout = '';
    let bytes = 0;
    child.stdout.on('data', (data) => {
      bytes += data.length;
      if (bytes > 8 * 1024 * 1024) child.kill();
      else stdout += data;
    });
    // Never forward raw Docker/Host output or credentials into public evidence.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', () => reject(new Error('command-unavailable')));
    child.once('close', (code, signal) => {
      if (bytes > 8 * 1024 * 1024 || signal || (!allowFailure && code !== 0))
        reject(new Error('command-failed'));
      else resolveCommand({ code, stdout });
    });
  });
}
async function jsonCommand(program, args, options) {
  return JSON.parse((await command(program, args, options)).stdout);
}
async function privateJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'run-id': { type: 'string' },
      root: { type: 'string', default: join(source, '.local/gui-deployment') },
      execute: { type: 'boolean', default: false },
      publish: { type: 'boolean', default: false },
      'deploy-only': { type: 'boolean', default: false },
      accept: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'node deploy/gk50-release.mjs --run-id <successful-publishing-run> [--execute] [--root <new-directory>]\nOr: --publish --execute to dispatch and wait for CI first.\nDefault: read-only plan. --execute: first deployment, GUI/CLI/restart acceptance. Existing installations are never replaced. --deploy-only stops after health. --accept --execute runs a separate acceptance attempt against the matching existing deployment.',
    );
    return;
  }
  requireCheck(
    values.publish ? values.execute && !values['run-id'] : /^\d+$/.test(values['run-id'] ?? ''),
    'run-id-or-explicit-publish-required',
  );
  requireCheck(
    !values.accept || (!values.publish && !values['deploy-only']),
    'incompatible-acceptance-options',
  );
  const root = resolve(values.root);
  const attempt = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const evidenceDir = join(root, 'evidence', attempt);
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    runId: values['run-id'],
    status: 'running',
    stage: 'release-preflight',
    checks: [],
    mutations: [],
    remaining: ['codex-oauth-real-model-and-tool-call'],
  };
  let temp;
  let created = false;
  let started = false;
  const composeArgs = [
    'compose',
    '--project-name',
    service,
    '--env-file',
    join(root, '.env'),
    '-f',
    join(root, 'compose.yml'),
  ];
  const docker = (args, opts) => command('docker', [...composeArgs, ...args], opts);
  const exec = (args, opts) => docker(['exec', '-T', service, ...args], opts);
  const stage = (name) => {
    report.stage = name;
    process.stderr.write(JSON.stringify({ phase: name, at: new Date().toISOString() }) + '\n');
  };
  const passed = (name) => report.checks.push({ name, status: 'passed' });
  async function health() {
    const deadline = Date.now() + 210_000;
    while (Date.now() < deadline) {
      const inspected = await jsonCommand('docker', ['inspect', service]);
      const state = inspected[0]?.State;
      if (state?.Health?.Status === 'healthy') return;
      requireCheck(
        state?.Running === true && state?.Health?.Status !== 'unhealthy',
        'container-unhealthy',
      );
      await new Promise((done) => setTimeout(done, 2000));
    }
    throw new Error('container-health-timeout');
  }
  try {
    requireCheck(hostname().split('.')[0].toLowerCase() === 'gk50', 'unexpected-deployment-host');
    requireCheck(
      !process.env.DOCKER_HOST || process.env.DOCKER_HOST === 'unix:///var/run/docker.sock',
      'nonlocal-docker-refused',
    );
    const endpoint = (
      await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
    ).stdout.trim();
    requireCheck(endpoint === 'unix:///var/run/docker.sock', 'nonlocal-docker-refused');
    const containers = (
      await command('docker', [
        'ps',
        '-aq',
        '--filter',
        `label=com.docker.compose.project=${service}`,
      ])
    ).stdout.trim();
    const named = (
      await command('docker', ['ps', '-aq', '--filter', `name=^/${service}$`])
    ).stdout.trim();
    requireCheck(
      values.accept ? Boolean(containers && named && containers === named) : !containers && !named,
      values.accept ? 'deployment-not-found-or-ambiguous' : 'existing-deployment-refused',
    );
    const rootExists = await fs.lstat(root).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    requireCheck(
      values.accept ? rootExists : !rootExists,
      values.accept ? 'deployment-directory-missing' : 'deployment-directory-exists',
    );
    let port;
    if (!values.accept) {
      port = choosePort((await command('ss', ['-lntH'])).stdout);
      report.port = port;
      passed('dedicated-project-and-free-ports');
    }
    let expectedCommit;
    if (values.publish) {
      stage('dispatch-publication');
      requireCheck(
        !(await command('git', ['status', '--porcelain'])).stdout.trim(),
        'dirty-source-refused',
      );
      expectedCommit = (await command('git', ['rev-parse', 'HEAD'])).stdout.trim();
      const branch = (await command('git', ['branch', '--show-current'])).stdout.trim();
      requireCheck(branch.length > 0, 'detached-source-refused');
      const remote = await jsonCommand('gh', ['api', `repos/${repo}/git/ref/heads/${branch}`]);
      requireCheck(remote.object?.sha === expectedCommit, 'remote-source-mismatch');
      const dispatched = await command('gh', [
        'workflow',
        'run',
        'gui-container.yml',
        '--repo',
        repo,
        '--ref',
        branch,
        '-f',
        'publish_image=true',
        '-f',
        'confirmation=PUBLISH_GUI_IMAGE',
      ]);
      report.mutations.push('dispatched-github-publication');
      const matched = dispatched.stdout.match(
        /https:\/\/github\.com\/404404\/AI-Bots\/actions\/runs\/(\d+)/i,
      );
      requireCheck(matched, 'workflow-dispatch-id-unavailable');
      values['run-id'] = matched[1];
      report.runId = matched[1];
      stage('wait-for-production-ci-and-publication');
      await command(
        'gh',
        ['run', 'watch', matched[1], '--repo', repo, '--exit-status', '--interval', '30'],
        { timeout: 75 * 60_000 },
      );
    }
    const run = await jsonCommand('gh', [
      'run',
      'view',
      values['run-id'],
      '--repo',
      repo,
      '--json',
      'databaseId,headSha,status,conclusion,workflowName,url',
    ]);
    requireCheck(
      run.status === 'completed' && run.conclusion === 'success',
      'release-run-not-passed',
    );
    requireCheck(!expectedCommit || run.headSha === expectedCommit, 'dispatched-source-mismatch');
    temp = await fs.mkdtemp(join(tmpdir(), 'gui-release-'));
    await fs.chmod(temp, 0o700);
    await command('gh', [
      'run',
      'download',
      values['run-id'],
      '--repo',
      repo,
      '--name',
      `gui-release-${values['run-id']}`,
      '--dir',
      temp,
    ]);
    const receipt = JSON.parse(await fs.readFile(join(temp, 'release.json'), 'utf8'));
    const compose = await fs.readFile(join(source, 'deploy/compose.gk50.yml'));
    const seccomp = await fs.readFile(join(source, 'deploy/chromium-userns-seccomp.json'));
    validateRelease(receipt, run, compose, seccomp);
    report.release = receipt;
    passed('production-ci-and-config-identity');
    if (values.accept) {
      requireCheck(
        (await fs.lstat(root)).isDirectory() && !(await fs.lstat(root)).isSymbolicLink(),
        'deployment-directory-invalid',
      );
      const saved = JSON.parse(await fs.readFile(join(root, 'release.json'), 'utf8'));
      requireCheck(JSON.stringify(saved) === JSON.stringify(receipt), 'installed-release-mismatch');
      const installed = (await jsonCommand('docker', ['inspect', service]))[0];
      const image = (await jsonCommand('docker', ['image', 'inspect', receipt.imageRef]))[0];
      const manifest = (
        await command('docker', ['buildx', 'imagetools', 'inspect', '--raw', receipt.imageRef])
      ).stdout;
      port = validateInstalledDeployment(
        receipt,
        installed,
        root,
        await fs.readFile(join(root, 'compose.yml')),
        await fs.readFile(join(root, 'chromium-userns-seccomp.json')),
        await fs.readFile(join(root, '.env'), 'utf8'),
        image,
        manifest,
      );
      report.port = port;
      passed('existing-deployment-identity');
    }
    if (!values.execute) {
      report.status = 'ready';
      return;
    }
    if (!values.accept) {
      stage('prepare-compose');
      await fs.mkdir(dirname(root), { recursive: true, mode: 0o700 });
      await fs.mkdir(root, { mode: 0o700 });
      created = true;
      report.mutations.push('created-dedicated-deployment-directory');
      await fs.mkdir(join(root, 'data'), { mode: 0o700 });
      if (process.getuid() === 0) {
        await fs.chown(join(root, 'data'), runtimeUid, runtimeGid);
      } else {
        await command('sudo', [
          '-n',
          'chown',
          '--',
          `${runtimeUid}:${runtimeGid}`,
          join(root, 'data'),
        ]);
      }
      const dataOwner = await fs.stat(join(root, 'data'));
      requireCheck(
        dataOwner.uid === runtimeUid && dataOwner.gid === runtimeGid,
        'data-owner-mismatch',
      );
      report.mutations.push('assigned-empty-data-directory-to-runtime-user');
      await fs.mkdir(join(root, 'evidence'), { mode: 0o700 });
      await fs.writeFile(join(root, 'compose.yml'), compose, { mode: 0o600 });
      await fs.writeFile(join(root, 'chromium-userns-seccomp.json'), seccomp, { mode: 0o600 });
      await fs.writeFile(
        join(root, '.env'),
        `IMAGE_REF=${receipt.imageRef}\nPUID=${runtimeUid}\nPGID=${runtimeGid}\nHOST_PORT=${port}\nPUBLIC_URL=http://127.0.0.1:${port}\nWORKSPACE_ID=${service}\nCODEX_CALLBACK_PORT=1455\n`,
        { mode: 0o600 },
      );
      await privateJson(join(root, 'release.json'), receipt);
      await docker(['config', '--quiet']);
      stage('pull-accepted-image');
      await docker(['pull'], { timeout: 20 * 60_000 });
      report.mutations.push('pulled-accepted-image');
      const image = (await jsonCommand('docker', ['image', 'inspect', receipt.imageRef]))[0];
      const manifest = (
        await command('docker', ['buildx', 'imagetools', 'inspect', '--raw', receipt.imageRef])
      ).stdout;
      report.localImageId = validatePulledImage(receipt, image, manifest);
      passed('pulled-image-matches-tested-image');
      stage('start-compose');
      started = true;
      report.mutations.push('attempted-compose-start');
      await docker(['up', '-d', '--no-build', '--pull', 'never'], { timeout: 120_000 });
      await health();
      passed('container-health');
    } else {
      created = true;
      stage('existing-container-health');
      await health();
      passed('existing-container-health');
    }
    if (values['deploy-only']) {
      report.status = 'deployed-awaiting-acceptance';
      report.fullAcceptance = 'not-run';
      report.remaining.unshift('gk50-gui-cli-and-restart-acceptance');
      return;
    }
    await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    report.evidenceDirectory = evidenceDir;
    stage('gui-acceptance');
    const gui = guiReport(
      (
        await docker(
          [
            'exec',
            '-T',
            '-e',
            'DISPLAY=:99',
            '-e',
            'XAUTHORITY=/tmp/dsh-runtime/Xauthority',
            '-e',
            'GUI_ACCEPTANCE_SCREENSHOT=/data/dsh/acceptance-desktop.png',
            service,
            'dbus-run-session',
            '--',
            'bash',
            '/opt/app/deploy/run-gui-acceptance-session.sh',
          ],
          { timeout: 240_000 },
        )
      ).stdout,
    );
    await privateJson(join(evidenceDir, 'gui.json'), gui);
    await command('docker', [
      'cp',
      `${service}:/data/dsh/acceptance-desktop.png`,
      join(evidenceDir, 'desktop.png'),
    ]);
    await fs.chmod(join(evidenceDir, 'desktop.png'), 0o600);
    passed('browser-computer-shared-display-and-sandbox');
    stage('authenticated-cli');
    const fixture = JSON.parse(
      (await exec(['node', '/opt/app/deploy/seed-cli-acceptance.mjs'])).stdout,
    );
    requireCheck(
      fixture.status === 'passed' &&
        typeof fixture.botId === 'string' &&
        typeof fixture.channelId === 'string',
      'cli-fixture-failed',
    );
    const snapshot = async (input) =>
      JSON.parse(
        (
          await exec(
            [
              'node',
              '/opt/app/deploy/cli-host-snapshot.mjs',
              ...(input ? ['--launch-stdin'] : ['--launch', '/tmp/dsh-runtime/launch.json']),
            ],
            { input, allowFailure: Boolean(input) },
          )
        ).stdout,
      );
    const cli = async (after) => {
      const args = [
        'node',
        '/opt/app/deploy/run-cli-readonly-acceptance.mjs',
        '--bot',
        fixture.botId,
        '--channel',
        fixture.channelId,
      ];
      if (after) args.push('--prior-report', '/data/dsh/acceptance-cli-before.json');
      else args.push('--output', '/data/dsh/acceptance-cli-before.json');
      const value = JSON.parse((await exec(args, { timeout: 120_000 })).stdout);
      requireCheck(value.status === 'passed', 'cli-acceptance-failed');
      await privateJson(join(evidenceDir, `cli-${after ? 'after' : 'before'}.json`), value);
      return value;
    };
    const before = await snapshot();
    requireCheck(
      before.authenticated === true && before.botIds.includes(fixture.botId),
      'cli-auth-failed',
    );
    await cli(false);
    passed('authenticated-cli-before-restart');
    const oldLaunch = (await exec(['cat', '/tmp/dsh-runtime/launch.json'])).stdout;
    stage('restart-acceptance');
    await docker(['restart', '--timeout', '30', service], { timeout: 120_000 });
    await health();
    const stale = await snapshot(oldLaunch);
    requireCheck(
      stale.authenticated === false && stale.errorCode === 'host-unauthorized',
      'old-token-not-explicitly-rejected',
    );
    const after = await snapshot();
    requireCheck(
      after.authenticated === true &&
        JSON.stringify(before.botIds) === JSON.stringify(after.botIds),
      'bot-persistence-failed',
    );
    const cliAfter = await cli(true);
    requireCheck(cliAfter.hostRestartRecovery?.sameBotId === true, 'cli-restart-recovery-failed');
    await privateJson(join(evidenceDir, 'restart.json'), {
      before,
      after,
      staleLaunchToken: stale,
    });
    passed('old-token-rejected-new-token-works-bot-persisted');
    report.status = 'infrastructure-passed';
    report.fullAcceptance = 'incomplete';
    report.remaining.push('nonempty-session-and-assignment-pagination');
  } catch (error) {
    report.status = 'failed';
    report.failureCode = /^[a-z][a-z0-9-]{1,79}$/.test(error.message)
      ? error.message
      : 'deployment-failed';
    process.exitCode = 1;
    if (started) {
      try {
        await docker(['stop', '--timeout', '30', service], { timeout: 90_000 });
        report.mutations.push('stopped-failed-candidate-data-retained');
      } catch {
        report.cleanup = 'stop-failed-manual-attention-required';
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    if (created) {
      await privateJson(
        join(root, values['deploy-only'] ? 'deployment.json' : 'acceptance.json'),
        report,
      );
      await privateJson(
        join(root, `${values['deploy-only'] ? 'deployment' : 'acceptance'}-${attempt}.json`),
        report,
      );
    }
    if (temp) await fs.rm(temp, { recursive: true, force: true });
    console.log(JSON.stringify(report, null, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        status: 'failed',
        failureCode: 'invalid-invocation-or-report-write',
      }),
    );
    process.exitCode = 1;
  });
}

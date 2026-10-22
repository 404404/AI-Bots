#!/usr/bin/env node

import { chmodSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'compose-file': { type: 'string', default: 'deploy/compose.gk50.yml' },
    'env-file': { type: 'string', default: 'deploy/.env' },
    output: { type: 'string', default: 'deploy/acceptance-host-restart.json' },
    'service-name': { type: 'string', default: 'deepseekbot-gui' },
  },
});
const composeArgs = ['compose', '-f', resolve(values['compose-file'])];
try {
  composeArgs.push('--env-file', resolve(values['env-file']));
  execFileSync('docker', [...composeArgs, 'config', '--quiet'], { stdio: 'ignore' });
} catch {
  composeArgs.pop();
  composeArgs.pop();
  execFileSync('docker', [...composeArgs, 'config', '--quiet'], { stdio: 'ignore' });
}
const service = values['service-name'];
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), checks: [] };
function run(args, options = {}) {
  const output = execFileSync('docker', [...composeArgs, ...args], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
}
function snapshot() {
  return JSON.parse(
    run([
      'exec',
      '-T',
      service,
      'node',
      '/opt/app/deploy/cli-host-snapshot.mjs',
      '--launch',
      '/tmp/dsh-runtime/launch.json',
    ]),
  );
}
try {
  const previousLaunch = run(['exec', '-T', service, 'cat', '/tmp/dsh-runtime/launch.json']);
  const before = snapshot();
  if (before.authenticated !== true) throw new Error('before-auth-failed');
  report.before = before;
  report.checks.push({ name: 'online-cli-auth-before-restart', status: 'passed' });
  run(['restart', '--timeout', '30', service], { stdio: 'ignore' });
  const deadline = Date.now() + 150_000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      healthy =
        run(['exec', '-T', service, 'node', '/opt/app/deploy/container-healthcheck.mjs'], {
          stdio: 'ignore',
        }) === '';
      if (healthy) break;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 2500));
  }
  if (!healthy) throw new Error('host-health-timeout');
  report.checks.push({ name: 'host-restart-healthcheck', status: 'passed' });
  const stale = spawnSync(
    'docker',
    [
      ...composeArgs,
      'exec',
      '-T',
      '-i',
      service,
      'node',
      '/opt/app/deploy/cli-host-snapshot.mjs',
      '--launch-stdin',
    ],
    {
      input: previousLaunch,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1_000_000,
    },
  );
  let staleResult;
  try {
    staleResult = JSON.parse(stale.stdout ?? '');
  } catch {
    throw new Error('stale-token-probe-invalid');
  }
  if (stale.status === 0 || staleResult.authenticated !== false)
    throw new Error('old-launch-token-still-authenticated');
  report.staleLaunchToken = { rejected: true, errorCode: staleResult.errorCode ?? 'rejected' };
  report.checks.push({
    name: 'old-launch-token-rejected',
    status: 'passed',
    errorCode: report.staleLaunchToken.errorCode,
  });
  const after = snapshot();
  if (after.authenticated !== true) throw new Error('after-auth-failed');
  const sameBotIds = JSON.stringify(before.botIds) === JSON.stringify(after.botIds);
  report.after = after;
  report.hostRestartRecovery = { sameBotIds, botCount: after.botCount };
  if (!sameBotIds) throw new Error('stable-bot-ids-changed');
  report.checks.push({
    name: 'stable-bot-ids-after-restart',
    status: 'passed',
    botCount: after.botCount,
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failureCode = [
    'before-auth-failed',
    'host-health-timeout',
    'stale-token-probe-invalid',
    'old-launch-token-still-authenticated',
    'after-auth-failed',
    'stable-bot-ids-changed',
  ].includes(error.message)
    ? error.message
    : 'restart-acceptance-failed';
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  const file = resolve(values.output);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

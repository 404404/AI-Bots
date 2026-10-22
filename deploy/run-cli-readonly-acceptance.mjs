#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { startLoopbackHostProxy } from './loopback-host-proxy.mjs';

const { values } = parseArgs({
  options: {
    bot: { type: 'string' },
    channel: { type: 'string' },
    limit: { type: 'string', default: '20' },
    'prior-report': { type: 'string' },
    output: { type: 'string' },
  },
});

const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u;
if (!values.bot || !identifierPattern.test(values.bot))
  throw new Error('Invalid --bot fixture ID.');
if (!values.channel || !identifierPattern.test(values.channel))
  throw new Error('Invalid --channel fixture ID.');
if (!/^\d+$/u.test(values.limit) || Number(values.limit) < 1 || Number(values.limit) > 100)
  throw new Error('Invalid --limit.');

const launch = JSON.parse(readFileSync('/tmp/dsh-runtime/launch.json', 'utf8'));
const token = new URL(launch.internalUrl ?? launch.url).searchParams.get('token');
const address = readFileSync('/tmp/dsh-runtime/listen-address', 'utf8').trim();
const port = process.env['DSH_PORT'] ?? '3080';
if (!token) throw new Error('Host launch token is missing.');
if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address) || !/^\d{1,5}$/u.test(port))
  throw new Error('Host listener address is invalid.');
const numericPort = Number(port);
if (numericPort < 1 || numericPort > 65535) throw new Error('Host listener port is invalid.');
const launchUrl = new URL(launch.internalUrl ?? launch.url);
if (launchUrl.protocol !== 'http:' || launchUrl.hostname !== address || launchUrl.port !== port)
  throw new Error('Host listener address does not match the private launch origin.');

let proxy;
let child;
try {
  proxy = await startLoopbackHostProxy(`http://${address}:${numericPort}`);
  const args = [
    '/opt/app/scripts/e2e-cli-readonly.mjs',
    '--launch',
    '/tmp/dsh-runtime/launch.json',
    '--bot',
    values.bot,
    '--channel',
    values.channel,
    '--limit',
    values.limit,
  ];
  if (values['prior-report']) args.push('--prior-report', values['prior-report']);
  if (values.output) args.push('--output', values.output);
  child = spawn(process.execPath, args, {
    cwd: '/opt/app',
    env: { ...process.env, DEEPSEEKBOT_HOST: proxy.origin },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  child.stdout.pipe(process.stdout);
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (typeof status === 'number') process.exitCode = status;
  else process.exitCode = 1;
} catch {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, status: 'failed', errorCode: 'cli-acceptance-launch-failed' })}\n`,
  );
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await proxy?.close().catch(() => undefined);
}

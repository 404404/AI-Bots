#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

async function input() {
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (part) => (value += part));
    process.stdin.on('end', () => resolve(value));
    process.stdin.on('error', reject);
  });
}

let launch;
try {
  const fromStdin = process.argv.includes('--launch-stdin');
  launch = fromStdin
    ? JSON.parse(await input())
    : JSON.parse(readFileSync(process.argv[process.argv.indexOf('--launch') + 1], 'utf8'));
  const login = new URL(launch.internalUrl ?? launch.url);
  if (fromStdin) {
    login.hostname = readFileSync('/tmp/dsh-runtime/listen-address', 'utf8').trim();
    login.port = process.env['DSH_PORT'] ?? '3080';
  }
  const token = login.searchParams.get('token');
  if (!token) throw new Error('missing token');
  const result = spawnSync(
    process.execPath,
    ['/opt/app/packages/deepseekbot/dist/deepseekbot.mjs', 'list', '--compact'],
    {
      env: { ...process.env, DEEPSEEKBOT_HOST: login.origin, DEEPSEEKBOT_HOST_TOKEN: token },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (result.error) throw new Error('CLI execution failed');
  let value;
  try {
    value = JSON.parse(result.stdout ?? '');
  } catch {
    throw new Error('CLI did not return JSON');
  }
  if (result.status !== 0 || value?.error) {
    const errorCode = typeof value?.error?.code === 'string' ? value.error.code : 'command-failed';
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, authenticated: false, errorCode })}\n`,
    );
    process.exitCode = 1;
  } else {
    const slugs = Array.isArray(value.bots)
      ? value.bots
          .map((bot) => bot.slug)
          .filter((slug) => typeof slug === 'string')
          .sort()
      : [];
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, authenticated: true, capturedAt: new Date().toISOString(), botIds: slugs, botCount: slugs.length })}\n`,
    );
  }
} catch {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, authenticated: false, errorCode: 'snapshot-failed' })}\n`,
  );
  process.exitCode = 1;
}

#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { startLoopbackHostProxy } from './loopback-host-proxy.mjs';

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
  const token = login.searchParams.get('token');
  if (!token) throw new Error('missing token');
  const address = readFileSync('/tmp/dsh-runtime/listen-address', 'utf8').trim();
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) throw new Error('invalid Host address');
  const port = process.env['DSH_PORT'] ?? '3080';
  if (!/^\d{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('invalid Host port');
  const proxy = await startLoopbackHostProxy(`http://${address}:${port}`);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['/opt/app/packages/deepseekbot/dist/deepseekbot.mjs', 'list', '--compact'],
        {
          env: {
            ...process.env,
            DEEPSEEKBOT_HOST: proxy.origin,
            DEEPSEEKBOT_HOST_TOKEN: token,
          },
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 30_000,
        },
      );
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > 2 * 1024 * 1024) child.kill('SIGTERM');
      });
      child.once('error', reject);
      child.once('close', (status) => resolve({ stdout, status }));
    });
  } finally {
    await proxy.close();
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
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

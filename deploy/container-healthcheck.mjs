#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const file = '/tmp/dsh-runtime/launch.json';
try {
  const launch = JSON.parse(readFileSync(file, 'utf8'));
  const loginUrl = new URL(launch.url);
  const token = loginUrl.searchParams.get('token');
  if (!token) throw new Error('no-token');
  const listenAddress = readFileSync('/tmp/dsh-runtime/listen-address', 'utf8').trim();
  const base = `http://${listenAddress}:${process.env['DSH_PORT'] ?? '3080'}`;
  await fetch(`${base}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3000),
  });
  const login = await fetch(`${base}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3000),
  });
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('no-cookie');
  const response = await fetch(`${base}/api/botharness/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'container-healthcheck',
      method: 'botharness/list',
      payload: { args: {} },
    }),
    signal: AbortSignal.timeout(5000),
  });
  const envelope = await response.json();
  if (!response.ok || envelope?.result?.ok !== true) throw new Error('rpc-failed');
} catch {
  process.exitCode = 1;
}

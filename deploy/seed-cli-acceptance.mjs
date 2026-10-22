#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const codePattern = /^[a-z0-9][a-z0-9-]{0,79}$/u;

async function run() {
  const launch = JSON.parse(readFileSync('/tmp/dsh-runtime/launch.json', 'utf8'));
  const launchUrl = new URL(launch.internalUrl ?? launch.url);
  const token = launchUrl.searchParams.get('token');
  const address = readFileSync('/tmp/dsh-runtime/listen-address', 'utf8').trim();
  const port = process.env['DSH_PORT'] ?? '3080';
  if (!token) throw Object.assign(new Error(), { code: 'host-token-missing' });
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address) || !/^\d{1,5}$/u.test(port))
    throw Object.assign(new Error(), { code: 'host-address-invalid' });
  const numericPort = Number(port);
  if (numericPort < 1 || numericPort > 65535)
    throw Object.assign(new Error(), { code: 'host-address-invalid' });
  if (launchUrl.protocol !== 'http:' || launchUrl.hostname !== address || launchUrl.port !== port)
    throw Object.assign(new Error(), { code: 'host-address-invalid' });
  const base = `http://${address}:${numericPort}`;
  const loginUrl = `${base}/?token=${encodeURIComponent(token)}`;
  await fetch(loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
  const login = await fetch(loginUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3000),
  });
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw Object.assign(new Error(), { code: 'host-session-cookie-missing' });

  async function rpc(method, args) {
    const response = await fetch(`${base}/api/botharness/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `gui-cli-fixture-${randomUUID()}`,
        method: `botharness/${method}`,
        payload: { args },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const envelope = await response.json().catch(() => undefined);
    if (response.status !== 200 || envelope?.result?.ok !== true) {
      const reported = envelope?.result?.error?.code;
      const code =
        typeof reported === 'string' && codePattern.test(reported) ? reported : 'host-rpc-failed';
      throw Object.assign(new Error(), { code });
    }
    return envelope.result.value;
  }

  const botName = 'GUI Container CLI Acceptance';
  const listed = await rpc('list', {});
  const existing = Array.isArray(listed.bots)
    ? listed.bots.find((bot) => bot.displayName === botName)
    : undefined;
  const bot = existing ?? (await rpc('create', { displayName: botName })).bot;
  if (typeof bot?.slug !== 'string' || bot.slug.length === 0)
    throw Object.assign(new Error(), { code: 'bot-fixture-create-failed' });
  const dm = await rpc('channelDm', { slug: bot.slug });
  if (typeof dm.channel?.id !== 'string' || dm.channel.id.length === 0)
    throw Object.assign(new Error(), { code: 'channel-fixture-create-failed' });

  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, status: 'passed', botId: bot.slug, channelId: dm.channel.id, created: !existing })}\n`,
  );
}

try {
  await run();
} catch (error) {
  const code =
    typeof error?.code === 'string' && codePattern.test(error.code)
      ? error.code
      : 'host-fixture-seed-failed';
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, status: 'failed', errorCode: code })}\n`,
  );
  process.exitCode = 1;
}

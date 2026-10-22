#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { copyProfileSeed } from './copy-profile-seed.mjs';

const dataHome = process.env['DSH_HOME'] ?? '/data/dsh';
const runtimeDir = '/tmp/dsh-runtime';
const launchFile = `${runtimeDir}/launch.json`;
const profileDir = `${dataHome}/profiles/gui`;
const port = Number(process.env['DSH_PORT'] ?? '3080');
const publicUrl = new URL(process.env['PUBLIC_URL'] ?? 'http://127.0.0.1:20443');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DSH_PORT.');
if (publicUrl.protocol !== 'http:' && publicUrl.protocol !== 'https:')
  throw new Error('PUBLIC_URL must be HTTP or HTTPS.');
mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
mkdirSync(dataHome, { recursive: true });
mkdirSync(`${dataHome}/runtime-home`, { recursive: true });
if (!existsSync(profileDir)) {
  if (existsSync(`${dataHome}/profiles`)) {
    const entries = (await import('node:fs')).readdirSync(`${dataHome}/profiles`);
    if (entries.length > 0)
      throw new Error(
        'This Compose data directory already contains DSH profiles; refusing to seed over user data. Choose an empty directory or provision the gui profile explicitly.',
      );
  }
  copyProfileSeed('/opt/dsh-seed/profiles', `${dataHome}/profiles`);
}
if (!existsSync(`${profileDir}/package.json`))
  throw new Error('The persistent DSH Home does not contain the seeded gui profile.');
if (!existsSync(`${profileDir}/node_modules/deepseekbot/package.json`))
  throw new Error(
    'The gui profile dependencies are missing; refusing to run an incomplete profile.',
  );
const computerDriver = `${dataHome}/runtime-home/.botharness/cua-driver/0.31.0/linux-x86_64/cua-driver`;
if (!existsSync(computerDriver)) {
  const { copyFileSync } = await import('node:fs');
  mkdirSync(`${dataHome}/runtime-home/.botharness/cua-driver/0.31.0/linux-x86_64`, {
    recursive: true,
  });
  copyFileSync('/opt/cua-driver/0.31.0/linux-x86_64/cua-driver', computerDriver);
  chmodSync(computerDriver, 0o755);
}

const addresses = spawn(
  'sh',
  ['-lc', "ip -o -4 addr show dev eth0 | awk '{print $4}' | cut -d/ -f1 | head -n1"],
  { stdio: ['ignore', 'pipe', 'ignore'] },
);
let address = '';
for await (const chunk of addresses.stdout) address += chunk.toString();
if (
  (await new Promise((resolve) => addresses.on('close', resolve))) !== 0 ||
  !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address.trim())
)
  throw new Error('Cannot determine this container’s concrete IPv4 address for the DSH listener.');
address = address.trim();
writeFileSync(`${runtimeDir}/listen-address`, `${address}\n`, { mode: 0o600 });

const xauthority = `${runtimeDir}/Xauthority`;
const cookie = spawn('mcookie', [], { stdio: ['ignore', 'pipe', 'ignore'] });
let cookieValue = '';
for await (const chunk of cookie.stdout) cookieValue += chunk.toString();
if (
  (await new Promise((resolve) => cookie.on('close', resolve))) !== 0 ||
  !/^[a-f0-9]+\s*$/iu.test(cookieValue)
)
  throw new Error('Could not create the private X11 cookie.');
writeFileSync(xauthority, '', { mode: 0o600 });
const addCookie = spawn(
  'xauth',
  ['-f', xauthority, 'add', ':99', 'MIT-MAGIC-COOKIE-1', cookieValue.trim()],
  { stdio: 'ignore' },
);
if ((await new Promise((resolve) => addCookie.on('close', resolve))) !== 0)
  throw new Error('Could not create the X11 authority file.');
chmodSync(xauthority, 0o600);
const env = {
  ...process.env,
  DISPLAY: ':99',
  XAUTHORITY: xauthority,
  HOME: `${dataHome}/runtime-home`,
  DSH_HOME: dataHome,
};
const xvfb = spawn(
  'Xvfb',
  [':99', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp', '-auth', xauthority],
  { env, stdio: 'ignore' },
);
const auxiliaries = [xvfb];
let stopping = false;
let host;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  if (host?.pid) {
    try {
      process.kill(-host.pid, signal);
    } catch {
      host.kill(signal);
    }
  }
  try {
    const openboxPid = Number(readFileSync(`${runtimeDir}/openbox.pid`, 'utf8'));
    if (Number.isSafeInteger(openboxPid) && openboxPid > 1) process.kill(openboxPid, signal);
  } catch {}
  for (const child of auxiliaries) child.kill(signal);
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
try {
  await delay(600);
  if (xvfb.exitCode !== null) throw new Error('Xvfb exited during GUI startup.');
  const dsh = '/opt/app/node_modules/@deepseek-ai/dsh/lib/bin.js';
  const args = [
    dsh,
    '--profile',
    'gui',
    '--host',
    address,
    '--port',
    String(port),
    '--public-url',
    publicUrl.toString().replace(/\/$/u, ''),
    '--trusted-host',
    publicUrl.host,
    '--trusted-host',
    `${address}:${port}`,
    '--patch',
    '/opt/app/deploy/gui-profile.patch.yml',
    '--no-open',
  ];
  const command = spawn(
    'dbus-run-session',
    [
      '--',
      'sh',
      '-c',
      'openbox & echo "$!" > /tmp/dsh-runtime/openbox.pid; exec "$@"',
      'dsh-host',
      process.execPath,
      ...args,
    ],
    {
      cwd: '/opt/app',
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  host = command;
  const tokenPattern = /https?:\/\/[^\s"'<>]+\/\?token=([A-Za-z0-9._-]+)/u;
  for (const stream of [command.stdout, command.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (data) => {
      pending += data;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const match = tokenPattern.exec(line);
        if (match) {
          const login = new URL(match[0]);
          const internalUrl = new URL(login);
          internalUrl.hostname = address;
          internalUrl.port = String(port);
          writeFileSync(
            launchFile,
            `${JSON.stringify({ url: login.toString(), internalUrl: internalUrl.toString(), issuedAt: new Date().toISOString() })}\n`,
            { mode: 0o600 },
          );
          chmodSync(launchFile, 0o600);
          console.log(
            'DSH Host issued a private launch token; the URL is stored in a mode-0600 runtime file.',
          );
          continue;
        }
        if (/[?&]token=[A-Za-z0-9._-]+/u.test(line))
          console.log('[redacted] DSH output containing a launch token.');
        else if (line) console.log(line);
      }
    });
  }
  let openboxPid;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (xvfb.exitCode !== null) throw new Error('Xvfb exited during GUI startup.');
    if (command.exitCode !== null)
      throw new Error('DSH GUI Host exited before Openbox became ready.');
    try {
      openboxPid = Number(readFileSync(`${runtimeDir}/openbox.pid`, 'utf8'));
      if (Number.isSafeInteger(openboxPid) && openboxPid > 1) {
        process.kill(openboxPid, 0);
        break;
      }
    } catch {
      openboxPid = undefined;
    }
    await delay(100);
  }
  if (!openboxPid) throw new Error('Openbox did not start inside the D-Bus session.');
  const exit = await new Promise((resolve) => command.on('close', resolve));
  if (!stopping) process.exitCode = exit ?? 1;
} finally {
  stop();
}

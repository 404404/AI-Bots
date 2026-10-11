import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IM_TEST_APPS_PATH = join(homedir(), '.config', 'botharness', 'im-test-apps.env');
export const IM_TEST_SLOTS = ['QA1', 'QA2', 'QA3'];

export function imTestAppsPath(environment = process.env) {
  return resolve(environment.BOTHARNESS_IM_TEST_APPS_ENV || IM_TEST_APPS_PATH);
}

export function protectImTestApps(path = imTestAppsPath()) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    execFileSync(
      'icacls.exe',
      [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)(F)`, '*S-1-5-18:(OI)(CI)(F)'],
      { stdio: 'pipe' },
    );
    if (existsSync(path))
      execFileSync(
        'icacls.exe',
        [path, '/inheritance:r', '/grant:r', `${user}:(F)`, '*S-1-5-18:(F)'],
        { stdio: 'pipe' },
      );
  } else {
    chmodSync(directory, 0o700);
    if (existsSync(path)) chmodSync(path, 0o600);
  }
}

function parseValues(text) {
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^(BH_IM_QA_SLOT|BH_LARK_QA[123]_[A-Z_]+)=(.*)$/u.exec(line);
    if (!match) throw new Error('Invalid IM test App configuration; use the setup wizard');
    if (Object.hasOwn(values, match[1])) throw new Error('Duplicate IM test App configuration key');
    values[match[1]] = match[2];
  }
  return values;
}

function readValues(path) {
  if (!existsSync(path)) return {};
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0)
    throw new Error('IM test App file must be private (chmod 600)');
  return parseValues(readFileSync(path, 'utf8'));
}

export function saveImTestAppValues(text, { path = imTestAppsPath() } = {}) {
  const updates = parseValues(text);
  if (Object.keys(updates).length === 0) throw new Error('No IM test App updates provided');
  protectImTestApps(path);
  readValues(path);
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/u) : [];
  while (lines.at(-1) === '') lines.pop();
  const pending = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const key = line.slice(0, line.indexOf('='));
    if (!pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  next.push(...[...pending].map(([key, value]) => `${key}=${value}`));
  const temporary = join(dirname(path), `.im-test-apps-${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, 'wx', 0o600);
  let open = true;
  try {
    writeFileSync(descriptor, next.join('\n') + '\n');
    closeSync(descriptor);
    open = false;
    renameSync(temporary, path);
  } finally {
    if (open) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

function displayName(value) {
  return value?.replace(/[\u0000-\u001f\u007f]/gu, '').trim() || undefined;
}

export function loadImTestApp(slot, { path = imTestAppsPath() } = {}) {
  const values = readValues(path);
  const selected = slot ?? values.BH_IM_QA_SLOT;
  if (!IM_TEST_SLOTS.includes(selected)) throw new Error('Select an IM test slot: QA1, QA2 or QA3');
  const prefix = `BH_LARK_${selected}`;
  const name = displayName(values[`${prefix}_NAME`]);
  const appId = values[`${prefix}_APP_ID`];
  const appSecret = values[`${prefix}_APP_SECRET`];
  if (
    !name ||
    !/^cli_[A-Za-z0-9_-]+$/u.test(appId ?? '') ||
    !/^[A-Za-z0-9_-]+$/u.test(appSecret ?? '')
  )
    throw new Error(`IM test slot ${selected} is incomplete; run setup`);
  if (values[`${prefix}_DOMAIN`] !== 'lark')
    throw new Error('IM test slot must select the Lark domain');
  return {
    slot: selected,
    name,
    domain: 'lark',
    appId,
    appSecret,
    consoleReady: values[`${prefix}_CONSOLE_READY`] === 'yes',
    receiverCheckedAt: values[`${prefix}_RECEIVER_CHECKED_AT`] || undefined,
  };
}

export function listImTestApps({ path = imTestAppsPath() } = {}) {
  const values = readValues(path);
  return IM_TEST_SLOTS.map((slot) => {
    const prefix = `BH_LARK_${slot}`;
    return {
      slot,
      name: displayName(values[`${prefix}_NAME`]) || null,
      credentialsConfigured: Boolean(values[`${prefix}_APP_ID`] && values[`${prefix}_APP_SECRET`]),
      consoleReady: values[`${prefix}_CONSOLE_READY`] === 'yes',
      receiverCheckedAt: values[`${prefix}_RECEIVER_CHECKED_AT`] || null,
      receiverAvailability: 'requires-current-window-confirmation',
    };
  });
}

function setup() {
  const script = fileURLToPath(new URL('./setup-lark-test-app.sh', import.meta.url));
  let bash = 'bash';
  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      join(process.env.LOCALAPPDATA ?? homedir(), 'Programs'),
    ]
      .filter(Boolean)
      .map((root) => join(root, 'Git', 'bin', 'bash.exe'));
    bash = candidates.find((path) => existsSync(path));
    if (!bash)
      throw new Error(
        'Git Bash is required on Windows; install Git for Windows. WSL bash uses a different home directory.',
      );
  }
  console.log('正在准备本机私密配置文件；此步骤不会连接 Lark。');
  const result = spawnSync(bash, [script.replaceAll('\\', '/')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      BOTHARNESS_IM_TEST_APPS_ENV: imTestAppsPath().replaceAll('\\', '/'),
      ...(process.platform === 'win32' ? { TERM: 'dumb' } : {}),
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command = 'list', ...args] = process.argv.slice(2);
    if (command === 'list' && args.length === 0) {
      console.log(JSON.stringify({ path: imTestAppsPath(), apps: listImTestApps() }, null, 2));
    } else if (command === 'setup' && args.length === 0) {
      setup();
    } else if (command === 'protect' && args.length === 1) {
      const path = resolve(args[0]);
      protectImTestApps(path);
      if (!existsSync(path)) writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
    } else if (command === 'save' && args.length === 0) {
      saveImTestAppValues(readFileSync(0, 'utf8'));
    } else {
      throw new Error('usage: node scripts/dev-im-test-apps.mjs [list|setup]');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

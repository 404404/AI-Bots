import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  imTestAppsPath,
  listImTestApps,
  loadImTestApp,
  saveImTestAppValues,
} from '../dev-im-test-apps.mjs';

const directories = [];
function fixture(text) {
  const directory = mkdtempSync(join(tmpdir(), 'bh-shared-im-'));
  directories.push(directory);
  const path = join(directory, 'im-test-apps.env');
  writeFileSync(path, text, { mode: 0o600 });
  return { path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const configuration = [
  'BH_IM_QA_SLOT=QA1',
  'BH_LARK_QA1_NAME=BotHarness reusable QA 1',
  'BH_LARK_QA1_DOMAIN=lark',
  'BH_LARK_QA1_APP_ID=cli_test_one',
  'BH_LARK_QA1_APP_SECRET=test-secret-one',
  'BH_LARK_QA1_CONSOLE_READY=yes',
  'BH_LARK_QA1_RECEIVER_CHECKED_AT=2026-10-10T10:00:00Z',
  'BH_LARK_QA2_NAME=BotHarness reusable QA 2',
  'BH_LARK_QA2_DOMAIN=lark',
  'BH_LARK_QA2_APP_ID=cli_test_two',
  'BH_LARK_QA2_APP_SECRET=test-secret-two',
].join('\n');

describe('machine-local reusable IM test Apps', () => {
  it('atomically saves one stage while preserving other Apps, comments and literal values', () => {
    const options = fixture('# private machine-local configuration\n' + configuration);
    const before = loadImTestApp('QA1', options);
    saveImTestAppValues(
      'BH_LARK_QA2_NAME=QA2 $(exit 99) = literal\nBH_LARK_QA2_CONSOLE_READY=yes\n',
      options,
    );
    expect(loadImTestApp('QA1', options)).toEqual(before);
    expect(loadImTestApp('QA2', options)).toMatchObject({
      name: 'QA2 $(exit 99) = literal',
      consoleReady: true,
    });
    expect(readFileSync(options.path, 'utf8')).toContain('# private machine-local configuration');
    expect(readdirSync(directories.at(-1))).toEqual(['im-test-apps.env']);
    if (process.platform !== 'win32') expect(statSync(options.path).mode & 0o077).toBe(0);
  });

  it('refuses malformed or duplicate updates before changing the existing configuration', () => {
    const options = fixture(configuration);
    for (const text of ['', 'UNKNOWN_KEY=value', 'BH_IM_QA_SLOT=QA1\nBH_IM_QA_SLOT=QA2']) {
      expect(() => saveImTestAppValues(text, options)).toThrow();
      expect(readFileSync(options.path, 'utf8')).toBe(configuration);
    }
  });

  it('runs actual setup with synthetic stdin and preserves QA1 without echoing the new secret', () => {
    const options = fixture(configuration);
    const result = spawnSync(process.execPath, ['scripts/dev-im-test-apps.mjs', 'setup'], {
      input: '\nQA2\nSynthetic QA2\ny\ncli_synthetic_two\nSYNTHETIC-WIZARD-SECRET\nn\n',
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, BOTHARNESS_IM_TEST_APPS_ENV: options.path },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('https://open.larksuite.com/app');
    expect(result.stdout).not.toContain('SYNTHETIC-WIZARD-SECRET');
    expect(result.stderr).not.toContain('SYNTHETIC-WIZARD-SECRET');
    expect(loadImTestApp('QA1', options)).toEqual(loadImTestApp('QA1', fixture(configuration)));
    expect(loadImTestApp('QA2', options)).toMatchObject({
      appId: 'cli_synthetic_two',
      appSecret: 'SYNTHETIC-WIZARD-SECRET',
      consoleReady: false,
    });
  });

  it('uses a fixed user path independent of the repository and allows an explicit cross-OS file', () => {
    expect(imTestAppsPath({})).toMatch(/[\\/]\.config[\\/]botharness[\\/]im-test-apps\.env$/u);
    const file = fixture(configuration).path;
    expect(imTestAppsPath({ BOTHARNESS_IM_TEST_APPS_ENV: file })).toBe(file);
  });

  it('loads the selected slot without mixing two Apps and preserves names with spaces', () => {
    const options = fixture(configuration);
    expect(loadImTestApp(undefined, options)).toMatchObject({
      slot: 'QA1',
      name: 'BotHarness reusable QA 1',
      appId: 'cli_test_one',
      appSecret: 'test-secret-one',
      consoleReady: true,
    });
    expect(loadImTestApp('QA2', options)).toMatchObject({
      appId: 'cli_test_two',
      appSecret: 'test-secret-two',
      consoleReady: false,
    });
    expect(() => loadImTestApp('QA3', options)).toThrow('incomplete');
  });

  it('lists only non-secret metadata and never treats a prior window as an idle receiver', () => {
    const listed = listImTestApps(fixture(configuration));
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain('test-secret');
    expect(serialized).not.toContain('cli_test');
    expect(listed[0]).toMatchObject({
      credentialsConfigured: true,
      receiverAvailability: 'requires-current-window-confirmation',
    });
    expect(listed[2]).toMatchObject({ name: null, credentialsConfigured: false });
  });

  it('parses literal values rather than executing shell text or substituting variables', () => {
    const options = fixture(
      configuration.replace('BotHarness reusable QA 1', '$(exit 99) ${HOME}'),
    );
    expect(loadImTestApp('QA1', options).name).toBe('$(exit 99) ${HOME}');
    expect(() =>
      loadImTestApp('QA1', fixture(configuration.replace('test-secret-one', '$(exit 99)'))),
    ).toThrow('incomplete');
    expect(() => listImTestApps(fixture(`${configuration}\nBH_IM_QA_SLOT=QA2`))).toThrow(
      'Duplicate',
    );
  });
});

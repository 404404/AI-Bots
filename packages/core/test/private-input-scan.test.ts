import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';

it('allows only the exact native store and probe paths while scanning identically named nested files', () => {
  const home = createTempRoot('bh-private-scan-');
  const canary = ['SYNTHETIC', '1380', 'key', 'A'].join('-');
  writeFileSync(join(home, '.credentials.yaml'), canary);
  writeFileSync(join(home, 'wire-canary-probe.mjs'), canary);
  const scan = () =>
    execFileSync(process.execPath, ['scripts/scan-private-input-evidence.mjs', home], {
      encoding: 'utf8',
      windowsHide: true,
    });
  expect(JSON.parse(scan()).violations).toEqual([]);
  mkdirSync(join(home, 'spill'));
  writeFileSync(join(home, 'spill', '.credentials.yaml'), canary);
  writeFileSync(join(home, 'spill', 'wire-canary-probe.mjs'), canary);
  let output = '';
  try {
    scan();
  } catch (error) {
    output = String((error as { stdout: string }).stdout);
  }
  expect(JSON.parse(output).violations).toEqual([
    join('spill', '.credentials.yaml'),
    join('spill', 'wire-canary-probe.mjs'),
  ]);
});

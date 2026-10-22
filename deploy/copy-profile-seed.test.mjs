import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { copyProfileSeed } from './copy-profile-seed.mjs';

test('copies read-only seed directories as private writable DSH-owned directories', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-profile-seed-'));
  const source = join(root, 'source');
  const destination = join(root, 'destination');
  const gui = join(source, 'gui');
  const modules = join(gui, 'node_modules');
  const executable = join(modules, 'bin-tool');
  const alias = join(modules, 'bin-tool-link');
  const linkedPackage = join(modules, 'deepseekbot');
  const appPackage = join(root, 'app', 'packages', 'deepseekbot');

  t.after(() => {
    for (const directory of [modules, gui, source]) chmodSync(directory, 0o700);
    rmSync(root, { recursive: true, force: true });
  });

  mkdirSync(modules, { recursive: true, mode: 0o700 });
  mkdirSync(appPackage, { recursive: true, mode: 0o700 });
  writeFileSync(join(gui, 'package.json'), '{"name":"gui"}', { mode: 0o400 });
  writeFileSync(join(appPackage, 'package.json'), '{"name":"deepseekbot"}');
  writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o500 });
  symlinkSync('bin-tool', alias);
  symlinkSync(relative(modules, appPackage), linkedPackage);
  chmodSync(modules, 0o500);
  chmodSync(gui, 0o500);
  chmodSync(source, 0o500);

  copyProfileSeed(source, destination);

  assert.equal(lstatSync(join(destination, 'gui')).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(destination, 'gui/node_modules')).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(destination, 'gui/package.json')).mode & 0o777, 0o600);
  assert.equal(lstatSync(join(destination, 'gui/node_modules/bin-tool')).mode & 0o777, 0o700);
  assert.equal(readlinkSync(join(destination, 'gui/node_modules/bin-tool-link')), 'bin-tool');
  assert.equal(readlinkSync(join(destination, 'gui/node_modules/deepseekbot')), appPackage);
  assert.equal(existsSync(join(destination, 'gui/node_modules/deepseekbot/package.json')), true);
});

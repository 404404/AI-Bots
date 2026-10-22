#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import {
  developmentProfileManifest,
  developmentProfileWorkspaceConfig,
} from '../scripts/dev-profile.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env['DSH_HOME'];
if (!home) throw new Error('DSH_HOME must point to a disposable build seed directory.');
const profile = join(home, 'profiles', 'gui');
mkdirSync(profile, { recursive: true });
const cli = join(appRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const template = join(profile, 'package.json');
if (!existsSync(cli)) throw new Error('Pinned DSH CLI is missing from the app installation.');
const { spawnSync } = await import('node:child_process');
const result = spawnSync(
  process.execPath,
  [cli, '--profile', 'gui', '--from-default-profile', 'web', '--dump-config'],
  {
    cwd: appRoot,
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
if (result.status !== 0) throw new Error(`DSH GUI profile seed failed: ${result.stderr.trim()}`);
const manifest = JSON.parse(readFileSync(template, 'utf8'));
writeFileSync(
  template,
  `${JSON.stringify(developmentProfileManifest(manifest, appRoot), null, 2)}\n`,
);

const workspace = developmentProfileWorkspaceConfig(
  parse(readFileSync(join(appRoot, 'pnpm-workspace.yaml'), 'utf8')),
);
writeFileSync(join(profile, 'pnpm-workspace.yaml'), stringify(workspace));
const launchPatch = join(appRoot, 'deploy/gui-profile.patch.yml');
if (!existsSync(launchPatch)) throw new Error('Container GUI Patch file is missing.');
writeFileSync(join(profile, 'container-profile.patch.yml'), readFileSync(launchPatch));
process.stdout.write('Prepared disposable DSH GUI profile seed.\n');

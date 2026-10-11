import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from '../packages/core/node_modules/yaml/dist/index.js';

if (process.argv.length !== 3)
  throw new Error('Usage: node scripts/setup-private-input-mcp-demo.mjs <isolated-DSH_HOME>');
const path = join(resolve(process.argv[2]), 'profiles', 'web-dev', 'cordis.patch.yml');
const patch = parse(readFileSync(path, 'utf8'));
if (!Array.isArray(patch))
  throw new Error('An existing isolated web-dev Profile patch is required');
const core = patch.find((entry) => entry.id === 'botharness-core');
if (core?.config?.privateInputExecution !== true)
  throw new Error('Explicit privateInputExecution opt-in is required before demo setup');
core.config.privateInputMcpServers = [
  {
    serverName: 'linux_demo',
    command: 'node',
    args: [
      '--input-type=module',
      '-e',
      readFileSync(new URL('./ask-secret-mcp-fixture.mjs', import.meta.url), 'utf8'),
    ],
  },
];
writeFileSync(path, stringify(patch));
process.stdout.write(
  JSON.stringify({ phase: 'configured', serverName: 'linux_demo', restartRequired: true }) + '\n',
);

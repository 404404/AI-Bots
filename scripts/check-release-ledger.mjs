#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CHANGE_FRAGMENT_DIRECTORY, readChangeFragments } from './change-fragments.mjs';
import { composeReleaseLedgerPair, validateReleaseLedgerPair } from './release-ledger.mjs';

const englishPath = resolve(process.argv[2] ?? 'CHANGELOG.md');
const chinesePath = resolve(process.argv[3] ?? 'CHANGELOG.zh.md');
const fragments = readChangeFragments(
  resolve(process.argv[4] ?? resolve(dirname(englishPath), CHANGE_FRAGMENT_DIRECTORY)),
).map(({ fragment }) => fragment);
const composed = composeReleaseLedgerPair(
  readFileSync(englishPath, 'utf8'),
  readFileSync(chinesePath, 'utf8'),
  fragments,
);
const errors = [
  ...fragments.flatMap((fragment) => fragment.errors),
  ...validateReleaseLedgerPair(composed.english, composed.chinese),
];

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error.source} [${error.code}] ${error.message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `DeepSeekBot Release Ledger is valid (${fragments.length} Unreleased change fragments).\n`,
  );
}

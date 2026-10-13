#!/usr/bin/env node

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CHANGE_FRAGMENT_DIRECTORY, readChangeFragments } from './change-fragments.mjs';
import { composeReleaseLedgerPair, validateReleaseLedgerPair } from './release-ledger.mjs';
const root = resolve(process.argv[2] ?? '.');
const fragments = readChangeFragments(resolve(root, CHANGE_FRAGMENT_DIRECTORY));
const fragmentErrors = fragments.flatMap(({ fragment }) => fragment.errors);
const composed = composeReleaseLedgerPair(
  readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'),
  readFileSync(resolve(root, 'CHANGELOG.zh.md'), 'utf8'),
  fragments.map(({ fragment }) => fragment),
);
const errors = [
  ...fragmentErrors,
  ...validateReleaseLedgerPair(composed.english, composed.chinese),
];

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error.source} [${error.code}] ${error.message}\n`);
  }
  process.stderr.write('Nothing was folded.\n');
  process.exitCode = 1;
} else {
  writeFileSync(resolve(root, 'CHANGELOG.md'), composed.english);
  writeFileSync(resolve(root, 'CHANGELOG.zh.md'), composed.chinese);
  for (const { path } of fragments) rmSync(path);
  process.stdout.write(`Folded ${fragments.length} change fragments into the Release Ledger.\n`);
}

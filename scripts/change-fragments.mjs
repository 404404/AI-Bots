import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { composeReleaseLedgerPair, parseChangeFragment } from './release-ledger.mjs';

export const CHANGE_FRAGMENT_DIRECTORY = 'changes';

export function readChangeFragments(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => {
      const path = join(directory, name);
      return {
        path,
        fragment: parseChangeFragment(readFileSync(path, 'utf8'), relative('.', path)),
      };
    });
}

export function readComposedReleaseLedgers(root) {
  return composeReleaseLedgerPair(
    readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
    readFileSync(join(root, 'CHANGELOG.zh.md'), 'utf8'),
    readChangeFragments(join(root, CHANGE_FRAGMENT_DIRECTORY)).map(({ fragment }) => fragment),
  );
}

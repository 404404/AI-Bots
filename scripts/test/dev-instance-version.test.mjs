import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.each([
  { suffix: [] },
  { suffix: ['--json'] },
  { suffix: ['0.1.6'] },
  { suffix: ['v0.1.7'] },
  { suffix: ['>=0.1.7'] },
])(
  'refuses malformed or below-minimum matrix versions before creating a Profile: %j',
  ({ suffix }) => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-version-args-'));
    try {
      const home = join(directory, 'home');
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../dev-instance.mjs', import.meta.url)),
          '--home',
          home,
          '--port',
          '32959',
          '--product-artifacts',
          join(directory, 'missing'),
          '--dsh-version',
          ...suffix,
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--dsh-version requires');
      expect(existsSync(home)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

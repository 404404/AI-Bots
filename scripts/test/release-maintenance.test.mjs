import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { expect, it } from 'vitest';

const workflow = parse(
  readFileSync(new URL('../../.github/workflows/npm-release.yml', import.meta.url), 'utf8'),
);
const gate = workflow.jobs.prepare.steps.find((step) => step.id === 'version').run;

it('runs exact-head push verification on the maintained release branch', () => {
  const verify = parse(
    readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8'),
  );
  expect(verify.on.push.branches).toContain('release/1.2');
});

it('qualifies the exact prepared tarballs before the publish job can run', () => {
  const steps = workflow.jobs.prepare.steps;
  const packIndex = steps.findIndex((step) => step.id === 'plan');
  const matrixIndex = steps.findIndex((step) => step.run?.includes('e2e-dsh-install-matrix.mjs'));
  expect(matrixIndex).toBeGreaterThan(packIndex);
  expect(steps[matrixIndex].run).toContain('"$RUNNER_TEMP/npm-release"');
  expect(workflow.jobs.publish.needs).toBe('prepare');
  expect(steps.find((step) => step.run === 'npm ci --ignore-scripts')?.['working-directory']).toBe(
    '.release-provider',
  );
  expect(
    steps.filter((step) => step.with?.name?.startsWith('dsh-install-matrix-'))[0].with.path,
  ).toBe('${{ runner.temp }}/dsh-install-matrix/report.json');
});

it.each([
  ['v1.2.1', true, true, 0],
  ['v1.3.0', true, false, 0],
  ['v1.2.1', false, true, 0],
  ['v1.2.1', false, false, 1],
  ['v1.2.1-rc.1', false, true, 1],
  ['v1.3.0', false, true, 1],
])('checks tag %s ancestry (main=%s, maintenance=%s)', (tag, onMain, onMaintenance, status) => {
  const directory = mkdtempSync(join(tmpdir(), 'release-gate-'));
  try {
    const git = join(directory, 'git');
    writeFileSync(
      git,
      `#!/bin/bash\nif [[ "$1" == fetch ]]; then exit 0; fi\nif [[ "$4" == origin/main ]]; then exit ${onMain ? 0 : 1}; fi\nif [[ "$4" == FETCH_HEAD ]]; then exit ${onMaintenance ? 0 : 1}; fi\nexit 2\n`,
      { mode: 0o700 },
    );
    const output = join(directory, 'output');
    const result = spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', gate], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        TAG: tag,
        GITHUB_SHA: 'candidate',
        GITHUB_OUTPUT: output,
      },
      encoding: 'utf8',
    });
    expect(result.status, result.stdout + result.stderr).toBe(status);
    if (status === 0) expect(readFileSync(output, 'utf8')).toBe(`version=${tag.slice(1)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

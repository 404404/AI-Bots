import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createChromiumChrootDiagnosticProfile } from './chromium-chroot-diagnostic-profile.mjs';

const productionProfile = JSON.parse(
  readFileSync(new URL('./chromium-userns-seccomp.json', import.meta.url), 'utf8'),
);

test('diagnostic profile preserves default deny and adds only an unconditional chroot rule', () => {
  const original = JSON.stringify(productionProfile);
  const diagnostic = createChromiumChrootDiagnosticProfile(productionProfile);

  assert.equal(diagnostic.defaultAction, 'SCMP_ACT_ERRNO');
  assert.equal(diagnostic.defaultErrnoRet, productionProfile.defaultErrnoRet);
  assert.deepEqual(diagnostic.archMap, productionProfile.archMap);
  assert.deepEqual(diagnostic.syscalls.slice(0, -1), productionProfile.syscalls);
  assert.deepEqual(diagnostic.syscalls.at(-1), {
    names: ['chroot'],
    action: 'SCMP_ACT_ALLOW',
  });
  assert.equal(JSON.stringify(productionProfile), original);
});

test('diagnostic profile rejects anything other than the default-deny policy shape', () => {
  assert.throws(
    () => createChromiumChrootDiagnosticProfile({ defaultAction: 'SCMP_ACT_ALLOW', syscalls: [] }),
    /default-deny/u,
  );
  assert.throws(
    () => createChromiumChrootDiagnosticProfile({ defaultAction: 'SCMP_ACT_ERRNO' }),
    /default-deny/u,
  );
});

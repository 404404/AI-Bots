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

test('CI PID namespace diagnostic adds chroot and only a CLONE_NEWPID rule', () => {
  const diagnostic = createChromiumChrootDiagnosticProfile(productionProfile, true);

  assert.equal(diagnostic.defaultAction, 'SCMP_ACT_ERRNO');
  assert.deepEqual(diagnostic.archMap, productionProfile.archMap);
  assert.deepEqual(diagnostic.syscalls.slice(0, -3), productionProfile.syscalls);
  assert.deepEqual(diagnostic.syscalls.slice(-3), [
    { names: ['chroot'], action: 'SCMP_ACT_ALLOW' },
    {
      names: ['clone'],
      action: 'SCMP_ACT_ALLOW',
      args: [
        {
          index: 0,
          value: 0x20000000,
          valueTwo: 0x7e020080,
          op: 'SCMP_CMP_MASKED_EQ',
        },
      ],
      excludes: { arches: ['s390', 's390x'] },
    },
    {
      names: ['clone'],
      action: 'SCMP_ACT_ALLOW',
      args: [
        {
          index: 1,
          value: 0x20000000,
          valueTwo: 0x7e020080,
          op: 'SCMP_CMP_MASKED_EQ',
        },
      ],
      includes: { arches: ['s390', 's390x'] },
    },
  ]);
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
  assert.throws(
    () => createChromiumChrootDiagnosticProfile(productionProfile, 'clone'),
    /only allow a PID-namespace clone/u,
  );
});

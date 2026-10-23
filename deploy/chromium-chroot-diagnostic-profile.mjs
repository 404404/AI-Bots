import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLONE_NEWPID = 0x20000000;
// Moby's namespace mask plus CLONE_NEWTIME, which the pinned profile predates.
const CLONE_NAMESPACE_MASK = 0x7e020000 | 0x80;

function clonePidNamespaceRules() {
  return [
    {
      names: ['clone'],
      action: 'SCMP_ACT_ALLOW',
      args: [
        {
          index: 0,
          value: CLONE_NAMESPACE_MASK,
          valueTwo: CLONE_NEWPID,
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
          value: CLONE_NAMESPACE_MASK,
          valueTwo: CLONE_NEWPID,
          op: 'SCMP_CMP_MASKED_EQ',
        },
      ],
      includes: { arches: ['s390', 's390x'] },
    },
  ];
}

export function createChromiumChrootDiagnosticProfile(profile, allowPidNamespaceClone = false) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    profile.defaultAction !== 'SCMP_ACT_ERRNO' ||
    !Array.isArray(profile.syscalls)
  )
    throw new TypeError('Expected the default-deny Chromium seccomp profile.');
  if (typeof allowPidNamespaceClone !== 'boolean')
    throw new TypeError('The CI diagnostic may only allow a PID-namespace clone.');

  return {
    ...profile,
    syscalls: [
      ...profile.syscalls,
      { names: ['chroot'], action: 'SCMP_ACT_ALLOW' },
      ...(allowPidNamespaceClone ? clonePidNamespaceRules() : []),
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath, ...options] = process.argv;
  if (!inputPath || !outputPath) throw new Error('Expected input and output profile paths.');
  if (options.length > 1 || (options.length === 1 && options[0] !== 'pid-clone'))
    throw new Error('Only the CI diagnostic pid-clone option is supported.');
  const profile = JSON.parse(readFileSync(inputPath, 'utf8'));
  const diagnosticProfile = createChromiumChrootDiagnosticProfile(
    profile,
    options[0] === 'pid-clone',
  );
  writeFileSync(outputPath, `${JSON.stringify(diagnosticProfile)}\n`, { mode: 0o600 });
}

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createChromiumChrootDiagnosticProfile(profile, additionalSyscalls = []) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    profile.defaultAction !== 'SCMP_ACT_ERRNO' ||
    !Array.isArray(profile.syscalls)
  )
    throw new TypeError('Expected the default-deny Chromium seccomp profile.');
  if (!Array.isArray(additionalSyscalls) || additionalSyscalls.some((name) => name !== 'clone'))
    throw new TypeError('Only the CI diagnostic clone syscall may be added.');

  const syscallNames = [...new Set(['chroot', ...additionalSyscalls])];
  return {
    ...profile,
    syscalls: [
      ...profile.syscalls,
      ...syscallNames.map((name) => ({ names: [name], action: 'SCMP_ACT_ALLOW' })),
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath, ...additionalSyscalls] = process.argv;
  if (!inputPath || !outputPath) throw new Error('Expected input and output profile paths.');
  const profile = JSON.parse(readFileSync(inputPath, 'utf8'));
  const diagnosticProfile = createChromiumChrootDiagnosticProfile(profile, additionalSyscalls);
  writeFileSync(outputPath, `${JSON.stringify(diagnosticProfile)}\n`, { mode: 0o600 });
}

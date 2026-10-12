import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ComposerRecoveryIdentity {
  hostId: string;
  profileId: string;
  humanId: string;
}

function persistentId(path: string): string {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, randomUUID(), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const value = readFileSync(path, 'utf8');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value))
    throw new Error('invalid composer identity');
  return value;
}

export function composerRecoveryIdentity(
  hostPath: string,
  profilePath: string,
  humanId: string,
): ComposerRecoveryIdentity {
  return { hostId: persistentId(hostPath), profileId: persistentId(profilePath), humanId };
}

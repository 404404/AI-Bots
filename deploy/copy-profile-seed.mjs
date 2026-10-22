import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';

/** Copy a read-only profile seed into a private tree owned by the current user. */
export function copyProfileSeed(source, destination) {
  const info = lstatSync(source);

  if (info.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination);
    return;
  }

  if (info.isDirectory()) {
    mkdirSync(destination, { mode: 0o700 });
    chmodSync(destination, 0o700);
    for (const entry of readdirSync(source))
      copyProfileSeed(join(source, entry), join(destination, entry));
    return;
  }

  if (!info.isFile()) throw new Error(`Unsupported profile seed entry: ${source}`);

  copyFileSync(source, destination);
  chmodSync(destination, info.mode & 0o111 ? 0o700 : 0o600);
}

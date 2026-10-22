import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Copy a read-only profile seed into a private tree owned by the current user. */
export function copyProfileSeed(source, destination) {
  copyEntry(resolve(source), resolve(destination), resolve(source), resolve(destination));
}

function copyEntry(source, destination, sourceRoot, destinationRoot) {
  const info = lstatSync(source);

  if (info.isSymbolicLink()) {
    const linkTarget = readlinkSync(source);
    const targetPath = isAbsolute(linkTarget)
      ? resolve(linkTarget)
      : resolve(dirname(source), linkTarget);
    const relativeToRoot = relative(sourceRoot, targetPath);
    const pointsInsideSeed =
      relativeToRoot === '' ||
      (relativeToRoot !== '..' &&
        !relativeToRoot.startsWith(`..${sep}`) &&
        !isAbsolute(relativeToRoot));
    const mappedTarget = pointsInsideSeed
      ? resolve(destinationRoot, relativeToRoot)
      : targetPath;
    const target = pointsInsideSeed
      ? relative(dirname(destination), mappedTarget) || '.'
      : mappedTarget;
    symlinkSync(target, destination);
    return;
  }

  if (info.isDirectory()) {
    mkdirSync(destination, { mode: 0o700 });
    chmodSync(destination, 0o700);
    for (const entry of readdirSync(source))
      copyEntry(join(source, entry), join(destination, entry), sourceRoot, destinationRoot);
    return;
  }

  if (!info.isFile()) throw new Error(`Unsupported profile seed entry: ${source}`);

  copyFileSync(source, destination);
  chmodSync(destination, info.mode & 0o111 ? 0o700 : 0o600);
}

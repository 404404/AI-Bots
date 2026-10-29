import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
for (const name of Object.keys(lock.packages))
  if (/deepseek|cordis|botharness/iu.test(name))
    throw new Error('Framework dependency is forbidden in the standalone artifact.');
function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) scan(path);
    else if (item.name.endsWith('.ts')) {
      const source = readFileSync(path, 'utf8');
      if (/@deepseek-ai|@botharness|import\s*\(/u.test(source))
        throw new Error('Framework or dynamic runtime import is forbidden.');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
        const spec = match[1];
        if (
          !(
            spec.startsWith('node:') ||
            spec === 'undici' ||
            spec.startsWith('@earendil-works/pi-ai/') ||
            spec.startsWith('./')
          )
        )
          throw new Error(`Nonlocal import: ${spec}`);
      }
    }
  }
}
scan(join(root, 'src'));
rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });
cpSync(join(root, 'src'), join(root, 'dist'), { recursive: true });
cpSync(join(root, 'public'), join(root, 'dist', 'public'), { recursive: true });
for (const name of ['LICENSE', 'NOTICE.md']) cpSync(join(root, name), join(root, 'dist', name));
process.stdout.write(
  JSON.stringify({ status: 'built', frameworkDependencies: 0, entry: 'dist/server.ts' }) + '\n',
);

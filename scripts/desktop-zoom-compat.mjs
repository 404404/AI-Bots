import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const ZOOM_THEME_VERSION = '0.2.1-rc.2';
export const ZOOM_THEME_HASHES = {
  client: 'f9915fb53d5f156e75291e63be66c80e607a82bfd03c7d583e0a12ebef5a6cb8',
  host: '1adf59906ab10e91765d96f3e42268b0b7669f921c4baf4021a3057894cf3000',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function adaptZoomTheme(client) {
  if (hash(client) !== ZOOM_THEME_HASHES.client) throw Error('zoom-theme-build-unsupported');
  const call =
    '\t\t\t\tinstallFontSizeShortcuts(ctx, (delta) => {\n\t\t\t\t\tthis.adjustFontSizes(delta);\n\t\t\t\t});';
  const start = 'function installFontSizeShortcuts(ctx, adjust) {\n\t\t\tctx.inject(';
  if (client.split(call).length !== 2 || client.split(start).length !== 2)
    throw Error('zoom-theme-shape-unsupported');
  const adapter = `

        const installFontKeys = () => installFontSizeShortcuts(ctx, delta => this.adjustFontSizes(delta));
        let fontKeys = installFontKeys();
        if (location.protocol === 'dsh-app:' && location.hostname === 'app' && document.documentElement.dataset.platform === 'darwin') {
          let alive = true, held = false;
          const compatibility = {
            version: 1, desktopVersion: '0.2.1-rc.2',
            async acquire() {
              if (!alive || held) throw Error('zoom-compatibility-unavailable');
              held = true;
              try { await fontKeys.dispose(); }
              catch (error) { held = false; throw error; }
              if (!alive) { held = false; throw Error('zoom-compatibility-disposed'); }
              let released = false;
              return () => {
                if (released) return;
                released = true; held = false;
                if (alive) fontKeys = installFontKeys();
              };
            }
          };
          if (window.__botharnessWindowZoomCompatibility) throw Error('zoom-compatibility-duplicate');
          window.__botharnessWindowZoomCompatibility = compatibility;
          ctx.effect(() => () => {
            alive = false;
            if (window.__botharnessWindowZoomCompatibility === compatibility) delete window.__botharnessWindowZoomCompatibility;
          }, 'botharness: desktop zoom compatibility ownership');
        }`;
  return client
    .replace(call, adapter)
    .replace(start, 'function installFontSizeShortcuts(ctx, adjust) {\n\t\t\treturn ctx.inject(');
}
export function prepareDesktopZoomCompatibility({ source, target, schemaModule }) {
  source = realpathSync(source);
  target = resolve(target);
  if (!relative(source, target).startsWith('..') || existsSync(target))
    throw Error('zoom-target-must-be-new');
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (
    manifest.name !== '@deepseek-ai/dsh-client-ui-theme' ||
    manifest.version !== ZOOM_THEME_VERSION ||
    manifest.license !== 'MIT'
  )
    throw Error('zoom-theme-version-unsupported');
  const before = readFileSync(join(source, 'lib/client.js'), 'utf8');
  const host = readFileSync(join(source, 'lib/index.js'), 'utf8');
  const after = adaptZoomTheme(before);
  if (hash(host) !== ZOOM_THEME_HASHES.host) throw Error('zoom-theme-host-unsupported');
  const schema =
    schemaModule ??
    join(
      dirname(createRequire(join(source, 'package.json')).resolve('@deepseek-ai/schemastery')),
      'index.mjs',
    );
  if (!existsSync(schema) || !existsSync(join(source, 'LICENSE')))
    throw Error('zoom-theme-dependency-unavailable');
  const specifier = '"@deepseek-ai/schemastery"';
  if (host.split(specifier).length !== 2) throw Error('zoom-theme-host-shape-unsupported');
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !relative(source, path).split(/[\\/]/).includes('node_modules'),
  });
  writeFileSync(join(target, 'lib/client.js'), after);

  writeFileSync(
    join(target, 'lib/index.js'),
    host.replace(specifier, JSON.stringify(pathToFileURL(schema).href)),
  );
  const provenance = {
    adapterVersion: 1,
    sourceVersion: manifest.version,
    clientBefore: hash(before),
    clientAfter: hash(after),
    hostBefore: hash(host),
    sourceModified: false,
    platforms: ['macos'],
    changes: ['lease-owned font shortcut handoff', 'canonical schema module import'],
  };
  writeFileSync(join(target, 'botharness-zoom-compat.json'), JSON.stringify(provenance, null, 2));
  return provenance;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target || process.argv.length !== 4)
    throw Error(
      'Usage: node scripts/desktop-zoom-compat.mjs <source-theme-package> <new-output-directory>',
    );
  process.stdout.write(JSON.stringify(prepareDesktopZoomCompatibility({ source, target })) + '\n');
}

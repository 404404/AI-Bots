import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { preparePackagedDesktopZoomTheme, ZOOM_THEME_HASHES } from '../desktop-zoom-compat.mjs';
import { parseProductComposition } from '../packaged-profile.mjs';

const source = realpathSync(
  fileURLToPath(
    new URL('../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme', import.meta.url),
  ),
);
const roots = [];
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), 'zoom-package-test-'));
  roots.push(root);
  return root;
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('product-owned desktop theme payload', () => {
  it('keeps a complete licensed package and resolves its Host schema relative to a relocated product', async () => {
    const root = temporary();
    const product = join(root, 'product');
    const target = join(product, 'desktop-theme');
    const provenance = preparePackagedDesktopZoomTheme({ source, target });
    expect(provenance.clientBefore).toBe(ZOOM_THEME_HASHES.client);
    expect(provenance.hostBefore).toBe(ZOOM_THEME_HASHES.host);
    expect(digest(readFileSync(join(source, 'lib/client.js')))).toBe(ZOOM_THEME_HASHES.client);
    expect(readFileSync(join(target, 'LICENSE'), 'utf8')).toBe(
      readFileSync(join(source, 'LICENSE'), 'utf8'),
    );
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    expect(existsSync(join(target, manifest.types))).toBe(true);
    expect(
      existsSync(join(target, 'locale/en-US.json')) || existsSync(join(target, 'locale/en.json')),
    ).toBe(true);
    const host = readFileSync(join(target, 'lib/index.js'), 'utf8');
    expect(host).toContain('"../../dist/theme-schema.mjs"');
    expect(host).not.toContain('file:');
    const schema = createRequire(join(source, 'package.json')).resolve('@deepseek-ai/schemastery');
    mkdirSync(join(product, 'dist'));
    writeFileSync(
      join(product, 'dist/theme-schema.mjs'),
      `export {default} from ${JSON.stringify(pathToFileURL(join(dirname(schema), 'index.mjs')).href)};`,
    );
    const relocated = join(root, 'relocated');
    cpSync(product, relocated, { recursive: true });
    rmSync(product, { recursive: true });
    const loaded = await import(pathToFileURL(join(relocated, 'desktop-theme/lib/index.js')).href);
    expect(loaded.apply).toBeTypeOf('function');
    expect(loaded.Config).toBeTypeOf('function');
  });

  it('does not churn watched theme modules on an unrelated product rebuild', () => {
    const target = join(temporary(), 'theme');
    preparePackagedDesktopZoomTheme({ source, target });
    const files = ['lib/client.js', 'lib/index.js', 'package.json', 'botharness-zoom-compat.json'];
    const before = files.map((path) => statSync(join(target, path)).mtimeMs);
    preparePackagedDesktopZoomTheme({ source, target });
    expect(files.map((path) => statSync(join(target, path)).mtimeMs)).toEqual(before);
  });

  it('refuses an upstream source mutation and refuses writing into its source', () => {
    expect(() =>
      preparePackagedDesktopZoomTheme({ source, target: join(source, 'generated') }),
    ).toThrow('zoom-target-inside-source');
    const root = temporary();
    const changed = join(root, 'changed');
    cpSync(source, changed, {
      recursive: true,
      filter: (path) => !relative(source, path).split(sep).includes('node_modules'),
    });
    writeFileSync(join(changed, 'lib/client.js'), 'unqualified');
    const target = join(root, 'target');
    expect(() => preparePackagedDesktopZoomTheme({ source: changed, target })).toThrow(
      'zoom-theme-build-unsupported',
    );
    expect(existsSync(target)).toBe(false);
  });

  it('resolves source aliases before rejecting an output inside the source package', () => {
    const alias = join(temporary(), 'alias');
    symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() =>
      preparePackagedDesktopZoomTheme({ source: alias, target: join(alias, 'generated') }),
    ).toThrow('zoom-target-inside-source');
    expect(digest(readFileSync(join(source, 'lib/client.js')))).toBe(ZOOM_THEME_HASHES.client);
  });
});

for (const patch of ['cordis.patch.yml', 'cordis.im.patch.yml']) {
  describe(`${patch} theme selection`, () => {
    const rows = parseProductComposition(
      readFileSync(new URL(`../../packages/deepseekbot/${patch}`, import.meta.url), 'utf8'),
    );
    const native = rows.find((row) => row.id === 'ui-theme');
    const group = rows
      .flatMap((row) => row.insert ?? [])
      .find((row) => row.id === 'botharness-desktop-theme');
    const disabled = (row, platform, version) =>
      Boolean(
        new Function('process', 'ctx', `return (${row.disabled.__jsExpr});`)(
          { platform },
          { get: () => ({ graph: () => ({ release: version ? { version } : undefined }) }) },
        ),
      );
    it.each(['darwin', 'win32', 'linux'])(
      'keeps exactly one theme owner on %s across version changes and rollback',
      (platform) => {
        for (const version of ['0.2.1-rc.2', '0.2.0-rc.2', '0.2.1-rc.3', undefined, '0.2.1-rc.2']) {
          const active = [
            ...(!disabled(native, platform, version) ? [native.name] : []),
            ...(!disabled(group, platform, version)
              ? group.config
                  .filter((row) => !disabled(row, platform, version))
                  .map((row) => row.name)
              : []),
          ];
          expect(active).toEqual([
            platform === 'darwin' && version === '0.2.1-rc.2'
              ? './desktop-theme/lib/index.js'
              : '@deepseek-ai/dsh-client-ui-theme',
          ]);
        }
      },
    );
  });
}

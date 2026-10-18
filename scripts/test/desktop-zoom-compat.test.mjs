import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { adaptZoomTheme, prepareDesktopZoomCompatibility } from '../desktop-zoom-compat.mjs';
const path = new URL(
  '../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
  import.meta.url,
);
describe('locked downstream theme composition', () => {
  it('imports the generated Host through the ESM schema entry, retaining the license and source', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'zoom-theme-test-'));
    const target = join(temporary, 'theme');
    const source = fileURLToPath(
      new URL(
        '../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme',
        import.meta.url,
      ),
    );
    try {
      prepareDesktopZoomCompatibility({ source, target });
      const host = readFileSync(join(target, 'lib/index.js'), 'utf8');
      expect(host).toContain('/lib/index.mjs');
      expect(host).not.toContain('/lib/index.cjs');
      expect((await import(pathToFileURL(join(target, 'lib/index.js')).href)).apply).toBeTypeOf(
        'function',
      );
      expect(readFileSync(join(target, 'LICENSE'), 'utf8')).toContain('MIT');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
  it('refuses a changed upstream artifact before adapting anything', () => {
    expect(() => adaptZoomTheme('different build')).toThrow('zoom-theme-build-unsupported');
  });
  it('hands off only its own font scope, and preserves a default path and disposal restoration', () => {
    const source = readFileSync(path, 'utf8');
    const adapted = adaptZoomTheme(source);
    expect(adapted).toContain('await fontKeys.dispose()');
    expect(adapted).toContain('if (alive) fontKeys = installFontKeys()');
    expect(adapted).toContain("dataset.platform === 'darwin'");
    expect(adapted).toContain('this.adjustFontSizes(delta)');
    expect(source).not.toContain('__botharnessWindowZoomCompatibility');
    expect(() => new Function(adapted)).not.toThrow();
  });
});

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  configureDesktopZoom,
  runDesktopZoomSetup,
} from '../../packages/deepseekbot/src/desktop-zoom-setup.mjs';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'zoom-setup-')));
  roots.push(home);
  const profile = 'qa';
  const directory = join(home, 'profiles', profile);
  const root = join(directory, 'node_modules/deepseekbot');
  mkdirSync(join(root, 'desktop-theme/lib'), { recursive: true });
  const path = join(directory, 'package.json');
  const manifest = {
    private: true,
    dependencies: { deepseekbot: 'file:product.tgz' },
    dsh: { profile: { bundles: ['deepseekbot'] } },
  };
  writeFileSync(path, JSON.stringify(manifest));
  writeFileSync(join(directory, 'cordis.patch.yml'), 'native preference unchanged');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'deepseekbot', dsh: { bundle: { patch: 'cordis.im.patch.yml' } } }),
  );
  writeFileSync(join(root, 'cordis.im.patch.yml'), '[]');
  writeFileSync(join(root, 'desktop-theme/lib/client.js'), 'qualified');
  writeFileSync(
    join(root, 'desktop-theme/botharness-zoom-compat.json'),
    JSON.stringify({
      sourceVersion: '0.2.1-rc.2',
      clientAfter: createHash('sha256').update('qualified').digest('hex'),
    }),
  );
  const run = vi.fn((command, args) => {
    if (args[0] === '--version') return '0.2.1-rc.2\n';
    const doc = JSON.parse(readFileSync(path));
    if (args[3] === 'add')
      doc.dependencies['@deepseek-ai/dsh-client-ui-theme'] =
        'link:node_modules/deepseekbot/desktop-theme';
    else delete doc.dependencies['@deepseek-ai/dsh-client-ui-theme'];
    if (args[3] === 'add') {
      mkdirSync(join(directory, 'node_modules/@deepseek-ai'), { recursive: true });
      symlinkSync(
        root + '/desktop-theme',
        join(directory, 'node_modules/@deepseek-ai/dsh-client-ui-theme'),
        'dir',
      );
    }
    writeFileSync(path, JSON.stringify(doc));
    return '';
  });
  return { home, profile, platform: 'darwin', dsh: '/owned/dsh', run, path, directory };
}
it('uses the native package manager to enable and remove only its own Profile alias', () => {
  const f = fixture();
  expect(configureDesktopZoom({ ...f, action: 'enable' })).toMatchObject({
    changed: true,
    restartRequired: true,
    runtimeVerified: false,
  });
  expect(f.run.mock.calls[1][1]).toEqual([
    'plugin',
    '--profile',
    'qa',
    'add',
    '@deepseek-ai/dsh-client-ui-theme@link:node_modules/deepseekbot/desktop-theme',
  ]);
  expect(configureDesktopZoom({ ...f, action: 'enable' }).changed).toBe(false);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(true);
  expect(configureDesktopZoom({ ...f, action: 'disable' }).changed).toBe(false);
  expect(JSON.parse(readFileSync(f.path))).toEqual({
    private: true,
    dependencies: { deepseekbot: 'file:product.tgz' },
    dsh: { profile: { bundles: ['deepseekbot'] } },
  });
  expect(readFileSync(join(f.directory, 'cordis.patch.yml'), 'utf8')).toBe(
    'native preference unchanged',
  );
});
it.each(['win32', 'linux'])('refuses enabling on %s before any package operation', (platform) => {
  const f = fixture();
  expect(() => configureDesktopZoom({ ...f, platform, action: 'enable' })).toThrow(
    'platform-unsupported',
  );
  expect(f.run).not.toHaveBeenCalled();
});
it('refuses unknown Host releases and other owners instead of replacing them', () => {
  const f = fixture();
  f.run.mockImplementationOnce(() => '0.2.0-rc.2');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('version-unsupported');
  expect(f.run).toHaveBeenCalledTimes(1);
  const manifest = JSON.parse(readFileSync(f.path));
  manifest.dependencies['@deepseek-ai/dsh-client-ui-theme'] = 'file:other.tgz';
  writeFileSync(f.path, JSON.stringify(manifest));
  for (const action of ['enable', 'disable'])
    expect(() => configureDesktopZoom({ ...f, action })).toThrow('theme-conflict');
  expect(f.run).toHaveBeenCalledTimes(1);
});
it('refuses stale grouped product composition and changed client bytes', () => {
  const f = fixture();
  const root = join(f.directory, 'node_modules/deepseekbot');
  writeFileSync(join(root, 'cordis.im.patch.yml'), 'botharness-desktop-theme');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow(
    'product-upgrade-required',
  );
  writeFileSync(join(root, 'desktop-theme/lib/client.js'), 'changed');
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('theme-unqualified');
});
it('reports uncertain package outcome without retrying or claiming runtime success', () => {
  const f = fixture();
  f.run.mockImplementationOnce(() => '0.2.1-rc.2');
  f.run.mockImplementationOnce(() => {
    throw Error('interrupted');
  });
  expect(() => configureDesktopZoom({ ...f, action: 'enable' })).toThrow('outcome-unconfirmed');
  expect(f.run).toHaveBeenCalledTimes(2);
});
it('requires an explicit target and refuses unknown or repeated flags', () => {
  expect(() => runDesktopZoomSetup(['enable'])).toThrow('explicit-profile-required');
  expect(() => runDesktopZoomSetup(['enable', '--profile', 'qa', '--profile', 'qb'])).toThrow(
    'arguments-invalid',
  );
  expect(() => runDesktopZoomSetup(['enable', '--token', 'secret'])).toThrow('arguments-invalid');
});

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const theme = '@deepseek-ai/dsh-client-ui-theme';
const ownedLink = 'link:node_modules/deepseekbot/desktop-theme';
const supported = '0.2.1-rc.2';
function refuse(code) {
  throw Object.assign(Error(code), { code });
}
export function configureDesktopZoom({
  action,
  home,
  profile,
  dsh = 'dsh',
  platform = process.platform,
  run = (executable, args, options) => execFileSync(executable, args, options),
}) {
  if (!['enable', 'disable'].includes(action)) refuse('desktop-zoom-setup-action-required');
  if (!home || !profile || !/^[A-Za-z0-9_-]+$/.test(profile))
    refuse('desktop-zoom-setup-explicit-profile-required');
  const directory = join(realpathSync(home), 'profiles', profile);
  if (realpathSync(directory) !== directory) refuse('desktop-zoom-setup-profile-link-refused');
  const manifestPath = join(directory, 'package.json');
  const before = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const current = before.dependencies?.[theme];
  if (current !== undefined && current !== ownedLink) refuse('desktop-zoom-setup-theme-conflict');
  const alias = join(directory, 'node_modules', theme);
  const target = join(directory, 'node_modules/deepseekbot/desktop-theme');
  const linkState = () => {
    let stat;
    try {
      stat = lstatSync(alias);
    } catch (error) {
      if (error.code === 'ENOENT') return 'absent';
      throw error;
    }
    return stat.isSymbolicLink() && resolve(dirname(alias), readlinkSync(alias)) === target
      ? 'owned'
      : 'foreign';
  };
  if (linkState() === 'foreign') refuse('desktop-zoom-setup-theme-conflict');
  const options = {
    cwd: directory,
    env: { ...process.env, DSH_HOME: realpathSync(home) },
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  if (action === 'enable') {
    if (platform !== 'darwin') refuse('desktop-zoom-setup-platform-unsupported');
    const version = String(run(dsh, ['--version'], options)).trim();
    if (version !== supported) refuse('desktop-zoom-setup-version-unsupported');
    const product = join(directory, 'node_modules/deepseekbot');
    const manifest = JSON.parse(readFileSync(join(product, 'package.json'), 'utf8'));
    if (manifest.name !== 'deepseekbot' || !before.dsh?.profile?.bundles?.includes('deepseekbot'))
      refuse('desktop-zoom-setup-product-not-enabled');
    const root = join(product, 'desktop-theme');
    const provenance = JSON.parse(readFileSync(join(root, 'botharness-zoom-compat.json'), 'utf8'));
    const client = readFileSync(join(root, 'lib/client.js'));
    if (
      provenance.sourceVersion !== supported ||
      createHash('sha256').update(client).digest('hex') !== provenance.clientAfter
    )
      refuse('desktop-zoom-setup-theme-unqualified');
    const patch = readFileSync(join(product, manifest.dsh.bundle.patch), 'utf8');
    if (patch.includes('botharness-desktop-theme'))
      refuse('desktop-zoom-setup-product-upgrade-required');
  }
  const packageChanged = action === 'enable' ? current !== ownedLink : current === ownedLink;
  const changed = packageChanged || (action === 'disable' && linkState() === 'owned');
  if (packageChanged) {
    try {
      run(
        dsh,
        [
          'plugin',
          '--profile',
          profile,
          action === 'enable' ? 'add' : 'remove',
          action === 'enable' ? `${theme}@${ownedLink}` : theme,
        ],
        options,
      );
    } catch {
      refuse('desktop-zoom-setup-package-outcome-unconfirmed');
    }
  }
  if (action === 'disable' && linkState() === 'owned') unlinkSync(alias);
  const after = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    action === 'enable'
      ? after.dependencies?.[theme] !== ownedLink
      : after.dependencies?.[theme] !== undefined
  )
    refuse('desktop-zoom-setup-package-outcome-unconfirmed');
  if (action === 'enable' ? linkState() !== 'owned' : linkState() !== 'absent')
    refuse('desktop-zoom-setup-package-outcome-unconfirmed');
  return { action, profile, changed, restartRequired: true, runtimeVerified: false };
}
export function runDesktopZoomSetup(args) {
  const [action, ...flags] = args;
  const values = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !['--home', '--profile', '--dsh'].includes(flags[i]) ||
      !flags[i + 1] ||
      values.has(flags[i])
    )
      refuse('desktop-zoom-setup-arguments-invalid');
    values.set(flags[i], flags[i + 1]);
  }
  return configureDesktopZoom({
    action,
    home: values.get('--home'),
    profile: values.get('--profile'),
    dsh: values.get('--dsh'),
  });
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(runDesktopZoomSetup(process.argv.slice(2))));
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'desktop-zoom-setup-failed' }));
    process.exitCode = 1;
  }
}

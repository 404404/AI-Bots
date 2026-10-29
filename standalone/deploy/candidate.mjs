import { execFileSync } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compose = join(repo, 'standalone/deploy/compose.candidate.yml');
const data = join(repo, '.local/standalone-bot-candidate/data');
const image = process.env.IMAGE_REF ?? '';
const execute = process.argv.includes('--execute');
const allowedArgs = process.argv.slice(2).every((arg) => arg === '--execute' || arg === '--check');
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function run(args) {
  return execFileSync('docker', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });
}
function checkPort() {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error('Candidate port 192.168.68.11:20443 is unavailable.')));
    server.listen(20443, '192.168.68.11', () => server.close(resolveCheck));
  });
}

async function main() {
  requireValue(allowedArgs && (execute || process.argv.includes('--check')), 'Use --check, or explicitly authorize candidate start with --execute.');
  const publishedImage = /^ghcr\.io\/404404\/ai-bots@sha256:[a-f0-9]{64}$/u.test(image);
  const localImage = /^sha256:[a-f0-9]{64}$/u.test(image);
  requireValue(publishedImage || localImage, 'IMAGE_REF must be a GHCR manifest digest or a local sha256 image ID.');
  requireValue(!lstatSync(data).isSymbolicLink(), 'Candidate data directory cannot be a symlink.');
  const dataStat = statSync(data);
  requireValue(dataStat.isDirectory() && dataStat.uid === 10001 && (dataStat.mode & 0o077) === 0, 'Pre-create candidate data directory owned by UID 10001 with mode 0700.');
  const names = run(['ps', '-a', '--format', '{{.Names}}']).split(/\r?\n/u);
  requireValue(!names.includes('gk50-standalone-bot-candidate'), 'Candidate container name is already in use.');
  const imageInfo = run(['image', 'inspect', image, '--format', '{{.Id}} {{json .Config.Labels}}']).trim();
  const separator = imageInfo.indexOf(' ');
  const imageId = imageInfo.slice(0, separator);
  const labels = JSON.parse(imageInfo.slice(separator + 1));
  requireValue(imageId === image || (publishedImage && /^sha256:[a-f0-9]{64}$/u.test(imageId)), 'Image is not present locally under the requested immutable identity.');
  requireValue(labels?.['io.404404.product'] === 'standalone-bot' && labels?.['org.opencontainers.image.source'] === 'https://github.com/404404/AI-Bots', 'Image OCI product/source labels do not match.');
  await checkPort();
  const composeArgs = ['compose', '-f', compose];
  execFileSync('docker', [...composeArgs, 'config', '--quiet'], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    env: { ...process.env, BOT_CANDIDATE_DATA_DIR: data },
  });
  if (execute) execFileSync('docker', [...composeArgs, 'up', '-d', '--pull', 'never'], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
    env: { ...process.env, BOT_CANDIDATE_DATA_DIR: data },
  });
  process.stdout.write(JSON.stringify({
    product: 'standalone-bot-candidate',
    mode: execute ? 'started' : 'checked',
    image,
    imageKind: publishedImage ? 'registry-digest-local-present' : 'development-candidate-local-image',
    endpoint: 'http://192.168.68.11:20443',
    dataDirectory: data,
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message ?? 'Candidate check failed.'}\n`);
  process.exitCode = 1;
});

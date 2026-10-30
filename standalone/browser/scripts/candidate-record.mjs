import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const expectedBrowserImages = [
  ['worker', 'standalone-browser-worker:candidate'],
  ['proxy', 'standalone-browser-proxy:candidate'],
  ['gateway', 'standalone-browser-gateway:candidate'],
  ['fixture', 'standalone-browser-fixture:candidate'],
];

function sha256(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function digestPath(digest) {
  if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error('Archive contains an invalid SHA-256 descriptor.');
  return `blobs/sha256/${digest.slice('sha256:'.length)}`;
}
function configPathDigest(path) {
  if (typeof path !== 'string') throw new Error('Image has no config path.');
  const legacy = /^([a-f0-9]{64})\.json$/u.exec(path);
  if (legacy) return `sha256:${legacy[1]}`;
  const blob = /^blobs\/sha256\/([a-f0-9]{64})$/u.exec(path);
  if (blob) return `sha256:${blob[1]}`;
  throw new Error('Image has an unsafe or unsupported config path.');
}
function safeMemberPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.includes('\0') || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error('Archive contains an unsafe member path.');
  }
  return path;
}
function hashArchiveMember(archivePath, member, files) {
  const safe = safeMemberPath(member);
  if (!files.has(safe)) throw new Error(`Archive is missing ${safe}.`);
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xOf', archivePath, safe], { stdio: ['ignore', 'pipe', 'pipe'] });
    const hash = createHash('sha256');
    let size = 0, stderr = '';
    child.stdout.on('data', (chunk) => { size += chunk.length; hash.update(chunk); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 2048) stderr += chunk.toString('utf8').slice(0, 2048 - stderr.length); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve({ digest: `sha256:${hash.digest('hex')}`, size }) : reject(new Error(`Could not read archive member ${safe}: ${stderr.trim() || 'tar failed'}`)));
  });
}

/** Parse Docker-save/OCI archive metadata and verify every digest against archived bytes. */
export async function readCandidateArchive(archivePath, expected = expectedBrowserImages) {
  const files = new Set(execFileSync('tar', ['-tf', archivePath], { encoding: 'utf8' }).trim().split('\n'));
  const read = (name, maxBuffer = 32 * 1024 * 1024) => {
    safeMemberPath(name);
    if (!files.has(name)) throw new Error(`Archive is missing ${name}.`);
    return execFileSync('tar', ['-xOf', archivePath, name], { maxBuffer });
  };
  const archiveManifest = JSON.parse(read('manifest.json').toString('utf8'));
  if (!Array.isArray(archiveManifest)) throw new Error('Docker archive manifest is invalid.');
  const archiveImages = archiveManifest.flatMap((entry) => entry.RepoTags ?? []).sort();
  const expectedImages = expected.map(([, image]) => image).sort();
  if (JSON.stringify(archiveImages) !== JSON.stringify(expectedImages)) throw new Error('Candidate archive image manifest does not match the fixed image list.');

  const hasOciIndex = files.has('index.json');
  const ociIndex = hasOciIndex ? JSON.parse(read('index.json').toString('utf8')) : null;
  if (ociIndex && !Array.isArray(ociIndex.manifests)) throw new Error('OCI index has no manifest descriptors.');
  const ociManifests = [];
  for (const descriptor of ociIndex?.manifests ?? []) {
    const path = digestPath(descriptor.digest);
    const bytes = read(path);
    if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.digest) throw new Error(`OCI manifest ${descriptor.digest} failed digest or size validation.`);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (!manifest.config || typeof manifest.config.digest !== 'string' || !Number.isSafeInteger(manifest.config.size)) throw new Error(`OCI manifest ${descriptor.digest} has no valid config descriptor.`);
    const configDigest = manifest.config.digest;
    const configBytes = read(digestPath(configDigest));
    if (configBytes.length !== manifest.config.size || sha256(configBytes) !== configDigest) throw new Error(`OCI config ${configDigest} failed digest or size validation.`);
    if (!Array.isArray(manifest.layers)) throw new Error(`OCI manifest ${descriptor.digest} has no layer descriptor list.`);
    const layers = [];
    for (const layer of manifest.layers) {
      const path = digestPath(layer.digest);
      const actual = await hashArchiveMember(archivePath, path, files);
      if (actual.size !== layer.size || actual.digest !== layer.digest) throw new Error(`OCI layer ${layer.digest} failed digest or size validation.`);
      layers.push(actual);
    }
    ociManifests.push({ digest: descriptor.digest, configDigest, layers });
  }
  if (hasOciIndex && ociManifests.length !== archiveManifest.length) throw new Error('OCI index and Docker archive image manifest have different target counts.');
  if (hasOciIndex && new Set(ociManifests.map((item) => item.configDigest)).size !== ociManifests.length) throw new Error('OCI index contains ambiguous duplicate config targets.');

  const records = [];
  for (const [name, reference] of expected) {
    const entry = archiveManifest.find((item) => (item.RepoTags ?? []).includes(reference));
    if (!entry) throw new Error(`Archive has no record for ${reference}.`);
    const expectedConfigDigest = configPathDigest(entry.Config);
    const configBytes = read(entry.Config);
    const configDigest = sha256(configBytes);
    if (configDigest !== expectedConfigDigest) throw new Error(`Archived config filename does not match config bytes for ${reference}.`);
    const config = JSON.parse(configBytes.toString('utf8'));
    if (!Array.isArray(entry.Layers)) throw new Error(`Docker archive has no layer list for ${reference}.`);
    const archiveLayers = [];
    for (const layerPath of entry.Layers) archiveLayers.push(await hashArchiveMember(archivePath, layerPath, files));
    const manifests = ociManifests.filter((item) => item.configDigest === configDigest);
    if (hasOciIndex && manifests.length !== 1) throw new Error(`OCI index must contain exactly one digest-verified manifest for ${reference}.`);
    const manifestDigest = manifests[0]?.digest ?? null;
    const archiveManifestRecordDigest = sha256(Buffer.from(JSON.stringify(entry)));
    records.push({ name, reference, configDigest, manifestDigest, archiveManifestRecordDigest, archiveLayers, ociLayers: manifests[0]?.layers ?? [], config });
  }
  return records;
}

export function verifyImageInspect(imageRecord, inspect, revision) {
  const { config, configDigest, manifestDigest } = imageRecord;
  const labels = config.config?.Labels ?? {};
  const sourceRevision = labels['org.opencontainers.image.revision'];
  const source = labels['org.opencontainers.image.source'];
  const product = labels['io.404404.product'];
  const role = labels['io.404404.role'];
  const platform = `${config.os}/${config.architecture}`;
  if (sourceRevision !== revision) throw new Error(`Image ${imageRecord.reference} has an unexpected source revision label.`);
  if (source !== 'https://github.com/404404/AI-Bots') throw new Error(`Image ${imageRecord.reference} has an unexpected source repository label.`);
  if (platform !== 'linux/amd64') throw new Error(`Image ${imageRecord.reference} has an unexpected platform.`);
  if (product !== 'standalone-browser' || role !== imageRecord.name) throw new Error(`Image ${imageRecord.reference} has unexpected product or role labels.`);
  if (inspect.sourceRevision !== sourceRevision || inspect.source !== source || inspect.product !== product || inspect.role !== role || inspect.platform !== platform) throw new Error(`Image ${imageRecord.reference} archive and inspect labels/platform do not match.`);
  if (inspect.id !== configDigest && inspect.id !== manifestDigest) throw new Error(`Image ${imageRecord.reference} inspect ID is not in its verified config/manifest chain.`);
  return { name: imageRecord.name, reference: imageRecord.reference, platform, sourceRevision, configDigest, manifestDigest,
    archiveManifestRecordDigest: imageRecord.archiveManifestRecordDigest, archiveLayers: imageRecord.archiveLayers, ociLayers: imageRecord.ociLayers, inspectId: inspect.id };
}

async function main(env = process.env) {
  const revision = env.SOURCE_REVISION;
  const repository = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;
  const runAttempt = env.GITHUB_RUN_ATTEMPT;
  const archive = 'standalone-browser-candidate.tar';
  if (!/^[a-f0-9]{40}$/u.test(revision ?? '')) throw new Error('SOURCE_REVISION must be a full Git commit SHA.');
  if (repository !== '404404/AI-Bots' || !/^\d+$/u.test(runId ?? '') || !/^\d+$/u.test(runAttempt ?? '') || env.GITHUB_ACTIONS !== 'true') throw new Error('Candidate record must run in the authorized fork workflow.');
  const archived = await readCandidateArchive(archive);
  const images = archived.map((record) => {
    const value = (format) => execFileSync('docker', ['image', 'inspect', '--format', format, record.reference], { encoding: 'utf8' }).trim();
    const inspect = {
      id: value('{{.Id}}'),
      sourceRevision: value('{{ index .Config.Labels "org.opencontainers.image.revision" }}'),
      source: value('{{ index .Config.Labels "org.opencontainers.image.source" }}'),
      product: value('{{ index .Config.Labels "io.404404.product" }}'),
      role: value('{{ index .Config.Labels "io.404404.role" }}'),
      platform: value('{{.Os}}/{{.Architecture}}'),
    };
    return verifyImageInspect(record, inspect, revision);
  });
  const expectedImages = expectedBrowserImages.map(([, image]) => image).sort();
  const archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  writeFileSync('standalone-browser-candidate.json', `${JSON.stringify({
    schemaVersion: 1, repository, product: 'standalone-browser-worker', runId, runAttempt,
    sourceRevision: revision, published: false,
    gates: { unitTests: true, syntaxCheck: true, imageBuild: true, trivyScan: true, chromiumSandboxE2e: true, fixtureIsolationE2e: true },
    archive: { file: archive, sha256: archiveSha256, images: expectedImages }, images,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readCandidateArchive, verifyImageInspect } from '../scripts/candidate-record.mjs';

const revision = 'a'.repeat(40);
const rootUrl = 'https://github.com/404404/AI-Bots';
const baseName = 'node:24.21.0-trixie-slim';
const baseDigest = 'sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66';
const roots = [];
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function put(root, path, bytes) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
function archive(root, names) {
  const path = join(root, 'candidate.tar');
  execFileSync('tar', ['-cf', path, ...names], { cwd: root });
  return path;
}
function config(role) {
  return Buffer.from(JSON.stringify({
    architecture: 'amd64', os: 'linux',
    config: { Labels: {
      'org.opencontainers.image.revision': revision,
      'org.opencontainers.image.source': rootUrl,
      'org.opencontainers.image.base.name': baseName,
      'org.opencontainers.image.base.digest': baseDigest,
      'io.404404.product': 'standalone-browser',
      'io.404404.role': role,
    } },
  }));
}
function legacyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'candidate-record-legacy-')); roots.push(root);
  const image = 'standalone-browser-worker:candidate', role = 'worker';
  const bytes = config(role), digest = sha(bytes), configPath = `${digest.slice(7)}.json`;
  const layerBytes = Buffer.from('legacy docker layer fixture');
  put(root, configPath, bytes);
  put(root, 'layer.tar', layerBytes);
  put(root, 'manifest.json', Buffer.from(JSON.stringify([{ Config: configPath, RepoTags: [image], Layers: ['layer.tar'] }])));
  return { path: archive(root, ['manifest.json', configPath, 'layer.tar']), image, configDigest: digest, layerDigest: sha(layerBytes) };
}
function ociMultiFixture() {
  const root = mkdtempSync(join(tmpdir(), 'candidate-record-oci-')); roots.push(root);
  const targets = [
    ['worker', 'standalone-browser-worker:candidate'],
    ['proxy', 'standalone-browser-proxy:candidate'],
  ];
  const files = new Set(['manifest.json', 'index.json', 'oci-layout']);
  const entries = [], descriptors = [], records = new Map();
  for (const [role, reference] of targets) {
    const configBytes = config(role), configDigest = sha(configBytes), configPath = `blobs/sha256/${configDigest.slice(7)}`;
    put(root, configPath, configBytes); files.add(configPath);
    const layerBytes = Buffer.from(`${role} OCI layer fixture`), layerDigest = sha(layerBytes), layerPath = `blobs/sha256/${layerDigest.slice(7)}`;
    put(root, layerPath, layerBytes); files.add(layerPath);
    const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: configDigest, size: configBytes.length },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: layerDigest, size: layerBytes.length }] }));
    const manifestDigest = sha(manifestBytes), manifestPath = `blobs/sha256/${manifestDigest.slice(7)}`;
    put(root, manifestPath, manifestBytes); files.add(manifestPath);
    entries.push({ Config: configPath, RepoTags: [reference], Layers: [layerPath] });
    // OCI producer annotations carry a generic tag in this archive; config digest binds target to manifest.
    descriptors.push({ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: manifestDigest, size: manifestBytes.length,
      annotations: { 'org.opencontainers.image.ref.name': 'ci', 'io.containerd.image.name': 'docker.io/library/standalone-bot:ci' } });
    records.set(reference, { configDigest, manifestDigest, layerDigest, role });
  }
  put(root, 'manifest.json', Buffer.from(JSON.stringify(entries)));
  put(root, 'index.json', Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: descriptors })));
  put(root, 'oci-layout', Buffer.from(JSON.stringify({ imageLayoutVersion: '1.0.0' })));
  return { path: archive(root, [...files]), targets, records };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('supports classic Docker archive config names and validates inspect ID against config digest', async () => {
  const fixture = legacyFixture();
  const [record] = await readCandidateArchive(fixture.path, [['worker', fixture.image]]);
  assert.equal(record.configDigest, fixture.configDigest);
  assert.equal(record.manifestDigest, null);
  assert.deepEqual(record.archiveLayers.map((layer) => layer.digest), [fixture.layerDigest]);
  const labels = record.config.config.Labels;
  const verified = verifyImageInspect(record, {
    id: fixture.configDigest, sourceRevision: revision, source: rootUrl, baseName, baseDigest,
    product: labels['io.404404.product'], role: 'worker', platform: 'linux/amd64',
  }, revision);
  assert.equal(verified.inspectId, fixture.configDigest);
  assert.equal(verified.baseName, baseName);
  assert.throws(() => verifyImageInspect(record, {
    id: `sha256:${'f'.repeat(64)}`, sourceRevision: revision, source: rootUrl, baseName, baseDigest,
    product: labels['io.404404.product'], role: 'worker', platform: 'linux/amd64',
  }, revision), /inspect ID is not in its verified config\/manifest chain/u);
  assert.throws(() => verifyImageInspect(record, {
    id: fixture.configDigest, sourceRevision: revision, source: rootUrl, baseName,
    baseDigest: `sha256:${'f'.repeat(64)}`, product: labels['io.404404.product'], role: 'worker', platform: 'linux/amd64',
  }, revision), /archive and inspect labels\/platform do not match/u);
});

test('maps OCI multi-target manifests by verified config digest, not generic index annotations', async () => {
  const fixture = ociMultiFixture();
  const records = await readCandidateArchive(fixture.path, fixture.targets);
  assert.equal(records.length, 2);
  for (const record of records) {
    const expected = fixture.records.get(record.reference);
    assert.equal(record.configDigest, expected.configDigest);
    assert.equal(record.manifestDigest, expected.manifestDigest);
    assert.deepEqual(record.archiveLayers.map((layer) => layer.digest), [expected.layerDigest]);
    assert.deepEqual(record.ociLayers.map((layer) => layer.digest), [expected.layerDigest]);
    const labels = record.config.config.Labels;
    const verified = verifyImageInspect(record, {
      id: expected.manifestDigest, sourceRevision: revision, source: rootUrl, baseName, baseDigest,
      product: labels['io.404404.product'], role: expected.role, platform: 'linux/amd64',
    }, revision);
    assert.equal(verified.manifestDigest, expected.manifestDigest);
  }
});

test('rejects OCI manifest bytes with incorrect descriptor digest or size', async () => {
  const fixture = ociMultiFixture();
  const index = JSON.parse(execFileSync('tar', ['-xOf', fixture.path, 'index.json'], { encoding: 'utf8' }));
  index.manifests[0].size += 1;
  const root = mkdtempSync(join(tmpdir(), 'candidate-record-bad-')); roots.push(root);
  const names = execFileSync('tar', ['-tf', fixture.path], { encoding: 'utf8' }).trim().split('\n');
  for (const name of names) put(root, name, execFileSync('tar', ['-xOf', fixture.path, name]));
  put(root, 'index.json', Buffer.from(JSON.stringify(index)));
  const badArchive = archive(root, names);
  await assert.rejects(readCandidateArchive(badArchive, fixture.targets), /failed digest or size validation/u);
});

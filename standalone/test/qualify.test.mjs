import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate } from '../deploy/qualify.mjs';
const ci = {
  databaseId: 123,
  headSha: 'a'.repeat(40),
  workflowName: 'Standalone Bot',
  conclusion: 'success',
};
const good = {
  schemaVersion: 1,
  product: 'standalone-bot',
  repository: '404404/AI-Bots',
  runId: 123,
  commit: ci.headSha,
  imageId: `sha256:${'b'.repeat(64)}`,
  archiveSha256: 'c'.repeat(64),
  platform: 'linux/amd64',
  published: false,
  gates: {
    independentBuild: true,
    protocolTests: true,
    containerSmoke: true,
    restartPersistence: true,
    trivy: true,
  },
};
test('candidate accepts a complete fixed identity and rejects altered provenance, identities and gates', () => {
  assert.equal(validateCandidate(good, ci), good);
  for (const changes of [
    { repository: 'other/repo' },
    { product: 'other' },
    { schemaVersion: 2 },
    { runId: 124 },
    { commit: 'd'.repeat(40) },
    { commit: 'bad' },
    { imageId: 'latest' },
    { archiveSha256: 'bad' },
    { platform: 'linux/arm64' },
    { published: true },
  ])
    assert.throws(() => validateCandidate({ ...good, ...changes }, ci));
  for (const changes of [
    { databaseId: 124 },
    { headSha: 'd'.repeat(40) },
    { workflowName: 'other' },
    { conclusion: 'failure' },
  ])
    assert.throws(() => validateCandidate(good, { ...ci, ...changes }));
  for (const gate of Object.keys(good.gates))
    assert.throws(() =>
      validateCandidate({ ...good, gates: { ...good.gates, [gate]: false } }, ci),
    );
});

test('OCI identity verifies manifest and config references and metadata', async () => {
  const { createHash } = await import('node:crypto');
  const { validateArchiveIdentity } = await import('../deploy/qualify.mjs');
  const digest = (x) => `sha256:${createHash('sha256').update(x).digest('hex')}`;
  const source = {
    architecture: 'amd64',
    os: 'linux',
    config: {
      Labels: {
        'org.opencontainers.image.revision': good.commit,
        'io.404404.product': 'standalone-bot',
      },
    },
  };
  const chain = (config = source) => {
    const configText = JSON.stringify(config);
    const manifestText = JSON.stringify({
      schemaVersion: 2,
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: digest(configText),
        size: Buffer.byteLength(configText),
      },
      layers: [],
    });
    const descriptor = {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: digest(manifestText),
      size: Buffer.byteLength(manifestText),
    };
    return {
      index: { schemaVersion: 2, manifests: [descriptor] },
      manifestText,
      configText,
      manifestId: descriptor.digest,
      configId: digest(configText),
    };
  };
  const c = chain();
  for (const imageId of [c.manifestId, c.configId])
    assert.deepEqual(
      validateArchiveIdentity(c.index, c.manifestText, c.configText, { ...good, imageId }),
      { manifestId: c.manifestId, configId: c.configId },
    );
  const validate = (
    index = c.index,
    manifest = c.manifestText,
    config = c.configText,
    candidate = { ...good, imageId: c.configId },
  ) => validateArchiveIdentity(index, manifest, config, candidate);
  assert.throws(() => validate(c.index, c.manifestText + ' ', c.configText));
  assert.throws(() => validate(c.index, c.manifestText, c.configText + ' '));
  assert.throws(() =>
    validate({
      ...c.index,
      manifests: [{ ...c.index.manifests[0], size: c.index.manifests[0].size + 1 }],
    }),
  );
  assert.throws(() =>
    validate({ ...c.index, manifests: [...c.index.manifests, ...c.index.manifests] }),
  );
  assert.throws(() =>
    validate(c.index, c.manifestText, c.configText, {
      ...good,
      imageId: `sha256:${'f'.repeat(64)}`,
    }),
  );
  const malformedManifest = JSON.parse(c.manifestText);
  malformedManifest.config.size++;
  const altered = JSON.stringify(malformedManifest);
  const alteredIndex = {
    schemaVersion: 2,
    manifests: [
      { ...c.index.manifests[0], digest: digest(altered), size: Buffer.byteLength(altered) },
    ],
  };
  assert.throws(() => validate(alteredIndex, altered, c.configText));
  for (const config of [
    { ...source, architecture: 'arm64' },
    { ...source, os: 'windows' },
    { ...source, config: { Labels: { ...source.config.Labels, 'io.404404.product': 'other' } } },
    {
      ...source,
      config: {
        Labels: { ...source.config.Labels, 'org.opencontainers.image.revision': 'e'.repeat(40) },
      },
    },
  ]) {
    const bad = chain(config);
    assert.throws(() =>
      validate(bad.index, bad.manifestText, bad.configText, { ...good, imageId: bad.configId }),
    );
  }
});

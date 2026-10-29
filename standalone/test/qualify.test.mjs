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

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const commit = process.env.GITHUB_SHA,
  runId = process.env.GITHUB_RUN_ID;
if (!/^[0-9a-f]{40}$/u.test(commit ?? '') || !/^\d+$/u.test(runId ?? ''))
  throw new Error('Invalid candidate identity');
const image = JSON.parse(
  execFileSync('docker', ['image', 'inspect', 'standalone-bot:ci'], { encoding: 'utf8' }),
)[0];
const archiveSha256 = createHash('sha256')
  .update(readFileSync('standalone-candidate.tar'))
  .digest('hex');
writeFileSync(
  'standalone-candidate.json',
  JSON.stringify(
    {
      schemaVersion: 1,
      product: 'standalone-bot',
      repository: '404404/AI-Bots',
      commit,
      runId: Number(runId),
      imageId: image.Id,
      archiveSha256,
      platform: 'linux/amd64',
      gates: {
        independentBuild: true,
        protocolTests: true,
        containerSmoke: true,
        restartPersistence: true,
        trivy: true,
      },
      published: false,
      realModelAcceptance: 'pending',
    },
    null,
    2,
  ) + '\n',
);

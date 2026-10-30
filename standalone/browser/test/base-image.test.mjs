import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../../.github/workflows/standalone-browser.yml', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../deploy/compose.example.yml', import.meta.url), 'utf8');
const candidateRecord = readFileSync(new URL('../scripts/candidate-record.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const seccomp = readFileSync(new URL('../deploy/chromium-userns-seccomp.json', import.meta.url));
const base = 'node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66';

test('container targets and isolated Node tests share the fixed official Node 24.21 Trixie base', () => {
  assert.ok(dockerfile.split('\n').includes(`FROM ${base} AS base`));
  assert.match(dockerfile, /RUN apt-get update \\\n\s+&& apt-get upgrade -y --no-install-recommends/u);
  assert.match(dockerfile, /FROM base AS worker/u);
  assert.match(dockerfile, /FROM base AS proxy/u);
  assert.match(dockerfile, /FROM base AS gateway/u);
  assert.match(dockerfile, /FROM base AS fixture/u);

  const workflowBaseRefs = workflow.match(/node:24\.21\.0-[^\s]+/gu) ?? [];
  assert.deepEqual(workflowBaseRefs, [base, base]);
  assert.match(workflow, /--network none --cap-drop ALL --security-opt no-new-privileges:true/u);
});

test('source identity and security gates remain fixed while the OS base changes', () => {
  const source = 'https://github.com/404404/AI-Bots';
  assert.ok(dockerfile.includes(`org.opencontainers.image.source="${source}"`));
  assert.ok(candidateRecord.includes(`source !== '${source}'`));
  assert.ok(dockerfile.includes(`org.opencontainers.image.base.name="${base.split('@')[0]}"`));
  assert.ok(dockerfile.includes(`org.opencontainers.image.base.digest="${base.split('@')[1]}"`));
  assert.ok(candidateRecord.includes('baseDigest !== expectedBaseDigest'));
  assert.ok(candidateRecord.includes('baseName, baseDigest, configDigest'));
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{SOURCE_REVISION\}"/u);
  assert.ok(readme.includes(base.split('@')[1]));
  assert.ok(readme.includes('sha256:c83040f7e24bacea68e58a0b96a484ba430bf24abb2973eab7ba4701144b7b63'));
  assert.ok(readme.includes('not evidence of a passing Trivy scan'));

  const scans = workflow.match(/      - name: Scan (?:worker|proxy|gateway|fixture) image[\s\S]*?(?=      - name:|      - uses:|$)/gu) ?? [];
  assert.equal(scans.length, 4);
  for (const scan of scans) {
    assert.match(scan, /exit-code: '1'/u);
    assert.match(scan, /ignore-unfixed: false/u);
    assert.match(scan, /severity: CRITICAL,HIGH/u);
  }

  const worker = compose.split('  worker:\n')[1]?.split('\n  gateway:')[0] ?? '';
  assert.match(worker, /network_mode: none/u);
  assert.match(worker, /cap_drop: \[ALL\]/u);
  assert.match(worker, /seccomp=\.\/chromium-userns-seccomp\.json/u);
  assert.equal(createHash('sha256').update(seccomp).digest('hex'), 'a8ec691e2b21a15ccc4ab1d1af7284f900a334887936403ff3b4b51beead1ee4');
});

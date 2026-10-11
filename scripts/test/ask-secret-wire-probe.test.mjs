import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('observes supported model routes without retaining bodies or changing the underlying requests', () => {
  const root = mkdtempSync(join(tmpdir(), 'bh-wire-probe-'));
  const evidence = join(root, 'evidence.ndjson');
  const canaries = join(root, 'canaries.json');
  writeFileSync(canaries, JSON.stringify(['SYNTHETIC-wire-canary']));
  try {
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      const requests = [];
      globalThis.fetch = async (input, init) => {
        requests.push(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.text() : null);
        return new Response('ok');
      };
      await import(${JSON.stringify(pathToFileURL(resolve('scripts/ask-secret-wire-probe.mjs')).href)});
      await fetch('https://provider.example/v1/messages', {method:'POST',body:'safe',headers:{authorization:'private-header'}});
      await fetch('https://go.example/v1/chat/completions', {method:'POST',body:'SYNTHETIC-wire-canary'});
      await fetch(new Request('https://provider.example/v1/responses', {method:'POST',body:'safe-request'}));
      await fetch('https://provider.example/v1/responses', {method:'POST',body:new Uint8Array([1])});
      await fetch('http://127.0.0.1/status', {method:'POST',body:'ordinary'});
      assert.deepEqual(requests, ['safe','SYNTHETIC-wire-canary','safe-request',null,'ordinary']);
    `,
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          BOTHARNESS_PRIVATE_WIRE_EVIDENCE: evidence,
          BOTHARNESS_PRIVATE_CANARY_FILE: canaries,
        },
      },
    );
    const text = readFileSync(evidence, 'utf8');
    const records = text.trim().split('\n').map(JSON.parse);
    expect(records).toHaveLength(4);
    expect(records.map((record) => record.canaryMatches)).toEqual([0, 1, 0, null]);
    expect(records.map((record) => record.bodyAvailable)).toEqual([true, true, true, false]);
    expect(text).not.toContain('SYNTHETIC-wire-canary');
    expect(text).not.toContain('private-header');
    expect(text).not.toContain('safe-request');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

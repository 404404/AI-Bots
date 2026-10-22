import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChromiumStartupOutput } from './chromium-startup-diagnostics.mjs';

test('Chromium diagnostics retain only bounded category codes', () => {
  assert.deepEqual(
    classifyChromiumStartupOutput(
      '[FATAL:zygote_host_impl_linux.cc] Failed to move to new namespace: Operation not permitted',
      'Crashpad handler failed to initialize',
    ),
    ['fatal-check', 'namespace', 'zygote', 'crashpad'],
  );
  assert.deepEqual(
    classifyChromiumStartupOutput('private content and credentials are not emitted'),
    [],
  );
});

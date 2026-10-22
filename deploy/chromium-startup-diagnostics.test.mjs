import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChromiumStartupOutput,
  summarizeChromiumFatalOutput,
} from './chromium-startup-diagnostics.mjs';

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

test('Chromium fatal summary emits only a source location and fixed message class', () => {
  const summary = summarizeChromiumFatalOutput(
    '[17:21:1022/120000.000000:FATAL:zygote_host/zygote_host_impl_linux.cc(241)] Check failed: private-value.',
  );
  assert.deepEqual(summary, {
    source: 'zygote_host_impl_linux.cc',
    line: 241,
    messageClass: 'check-failed',
  });
  assert.equal(JSON.stringify(summary).includes('private-value'), false);
});

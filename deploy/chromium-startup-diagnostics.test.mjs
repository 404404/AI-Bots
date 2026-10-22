import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChromiumStartupOutput,
  summarizeChromiumDiagnosticLogs,
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

test('Chromium log summaries retain source and fixed classes without message text', () => {
  const summaries = summarizeChromiumDiagnosticLogs(
    '[17:21:1022/120000.000000:ERROR:zygote_main_linux.cc(197)] Failed sending zygote boot message: private-value.',
    '[17:21:1022/120000.000001:FATAL:zygote_host/zygote_host_impl_linux.cc:251] Zygote process exited prematurely with exit code 1.',
  );
  assert.deepEqual(summaries, [
    {
      severity: 'ERROR',
      source: 'zygote_main_linux.cc',
      line: 197,
      messageClass: 'zygote-boot-message-send-failed',
    },
    {
      severity: 'FATAL',
      source: 'zygote_host_impl_linux.cc',
      line: 251,
      messageClass: 'zygote-exited-before-ready',
      exitCode: 1,
    },
  ]);
  assert.equal(JSON.stringify(summaries).includes('private-value'), false);
});

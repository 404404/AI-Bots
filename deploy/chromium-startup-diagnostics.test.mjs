import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChromiumStartupOutput,
  summarizeChromiumDiagnosticLogs,
  summarizeChromiumSandboxStatus,
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

test('Crashpad file-open diagnostics retain only an allowlisted sysfs error class', () => {
  const summaries = summarizeChromiumDiagnosticLogs(
    '[17:21:1022/120000.000000:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:145] open /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq: No such file or directory (2)',
    '[17:21:1022/120000.000001:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:145] open /private/profile/secret: Permission denied (13)',
  );
  assert.deepEqual(summaries, [
    {
      severity: 'ERROR',
      source: 'file_io_posix.cc',
      line: 145,
      messageClass: 'optional-cpu-frequency-file-missing',
    },
    {
      severity: 'ERROR',
      source: 'file_io_posix.cc',
      line: 145,
      messageClass: 'crashpad-file-open-error',
    },
  ]);
  assert.equal(JSON.stringify(summaries).includes('/sys/devices'), false);
  assert.equal(JSON.stringify(summaries).includes('/private/profile/secret'), false);
});

test('Chromium sandbox diagnostics report only yes, no, or missing statuses', () => {
  assert.deepEqual(
    summarizeChromiumSandboxStatus('Namespace Sandbox: No\nSeccomp-BPF sandbox: Yes'),
    { namespaceSandbox: 'no', seccompBpf: 'yes' },
  );
  assert.deepEqual(summarizeChromiumSandboxStatus('empty diagnostic page'), {
    namespaceSandbox: 'missing',
    seccompBpf: 'missing',
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChromiumSandboxVerified, readChromiumSandboxStatus } from '../src/sandbox-status.mjs';

test('Chromium sandbox status parser accepts only all three required positive rows', () => {
  const status = readChromiumSandboxStatus('Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox Yes');
  assert.deepEqual(status, { layerOneNamespace: true, pidNamespaces: true, seccompBpf: true });
  assert.equal(isChromiumSandboxVerified(status), true);
});

test('Chromium sandbox status parser preserves the namespace row alias', () => {
  const status = readChromiumSandboxStatus('Namespace sandbox Yes\r\nPID namespaces Yes\r\nSeccomp-BPF sandbox Yes');
  assert.deepEqual(status, { layerOneNamespace: true, pidNamespaces: true, seccompBpf: true });
  assert.equal(isChromiumSandboxVerified(status), true);
});

test('Chromium sandbox status parser rejects missing, negative, and neighboring positive rows', () => {
  for (const text of [
    '',
    'Layer 1 Sandbox Namespace\nPID namespaces No\nSeccomp-BPF sandbox Yes',
    'Layer 1 Sandbox Namespace\nPID namespaces Yes\nSeccomp-BPF sandbox No',
    'Layer 1 Sandbox Namespace No\nPID namespaces Yes\nSeccomp-BPF sandbox Yes',
    'Some unrelated row Yes\nPID namespaces Yes\nSeccomp-BPF sandbox Yes',
    'Layer 1 Sandbox Namespace\nSome PID namespaces Yes\nSeccomp-BPF sandbox Yes',
    'Layer 1 Sandbox Namespace\nPID namespaces Yes\nOther Seccomp-BPF sandbox Yes',
  ]) {
    const status = readChromiumSandboxStatus(text);
    assert.equal(isChromiumSandboxVerified(status), false, text);
  }
});

test('Chromium sandbox parser returns only finite boolean fields', () => {
  const status = readChromiumSandboxStatus('path=/secret/token\nPID namespaces Yes');
  assert.deepEqual(Object.keys(status).sort(), ['layerOneNamespace', 'pidNamespaces', 'seccompBpf']);
  assert.deepEqual(Object.values(status), [false, true, false]);
});

/**
 * Parse only the three Chromium sandbox signals required by the worker gate.
 * Keep the returned value finite and safe to include in diagnostics; never
 * return or log the chrome://sandbox page text itself.
 */
export function readChromiumSandboxStatus(text) {
  const rows = String(text ?? '').toLowerCase().split(/\r?\n/u).map((line) => line.trim().replace(/\s+/gu, ' '));
  const hasRow = (label, value) => rows.some((line) => new RegExp(`^${label}\\s+${value}$`, 'iu').test(line));

  return {
    layerOneNamespace: hasRow('layer 1 sandbox', 'namespace') || hasRow('namespace sandbox', 'yes'),
    pidNamespaces: hasRow('pid namespaces', 'yes'),
    seccompBpf: hasRow('seccomp-bpf sandbox', 'yes'),
  };
}

export function isChromiumSandboxVerified(status) {
  return status?.layerOneNamespace === true
    && status?.pidNamespaces === true
    && status?.seccompBpf === true;
}

const DIAGNOSTIC_PATTERNS = [
  ['fatal-check', /\b(?:FATAL|CHECK failed|Check failed)\b/iu],
  ['sandbox', /sandbox/iu],
  ['namespace', /namespace|operation not permitted/iu],
  ['seccomp', /seccomp/iu],
  ['zygote', /zygote/iu],
  ['x11', /cannot open display|x server|xauthority|x11|display/iu],
  ['dbus', /dbus/iu],
  ['gpu', /gpu|viz|egl|glx/iu],
  ['crashpad', /crashpad|crash handler/iu],
  ['devtools', /devtools|remote debugging/iu],
  ['library-loader', /shared object|symbol lookup|failed to load.*library/iu],
];

export function classifyChromiumStartupOutput(...streams) {
  const output = streams.join('\n');
  return DIAGNOSTIC_PATTERNS.filter(([, pattern]) => pattern.test(output)).map(([code]) => code);
}

export function summarizeChromiumSandboxStatus(text) {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const status = (pattern, mode = 'boolean') => {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) return 'missing';
    const inline = lines[index]
      .replace(pattern, '')
      .replace(/^[\s:=-]+/u, '')
      .trim();
    const value = inline || lines[index + 1] || '';
    if (/\byes\b/iu.test(value)) return 'yes';
    if (/\bno\b|disabled/iu.test(value)) return 'no';
    if (mode === 'layer-one') {
      if (/\bnamespace\b/iu.test(value)) return 'yes';
      if (/\b(?:suid|none)\b/iu.test(value)) return 'no';
    }
    return 'missing';
  };
  const namespaceSandbox = status(/Namespace Sandbox/iu);
  return {
    namespaceSandbox:
      namespaceSandbox === 'missing' ? status(/Layer 1 Sandbox/iu, 'layer-one') : namespaceSandbox,
    seccompBpf: status(/Seccomp-BPF sandbox/iu),
  };
}

export function summarizeChromiumDiagnosticLogs(...streams) {
  return streams
    .join('\n')
    .split(/\r?\n/u)
    .flatMap((line) => {
      const location = /\b(ERROR|FATAL):([^\s()[\]]+?)(?:\((\d+)\)|:(\d+))?\]\s*(.*)$/iu.exec(line);
      if (!location) return [];

      const message = location[5];
      const messageClass =
        /open \/sys\/devices\/system\/cpu\/cpu\d+\/cpufreq\/scaling_(?:cur|max)_freq: No such file or directory \(2\)/iu.test(
          message,
        )
          ? 'optional-cpu-frequency-file-missing'
          : /file_io_posix\.cc$/iu.test(location[2])
            ? 'crashpad-file-open-error'
            : /failed sending zygote boot message/iu.test(message)
              ? 'zygote-boot-message-send-failed'
              : /zygote process exited prematurely/iu.test(message)
                ? 'zygote-exited-before-ready'
                : /failed to receive (?:hello|boot) message from zygote/iu.test(message)
                  ? 'zygote-message-receive-failed'
                  : /no usable sandbox/iu.test(message)
                    ? 'no-usable-sandbox'
                    : /operation not permitted|permission denied|\bEPERM\b/iu.test(message)
                      ? 'permission-denied'
                      : /sandbox|seccomp/iu.test(message)
                        ? 'sandbox-error'
                        : /crashpad/iu.test(message)
                          ? 'crashpad-error'
                          : location[1] === 'FATAL'
                            ? 'other-fatal'
                            : 'other-error';
      const exitCode = /exit code (\d+)/iu.exec(message)?.[1];

      return [
        {
          severity: location[1],
          source: location[2].split(/[\\/]/u).at(-1),
          ...((location[3] ?? location[4]) ? { line: Number(location[3] ?? location[4]) } : {}),
          messageClass,
          ...(exitCode ? { exitCode: Number(exitCode) } : {}),
        },
      ];
    })
    .slice(0, 8);
}

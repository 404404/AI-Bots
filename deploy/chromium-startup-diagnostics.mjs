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

export function summarizeChromiumFatalOutput(...streams) {
  const fatalLine = streams
    .join('\n')
    .split(/\r?\n/u)
    .find((line) => /\bFATAL:/iu.test(line));
  if (!fatalLine) return null;

  const location = /\bFATAL:([^\s()[\]]+)(?:\((\d+)\))?\]/iu.exec(fatalLine);
  const message = location ? fatalLine.slice(location.index + location[0].length) : fatalLine;
  const messageClass = /no usable sandbox/iu.test(message)
    ? 'no-usable-sandbox'
    : /operation not permitted|permission denied|\bEPERM\b/iu.test(message)
      ? 'permission-denied'
      : /zygote.{0,60}(?:exited|failed)|(?:exited|failed).{0,60}zygote/iu.test(message)
        ? 'zygote-startup-failure'
        : /check failed/iu.test(message)
          ? 'check-failed'
          : /crashpad/iu.test(message)
            ? 'crashpad-failure'
            : 'other-fatal';

  return {
    ...(location
      ? {
          source: location[1].split(/[\\/]/u).at(-1),
          ...(location[2] ? { line: Number(location[2]) } : {}),
        }
      : {}),
    messageClass,
  };
}

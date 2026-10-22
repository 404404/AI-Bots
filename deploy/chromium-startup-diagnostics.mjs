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

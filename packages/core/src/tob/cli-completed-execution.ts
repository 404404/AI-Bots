import type { ShellExecution, ShellExecSpec } from '@deepseek-ai/dsh-shell';

export function completedCliExecution(
  spec: ShellExecSpec,
  exitCode: number,
  stdout: string,
  stderr: string,
): ShellExecution {
  const collect = (text: string) => {
    const bytes = Buffer.from(text);
    return {
      text: bytes.subarray(0, spec.stdoutMaxBytes).toString('utf8'),
      truncated: bytes.length > spec.stdoutMaxBytes,
    };
  };
  const out = collect(stdout);
  const err = collect(stderr);
  const reader = (text: string) => ({
    readFrom(offset: number) {
      const bytes = Buffer.from(text);
      return {
        text: bytes.subarray(offset).toString('utf8'),
        nextOffset: bytes.length,
        lossy: false,
      };
    },
  });
  const result = {
    exitCode,
    signal: null,
    aborted: spec.signal?.aborted ?? false,
    timedOut: false,
    timeoutMs: spec.timeoutMs,
    stdout: out,
    stderr: err,
  };
  let read = false;
  return {
    status: 'completed',
    exitCode,
    signal: null,
    done: Promise.resolve(),
    observed: { stdout: reader(out.text), stderr: reader(err.text) },
    kill: () => false,
    readOutput() {
      if (read) return { delta: '', lossy: false };
      read = true;
      return { delta: out.text + err.text, lossy: out.truncated || err.truncated };
    },
    result: async () => result,
  };
}

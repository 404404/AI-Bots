import { realpathSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import {
  ShellExecutor,
  type ShellExecRequest,
  type ShellExecSpec,
  type ShellExecution,
} from '@deepseek-ai/dsh-shell';
import { PRIVATE_COMMAND_IMAGE, type ProtectedExecution } from './protected-execution.js';
import type { SubprocessHandle, SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess';

function within(root: string, path: string): boolean {
  const tail = relative(root, path);
  return tail === '' || (!isAbsolute(tail) && tail !== '..' && !tail.startsWith('..' + sep));
}

function runtimeAuthorityRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (dirname(current) !== current) {
    const manifest = join(current, 'package.json');
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, 'utf8')).name === '@botharness/core'
    )
      return dirname(dirname(current));
    current = dirname(current);
  }
  throw new Error('Host Bundle authority cannot be resolved');
}

const RUNTIME_AUTHORITY_ROOT = runtimeAuthorityRoot();

export function linuxWorkspaceArgs(
  name: string,
  root: string,
  cwd: string,
  home: string,
): string[] {
  const canonicalRoot = realpathSync(root);
  const canonicalCwd = realpathSync(cwd);
  const canonicalHome = realpathSync(home);
  const homeTail = relative(canonicalHome, canonicalRoot).split(sep);
  const botMemory =
    homeTail.length === 4 &&
    homeTail[0] === 'botharness' &&
    homeTail[1] === 'bots' &&
    /^[a-z0-9-]{1,80}$/.test(homeTail[2]!) &&
    homeTail[3] === 'memory';
  const authorities = [
    join(canonicalHome, 'profiles'),
    join(canonicalHome, '.credentials.yaml'),
    dirname(process.execPath),
    RUNTIME_AUTHORITY_ROOT,
  ].map((path) => (existsSync(path) ? realpathSync(path) : resolve(path)));
  if (
    canonicalRoot !== resolve(root) ||
    !within(canonicalRoot, canonicalCwd) ||
    within(canonicalRoot, canonicalHome) ||
    (within(canonicalHome, canonicalRoot) && !botMemory) ||
    within(canonicalRoot, realpathSync(tmpdir())) ||
    root.includes(',') ||
    !lstatSync(canonicalRoot).isDirectory() ||
    authorities.some(
      (authority) => within(canonicalRoot, authority) || within(authority, canonicalRoot),
    )
  )
    throw new Error('Linux execution requires an authorized workspace outside Host authority');
  const args = [
    'run',
    '--rm',
    '--interactive',
    '--name',
    name,
    '--label',
    'ai.botharness.private-command=true',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--user',
    '65534:65534',
    '--pids-limit',
    '128',
    '--memory',
    '256m',
    '--cpus',
    '1',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=32m',
    '--mount',
    `type=bind,src=${canonicalRoot},dst=/workspace`,
    '--workdir',
    '/workspace' +
      (relative(canonicalRoot, canonicalCwd)
        ? '/' + relative(canonicalRoot, canonicalCwd).split(sep).join('/')
        : ''),
  ];
  const git = join(canonicalRoot, '.git');
  if (existsSync(git)) {
    if (!lstatSync(git).isDirectory() || realpathSync(git) !== git)
      throw new Error('Linux workspace Git authority must be a canonical directory');
    args.push('--mount', `type=bind,src=${git},dst=/workspace/.git,readonly`);
  }
  return args;
}

export function quoteShellArgument(value: string): string {
  if (value.includes('\0')) throw new Error('Invalid execution argument');
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export class LinuxShell extends ShellExecutor {
  constructor(
    ctx: Context,
    readonly inner: ShellExecutor,
    readonly execution: ProtectedExecution,
    readonly home: string,
  ) {
    super(ctx);
  }
  override get sandboxMode() {
    return 'workspace-write' as const;
  }
  resolve(request: ShellExecRequest): ShellExecSpec {
    return this.inner.resolve(request);
  }
  async execute(spec: ShellExecSpec): Promise<ShellExecution> {
    if (!(await this.execution.qualified())) throw new Error('Linux execution is unavailable');
    const root = spec.sandboxPolicy?.workspaceRoot;
    if (root === undefined) throw new Error('Linux execution requires an authorized workspace');
    const name = 'botharness-private-command-' + randomUUID();
    const args = linuxWorkspaceArgs(name, root, spec.workdir, this.home);
    args.push('--entrypoint', '/bin/bash', PRIVATE_COMMAND_IMAGE, '-c', spec.command);
    const cleanup = this.execution.trackContainer(name);
    this.execution.log('command-started', { program: 'linux-shell' });
    try {
      const subprocess = this.ctx.get('subprocess');
      if (subprocess === undefined) throw new Error('Native Subprocess Provider is unavailable');
      const controller = new AbortController();
      let cause: 'timeout' | 'abort' | undefined;
      const abort = () => {
        cause ??= 'abort';
        controller.abort();
      };
      if (spec.signal?.aborted) abort();
      spec.signal?.addEventListener('abort', abort, { once: true });
      const timer =
        spec.onExpiry === 'kill'
          ? setTimeout(() => {
              cause ??= 'timeout';
              controller.abort();
            }, spec.timeoutMs)
          : undefined;
      let handle: SubprocessHandle;
      try {
        handle = subprocess.spawn({
          argv: ['docker', ...args],
          cwd: tmpdir(),
          stdio: {
            stdin: spec.stdin === undefined ? 'ignore' : { data: spec.stdin },
            stdout: { maxBytes: spec.stdoutMaxBytes, spill: { maxBytes: 1_048_576 } },
            stderr: { maxBytes: 16_384, spill: { maxBytes: 1_048_576 } },
          },
          graceMs: 1000,
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        spec.signal?.removeEventListener('abort', abort);
        throw new Error('Linux command could not spawn');
      }
      const stdout = handle.collected.stdout;
      const stderr = handle.collected.stderr;
      if (stdout === undefined || stderr === undefined) {
        handle.terminate();
        clearTimeout(timer);
        spec.signal?.removeEventListener('abort', abort);
        throw new Error('Linux command output collection is unavailable');
      }
      let status: ShellExecution['status'] = 'running';
      let exitCode: number | null = null;
      let signal: NodeJS.Signals | null = null;
      let failed = false;
      let outOffset = 0;
      let errOffset = 0;
      const done = handle.done
        .then(
          (value) => {
            exitCode = value.exitCode;
            signal = value.signal;
            status = signal === null ? 'completed' : 'killed';
          },
          () => {
            failed = true;
            status = 'killed';
          },
        )
        .finally(async () => {
          clearTimeout(timer);
          spec.signal?.removeEventListener('abort', abort);
          await cleanup();
          this.execution.log('command-completed', { program: 'linux-shell' });
        });
      const collect = (reader: SubprocessOutputReader) => {
        const value = reader.readFrom(0);
        return {
          text: value.text,
          truncated: value.lossy,
          ...(value.spillPath === undefined ? {} : { spillPath: value.spillPath }),
        };
      };
      let result: ReturnType<ShellExecution['result']> | undefined;
      return {
        get status() {
          return status;
        },
        get exitCode() {
          return exitCode;
        },
        get signal() {
          return signal;
        },
        done,
        observed: { stdout, stderr },
        readOutput: () => {
          const out = stdout.readFrom(outOffset);
          const err = stderr.readFrom(errOffset);
          outOffset = out.nextOffset;
          errOffset = err.nextOffset;
          return {
            delta: out.text + (err.text ? '\n[stderr]\n' + err.text : ''),
            lossy: out.lossy || err.lossy,
            ...(out.spillPath ? { stdoutSpillPath: out.spillPath } : {}),
            ...(err.spillPath ? { stderrSpillPath: err.spillPath } : {}),
          };
        },
        kill: () => {
          if (status !== 'running') return false;
          abort();
          handle.terminate();
          void cleanup();
          return true;
        },
        result: () =>
          (result ??= (async () => {
            await done;
            if (failed) throw new Error('Linux command infrastructure failed');
            return {
              exitCode,
              signal,
              timedOut: cause === 'timeout',
              aborted: cause === 'abort',
              timeoutMs: spec.timeoutMs,
              stdout: collect(stdout),
              stderr: collect(stderr),
              sandbox: { mode: 'workspace-write' as const, denied: false },
            };
          })()),
      };
    } catch {
      await cleanup();
      throw new Error('Linux execution could not start');
    }
  }
}

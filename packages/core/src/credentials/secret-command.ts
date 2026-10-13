import { spawn } from 'node:child_process';

export class SecretCommandRefusal extends Error {}

export interface SecretCommandResult {
  consumer: 'command-v1';
  successful: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export const SECRET_COMMAND_OUTPUT_LIMIT = 32_000;
export const SECRET_COMMAND_TIMEOUT_MS = 120_000;

const INTERPRETERS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'pwsh',
  'powershell',
  'cmd',
  'env',
  'printenv',
  'xargs',
  'sudo',
  'doas',
  'su',
  'nohup',
  'time',
  'timeout',
  'watch',
  'node',
  'nodejs',
  'deno',
  'bun',
  'npx',
  'python',
  'python2',
  'python3',
  'ruby',
  'perl',
  'php',
  'lua',
  'awk',
  'gawk',
  'sed',
  'osascript',
  'make',
  'find',
]);

const RESERVED_ENV =
  /^(?:PATH|HOME|USER|SHELL|IFS|ENV|BASH_ENV|TMPDIR|TERM|LANG|PWD|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|RUBYOPT|GIT_SSH_COMMAND|GIT_ASKPASS|SSH_ASKPASS|EDITOR|VISUAL|PAGER|LD_.*|DYLD_.*|LC_.*)$/;

export function secretCommandProgram(program: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(program))
    throw new SecretCommandRefusal('program must be a bare program name without a path');
  if (INTERPRETERS.has(program.toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '')))
    throw new SecretCommandRefusal(
      'program is a shell, interpreter or launcher; name the command-line tool itself',
    );
  return program;
}

export function secretCommandArgs(args: readonly string[]): string[] {
  if (args.length > 64) throw new SecretCommandRefusal('at most 64 arguments are allowed');
  for (const arg of args)
    if (arg.length > 4_000 || arg.includes('\0'))
      throw new SecretCommandRefusal('an argument is too long or contains a NUL byte');
  return [...args];
}

export function secretCommandEnvName(name: string): string {
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name) || RESERVED_ENV.test(name))
    throw new SecretCommandRefusal(
      'environment variable name is not allowed; use the name the tool documents for its credential',
    );
  return name;
}

export function secretCommandBaseEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept =
    process.platform === 'win32'
      ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP']
      : ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR'];
  const env: NodeJS.ProcessEnv = { TERM: 'dumb', NO_COLOR: '1' };
  for (const name of kept) if (source[name] !== undefined) env[name] = source[name];
  return env;
}

export function maskSecrets(text: string, secrets: readonly string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret.length < 6) continue;
    for (const form of new Set([
      secret,
      Buffer.from(secret, 'utf8').toString('base64'),
      Buffer.from(secret, 'utf8').toString('base64').replace(/=+$/, ''),
      Buffer.from(secret, 'utf8').toString('base64url'),
      Buffer.from(secret, 'utf8').toString('hex'),
      encodeURIComponent(secret),
    ]))
      masked = masked.split(form).join('[secret]');
  }
  return masked;
}

export function runSecretCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  secrets: readonly string[],
  signal: AbortSignal,
  timeoutMs = SECRET_COMMAND_TIMEOUT_MS,
): Promise<SecretCommandResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || argv[0] === undefined) {
      reject(new Error('Secret command cancelled'));
      return;
    }
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    let truncated = false;
    let stopped = false;
    const stop = () => {
      stopped = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(stop, timeoutMs);
    signal.addEventListener('abort', stop, { once: true });
    for (const stream of ['stdout', 'stderr'] as const)
      child[stream].on('data', (chunk: Buffer) => {
        const room = SECRET_COMMAND_OUTPUT_LIMIT * 4 - output[stream].length;
        if (room <= 0) {
          truncated = true;
          return;
        }
        output[stream] += chunk.toString('utf8').slice(0, room);
      });
    child.on('error', () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      reject(new SecretCommandRefusal('the program could not be started; is it installed?'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (stopped) {
        reject(new Error('Secret command timed out or was cancelled'));
        return;
      }
      const clip = (text: string): string => {
        const masked = maskSecrets(text, secrets);
        if (masked.length <= SECRET_COMMAND_OUTPUT_LIMIT) return masked;
        truncated = true;
        return masked.slice(0, SECRET_COMMAND_OUTPUT_LIMIT);
      };
      const stdout = clip(output.stdout);
      const stderr = clip(output.stderr);
      resolve({
        consumer: 'command-v1',
        successful: code === 0,
        exitCode: code,
        stdout,
        stderr,
        truncated,
      });
    });
  });
}

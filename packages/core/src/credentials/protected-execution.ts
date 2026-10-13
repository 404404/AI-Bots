import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { PrivateInputLog } from './diagnostics.js';

const execute = promisify(execFile);
export const PRIVATE_COMMAND_IMAGE =
  'node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392';
const AUTHENTICATED_STATUS_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>60000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const values=JSON.parse(input); input='';
    const url=new URL(values.endpoint);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) process.exit(2);
    if(url.protocol==='http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) process.exit(2);
    const response=await fetch(url, {method:'GET', redirect:'error',
      headers:{'x-api-key':values.api_key,'x-api-secret':values.api_secret}, signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    process.stdout.write(String(response.status));
  } catch { process.exitCode=2; }
});
`;

const AUTHENTICATED_REQUEST_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>200000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const request=JSON.parse(input); input='';
    const response=await fetch(request.url, {method:request.method, redirect:'error', headers:request.headers,
      ...(request.body===undefined ? {} : {body:request.body}), signal:AbortSignal.timeout(20000)});
    const reader=response.body?.getReader(); const chunks=[]; let size=0; let truncated=false;
    while(reader){ const {done,value}=await reader.read(); if(done) break; size+=value.length;
      if(size>request.limit){ truncated=true; await reader.cancel(); break; } chunks.push(value); }
    let text=Buffer.concat(chunks).toString('utf8');
    for(const secret of request.mask){ for(const form of [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)])
      if(form.length>=6) text=text.split(form).join('[secret]'); }
    process.stdout.write(JSON.stringify({status:response.status, contentType:response.headers.get('content-type')??'', body:text, truncated}));
  } catch { process.exitCode=2; }
});
`;

export interface SecretHttpRequest {
  endpoint: string;
  path: string;
  method: string;
  headers: Array<{ name: string; value: string }>;
  query: Array<{ name: string; value: string }>;
  body?: string;
}

export interface SecretHttpResult {
  consumer: 'http-request-v1';
  httpStatus: number;
  successful: boolean;
  contentType: string;
  body: string;
  truncated: boolean;
}

const SECRET_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_HTTP_FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
]);
const SECRET_HTTP_BODY_LIMIT = 64_000;
const SECRET_HTTP_RESPONSE_LIMIT = 32_000;

export class SecretHttpRefusal extends Error {}

export function secretHttpTarget(endpoint: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(endpoint);
  } catch {
    throw new SecretHttpRefusal('The Owner-supplied endpoint is not a valid URL');
  }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password)
    throw new SecretHttpRefusal(
      'The Owner-supplied endpoint must be an http(s) URL without credentials',
    );
  if (base.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
    throw new SecretHttpRefusal('Plain http is allowed only for a local endpoint');
  if (base.hash !== '')
    throw new SecretHttpRefusal('The Owner-supplied endpoint must not carry a fragment');
  if (
    path !== '' &&
    (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path))
  )
    throw new SecretHttpRefusal('path must be empty or start with a single /');
  const target = new URL(base.pathname.replace(/\/$/, '') + path, base.origin);
  const prefix = base.pathname.replace(/\/$/, '');
  if (
    target.origin !== base.origin ||
    (prefix !== '' && target.pathname !== prefix && !target.pathname.startsWith(prefix + '/'))
  )
    throw new SecretHttpRefusal('path leaves the Owner-supplied endpoint');
  const merged = new URLSearchParams(base.search);
  for (const [name, value] of target.searchParams) merged.append(name, value);
  target.search = merged.toString();
  return target;
}

export function privateCommandArgs(name: string): string[] {
  return [
    'run',
    '--rm',
    '--interactive',
    '--name',
    name,
    '--label',
    'ai.botharness.private-command=true',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--user',
    '65534:65534',
    '--pids-limit',
    '64',
    '--memory',
    '128m',
    '--cpus',
    '1',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--workdir',
    '/tmp',
    '--entrypoint',
    '/bin/sh',
    PRIVATE_COMMAND_IMAGE,
    '-s',
  ];
}
export class ProtectedExecution {
  #closed = false;
  readonly #children = new Set<ReturnType<typeof spawn>>();
  readonly #containers = new Set<string>();
  readonly #groups = new Set<string>();
  constructor(readonly log: PrivateInputLog) {}

  async qualified(): Promise<boolean> {
    if (this.#closed) return false;
    try {
      const result = await execute('docker', ['info', '--format', '{{.OSType}}'], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024,
      });
      await execute('docker', ['image', 'inspect', PRIVATE_COMMAND_IMAGE], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 64_000,
      });
      return result.stdout.trim() === 'linux';
    } catch {
      return false;
    }
  }

  async command(command: string, signal: AbortSignal): Promise<string> {
    if (command.length > 16_000 || signal.aborted || !(await this.qualified()))
      throw new Error('Protected command execution is unavailable');
    const name = 'botharness-private-command-' + randomUUID();
    this.#containers.add(name);
    const started = Date.now();
    this.log('command-started', { program: 'isolated-shell' });
    try {
      const output = await this.#spawn('docker', privateCommandArgs(name), command, signal, false);
      this.log('command-completed', {
        program: 'isolated-shell',
        durationMs: Date.now() - started,
      });
      return output;
    } finally {
      await this.#remove(name);
    }
  }

  async authenticatedStatus(
    values: Record<string, string>,
    signal: AbortSignal,
  ): Promise<{ consumer: string; successful: boolean; httpStatus: number; action?: string }> {
    if (Object.keys(values).sort().join(',') !== 'api_key,api_secret,endpoint')
      throw new Error('http-status-v1 requires endpoint, api_key and api_secret references');
    if (signal.aborted || this.#closed) throw new Error('Protected credential execution cancelled');
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-status-v1' });
    const output = await this.#spawn(
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_STATUS_CLI],
      JSON.stringify(values),
      signal,
      true,
    );
    if (!/^[1-5][0-9]{2}$/.test(output))
      throw new Error('Protected CLI returned an invalid nonsecret result');
    const httpStatus = Number(output);
    this.log('credential-cli-completed', {
      program: 'http-status-v1',
      durationMs: Date.now() - started,
    });
    return {
      consumer: 'http-status-v1',
      successful: httpStatus >= 200 && httpStatus < 300,
      httpStatus,
      ...([401, 403].includes(httpStatus)
        ? {
            action:
              'Replace private information in Web Chat and retry; remote authorization may also need repair.',
          }
        : {}),
    };
  }

  async authenticatedRequest(
    request: SecretHttpRequest,
    secrets: readonly string[],
    signal: AbortSignal,
  ): Promise<SecretHttpResult> {
    const method = request.method.toUpperCase();
    if (!SECRET_HTTP_METHODS.has(method)) throw new SecretHttpRefusal('method is not supported');
    const target = secretHttpTarget(request.endpoint, request.path);
    for (const entry of request.query) {
      if (entry.name.length === 0 || entry.name.length > 200)
        throw new SecretHttpRefusal('query name is invalid');
      target.searchParams.append(entry.name, entry.value);
    }
    const headers: Record<string, string> = {};
    for (const entry of request.headers) {
      const name = entry.name.toLowerCase();
      if (
        !/^[a-z0-9!#$%&'*+.^_\`|~-]{1,100}$/.test(name) ||
        SECRET_HTTP_FORBIDDEN_HEADERS.has(name) ||
        /[\r\n]/.test(entry.value) ||
        entry.value.length > 8_000
      )
        throw new SecretHttpRefusal('header is not allowed');
      headers[name] = entry.value;
    }
    if (
      request.body !== undefined &&
      (method === 'GET' || request.body.length > SECRET_HTTP_BODY_LIMIT)
    )
      throw new SecretHttpRefusal('body is not allowed for this request');
    if (signal.aborted || this.#closed) throw new Error('Protected credential execution cancelled');
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-request-v1' });
    const output = await this.#spawn(
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_REQUEST_CLI],
      JSON.stringify({
        url: target.href,
        method,
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        mask: [...secrets, ...new URL(request.endpoint).searchParams.values()].filter(
          (value) => value.length >= 6,
        ),
        limit: SECRET_HTTP_RESPONSE_LIMIT,
      }),
      signal,
      true,
      SECRET_HTTP_RESPONSE_LIMIT * 8,
      30_000,
    );
    let parsed: { status?: unknown; contentType?: unknown; body?: unknown; truncated?: unknown };
    try {
      parsed = JSON.parse(output) as typeof parsed;
    } catch {
      throw new Error('Protected request returned an invalid result');
    }
    if (
      typeof parsed.status !== 'number' ||
      typeof parsed.contentType !== 'string' ||
      typeof parsed.body !== 'string'
    )
      throw new Error('Protected request returned an invalid result');
    this.log('credential-cli-completed', {
      program: 'http-request-v1',
      durationMs: Date.now() - started,
    });
    return {
      consumer: 'http-request-v1',
      httpStatus: parsed.status,
      successful: parsed.status >= 200 && parsed.status < 300,
      contentType: parsed.contentType.slice(0, 200),
      body: parsed.body,
      truncated: parsed.truncated === true,
    };
  }

  #spawn(
    program: string,
    args: string[],
    stdin: string,
    signal: AbortSignal,
    credentialBearing: boolean,
    outputLimit?: number,
    timeoutMs?: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.#closed || signal.aborted) {
        reject(new Error('Protected execution cancelled'));
        return;
      }
      const child = spawn(program, args, {
        windowsHide: true,
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(credentialBearing
          ? { env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {} }
          : {}),
      });
      this.#children.add(child);
      let output = '';
      let failed = false;
      const limit = outputLimit ?? (credentialBearing ? 3 : 16_000);
      const stop = () => {
        failed = true;
        child.kill();
      };
      const timer = setTimeout(stop, timeoutMs ?? (credentialBearing ? 15_000 : 30_000));
      signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > limit) {
          output = '';
          stop();
        }
      });
      child.stderr.on('data', () => undefined);
      child.stdin.on('error', () => stop());
      child.on('error', () => {
        failed = true;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        this.#children.delete(child);
        if (failed || code !== 0 || signal.aborted) {
          this.log('execution-failed');
          reject(new Error('Protected execution failed or was cancelled'));
        } else resolve(output);
      });
      child.stdin.end(stdin);
    });
  }

  async #remove(name: string): Promise<void> {
    try {
      await execute('docker', ['rm', '--force', name], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024,
      });
      this.#containers.delete(name);
    } catch {
      try {
        const { stdout } = await execute(
          'docker',
          ['ps', '--all', '--quiet', '--filter', 'name=^/' + name + '$'],
          { windowsHide: true, timeout: 10_000, maxBuffer: 1024 },
        );
        if (!stdout.trim()) {
          this.#containers.delete(name);
          return;
        }
      } catch {}
      this.log('container-cleanup-failed');
    }
  }

  trackContainer(name: string): () => Promise<void> {
    if (this.#closed) throw new Error('Protected execution is closed');
    this.#containers.add(name);
    let cleanup: Promise<void> | undefined;
    return () => (cleanup ??= this.#remove(name));
  }

  trackContainerGroup(label: string): () => Promise<void> {
    if (this.#closed || !/^ai\.botharness\.mcp-owner=[0-9a-f-]{36}$/.test(label))
      throw new Error('Invalid Linux MCP owner');
    this.#groups.add(label);
    let cleanup: Promise<void> | undefined;
    return () => (cleanup ??= this.#removeGroup(label));
  }

  async #removeGroup(label: string): Promise<void> {
    try {
      const { stdout } = await execute(
        'docker',
        ['ps', '--all', '--quiet', '--filter', 'label=' + label],
        { windowsHide: true, timeout: 10_000, maxBuffer: 4096 },
      );
      const ids = stdout.trim().split(/\s+/).filter(Boolean);
      if (ids.some((id) => !/^[0-9a-f]{12,64}$/.test(id)))
        throw new Error('Invalid container identity');
      if (ids.length)
        await execute('docker', ['rm', '--force', ...ids], {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 4096,
        });
      this.#groups.delete(label);
    } catch {
      this.log('container-cleanup-failed');
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const child of this.#children) child.kill();
    await Promise.allSettled([...this.#containers].map((name) => this.#remove(name)));
    await Promise.allSettled([...this.#groups].map((label) => this.#removeGroup(label)));
  }
}

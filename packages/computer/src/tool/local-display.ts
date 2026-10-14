import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

export interface LocalDisplay {
  readonly display: string;
  readonly env: Readonly<Record<string, string>>;
  readonly managed: boolean;
  alive(): boolean;
  stop(): Promise<void>;
}

export const LOCAL_DISPLAY_SCREEN = '1440x900x24';

export const LOCAL_WINDOW_MANAGERS = [
  'openbox',
  'xfwm4',
  'fluxbox',
  'icewm',
  'matchbox-window-manager',
] as const;

export const LOCAL_DESKTOP_PACKAGES = 'sudo apt install xvfb openbox at-spi2-core';

export const NO_DISPLAY_MESSAGE = `This Linux Host has no desktop display and Xvfb is not installed. Install a virtual desktop (for example \`${LOCAL_DESKTOP_PACKAGES}\`) so BotHarness can start one, or run DSH inside a desktop session, then check again.`;

export const NO_WINDOW_MANAGER_MESSAGE = `This Linux Host has no window manager for its virtual display, so apps cannot take input focus. Install one (for example \`${LOCAL_DESKTOP_PACKAGES}\`), then check again.`;

async function findOnPath(name: string, path: string | undefined): Promise<string | undefined> {
  for (const dir of (path ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

interface Owned {
  readonly child: ChildProcess;
  exited: boolean;
}

function own(child: ChildProcess): Owned {
  const owned: Owned = { child, exited: false };
  child.once('exit', () => {
    owned.exited = true;
  });
  child.once('error', () => {
    owned.exited = true;
  });
  return owned;
}

async function terminate(owned: Owned): Promise<void> {
  if (owned.exited) return;
  const done = new Promise<void>((resolve) => owned.child.once('exit', () => resolve()));
  owned.child.kill('SIGTERM');
  await done;
}

function firstLine(
  owned: Owned,
  stream: NodeJS.ReadableStream | null | undefined,
  what: string,
  options: { signal?: AbortSignal | undefined; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    let stderr = '';
    owned.child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    const timer = setTimeout(
      () => finish(new Error(`${what} did not start in time`)),
      options.timeoutMs,
    );
    const onAbort = (): void => finish(new Error('Local Computer setup cancelled'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const onExit = (code: number | null): void =>
      finish(
        new Error(
          `${what} exited (code ${String(code)}): ${stderr.trim().split('\n').pop() ?? ''}`,
        ),
      );
    owned.child.once('exit', onExit);
    let settled = false;
    function finish(result: Error | string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      owned.child.off('exit', onExit);
      if (typeof result === 'string') resolve(result);
      else reject(result);
    }
    stream?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('\n')) finish(out.trim());
    });
  });
}

export async function ensureLocalDisplay(options: {
  source?: NodeJS.ProcessEnv | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}): Promise<LocalDisplay> {
  const source = options.source ?? process.env;
  const existing = source['DISPLAY'] ?? '';
  if (existing !== '' || (source['WAYLAND_DISPLAY'] ?? '') !== '') {
    options.onEvent?.(`phase=display source=session display=${existing || 'wayland'}`);
    return {
      display: existing,
      env: {},
      managed: false,
      alive: () => true,
      stop: async () => undefined,
    };
  }
  const path = source['PATH'];
  const xvfb = await findOnPath('Xvfb', path);
  if (xvfb === undefined) throw new Error(NO_DISPLAY_MESSAGE);
  let wm: string | undefined;
  for (const name of LOCAL_WINDOW_MANAGERS)
    if ((wm ??= await findOnPath(name, path)) !== undefined) break;
  if (wm === undefined) throw new Error(NO_WINDOW_MANAGER_MESSAGE);
  const dbus = await findOnPath('dbus-daemon', path);

  const timeoutMs = options.timeoutMs ?? 10_000;
  const started = Date.now();
  const children: Owned[] = [];
  const stop = async (): Promise<void> => {
    const running = children.splice(0).reverse();
    for (const owned of running) await terminate(owned);
    if (running.length > 0) options.onEvent?.('phase=display-stopped');
  };
  try {
    const server = own(
      spawn(xvfb, ['-displayfd', '3', '-screen', '0', LOCAL_DISPLAY_SCREEN, '-nolisten', 'tcp'], {
        stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
      }),
    );
    children.push(server);
    const display = `:${await firstLine(server, server.child.stdio[3] as NodeJS.ReadableStream, 'Xvfb', { signal: options.signal, timeoutMs })}`;
    const env: Record<string, string> = {};
    if (dbus !== undefined) {
      const bus = own(
        spawn(dbus, ['--session', '--nofork', '--nopidfile', '--print-address=1'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: path ?? '', HOME: source['HOME'] ?? '', DISPLAY: display },
        }),
      );
      children.push(bus);
      env['DBUS_SESSION_BUS_ADDRESS'] = await firstLine(bus, bus.child.stdout, 'D-Bus', {
        signal: options.signal,
        timeoutMs,
      });
    }
    const manager = own(
      spawn(wm, [], {
        stdio: 'ignore',
        env: { ...source, DISPLAY: display, ...env },
      }),
    );
    children.push(manager);
    options.onEvent?.(
      `phase=display source=xvfb display=${display} wm=${wm.split('/').pop() ?? wm} dbus=${String(dbus !== undefined)} durationMs=${String(Date.now() - started)}`,
    );
    return {
      display,
      env,
      managed: true,
      alive: () => children.length > 0 && children.every((owned) => !owned.exited),
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

type Call = { method: string; path: string; body: unknown };
type Answer = { status?: number; json?: unknown; bytes?: Buffer };

async function host(route: (call: Call) => Answer) {
  const calls: Call[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    if (req.method === 'GET' && url.searchParams.has('token') && url.pathname === '/') {
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    let parsed: unknown = text === '' ? undefined : text;
    try {
      parsed = JSON.parse(text);
    } catch {
      void 0;
    }
    const rpc = (parsed as { type?: string } | undefined)?.type === 'client-request';
    const envelope = parsed as { method: string; rpcId: string; payload: { args: unknown } };
    const call: Call = {
      method: req.method!,
      path: rpc ? envelope.method.replace('botharness/', '') : url.pathname + url.search,
      body: rpc ? envelope.payload.args : parsed,
    };
    calls.push(call);
    const answer = route(call);
    if (rpc) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: answer.json }),
      );
      return;
    }
    if (answer.bytes !== undefined) {
      res.writeHead(answer.status ?? 200, { 'content-type': 'application/x-tar' });
      res.end(answer.bytes);
      return;
    }
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.json ?? { ok: true }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url: string, stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(out) as Record<string, unknown> };
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'bh-cli-bc-'));
  dirs.push(dir);
  return dir;
}

describe('Browser observation, takeover audit and profile commands', () => {
  it('reads the observation and saves its picture instead of printing it', async () => {
    const out = join(scratch(), 'frame.png');
    const live = await host(() => ({
      json: {
        ok: true,
        running: true,
        frame: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
        focused: 'tab-2',
        tabs: [{ tabId: 'tab-2', url: 'https://example.com' }],
      },
    }));
    const result = await invoke(
      ['browser-observation', 'ada', '--tab', 'tab-2', '--out', out],
      live.url,
    );
    expect(result.json).toMatchObject({
      running: true,
      focused: 'tab-2',
      frame: { mimeType: 'image/png', bytes: 9, path: out },
    });
    expect(readFileSync(out, 'utf8')).toBe('png-bytes');
    const summary = await invoke(['browser-observation', 'ada'], live.url);
    expect(summary.json['frame']).toEqual({ mimeType: 'image/png', bytes: 9 });
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/browser/observation?slug=ada&tab=tab-2',
      '/api/browser/observation?slug=ada',
    ]);
  });

  it('reads the takeover audit and one recording with its token from stdin', async () => {
    const live = await host((call) =>
      call.path.startsWith('/api/browser/takeover/audit')
        ? { json: { ok: true, events: [{ at: 1, kind: 'mint', detail: 'login' }] } }
        : { json: { ok: true, slug: 'ada', state: 'completed', events: [] } },
    );
    expect((await invoke(['browser-takeover-audit', 'ada'], live.url)).json).toEqual({
      ok: true,
      events: [{ at: 1, kind: 'mint', detail: 'login' }],
    });
    expect(
      (await invoke(['browser-takeover-recording', '--token-stdin'], live.url, 'abc123\n')).json,
    ).toMatchObject({ slug: 'ada', state: 'completed' });
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/browser/takeover/audit?slug=ada',
      '/api/browser/takeover/recording?token=abc123',
    ]);
    const refused = await invoke(['browser-takeover-recording'], live.url);
    expect(refused.code).toBe(2);
    expect(refused.json['error']).toMatchObject({ code: 'usage' });
  });

  it("sets a Bot's Browser profile through the bridge owner", async () => {
    const live = await host(() => ({ json: { ok: true, value: { bot: { slug: 'ada' } } } }));
    const result = await invoke(['browser-profile-set', 'ada', '--profile', 'work'], live.url);
    expect(result.json).toEqual({ bot: { slug: 'ada' } });
    expect(live.calls).toEqual([
      { method: 'POST', path: 'browserProfileSet', body: { slug: 'ada', profile: 'work' } },
    ]);
    expect((await invoke(['browser-profile-set', 'ada'], live.url)).code).toBe(2);
  });
});

describe('Package installs', () => {
  it('refuses without --confirm and reports the Host refusal with its code', async () => {
    const live = await host(() => ({
      status: 403,
      json: { ok: false, code: 'needs-administrator', error: 'administrator rights required' },
    }));
    const missing = await invoke(['browser-install-packages', '--package', 'libnss3'], live.url);
    expect(missing.code).toBe(2);
    expect(live.calls).toEqual([]);
    const refused = await invoke(
      ['browser-install-packages', '--package', 'libnss3', '--confirm'],
      live.url,
    );
    expect(refused.json['error']).toEqual({
      code: 'needs-administrator',
      message: 'administrator rights required',
    });
    expect(live.calls[0]).toEqual({
      method: 'POST',
      path: '/api/browser/install-packages',
      body: { authorize: true, packages: ['libnss3'] },
    });
  });

  it('starts an install and waits until it settles', async () => {
    let reads = 0;
    const live = await host((call) => {
      if (call.method === 'POST') return { json: { ok: true, started: true } };
      reads += 1;
      return {
        json: {
          target: 'local',
          install: { state: reads < 2 ? 'installing' : 'installed', packages: ['xvfb'] },
        },
      };
    });
    const result = await invoke(['computer-install-packages', '--confirm', '--wait'], live.url);
    expect(result.json['install']).toEqual({ state: 'installed', packages: ['xvfb'] });
    expect(live.calls.map((call) => [call.method, call.path])).toEqual([
      ['POST', '/api/computer/install-packages'],
      ['GET', '/api/computer/status'],
      ['GET', '/api/computer/status'],
    ]);
    expect(live.calls[0]!.body).toEqual({ authorize: true });
  });

  it('reads Browser package access', async () => {
    const live = await host(() => ({ json: { ok: true, access: 'sudo' } }));
    expect((await invoke(['browser-packages'], live.url)).json).toEqual({
      ok: true,
      access: 'sudo',
    });
  });
});

describe('Computer diagnostics and logs', () => {
  it('reads diagnostics and filtered logs', async () => {
    const live = await host(() => ({ json: { ok: true, events: [], entries: [] } }));
    await invoke(['computer-diagnostics'], live.url);
    await invoke(
      ['computer-logs', '--bot', 'ada', '--plugin', 'botharness-computer', '--limit', '20'],
      live.url,
    );
    expect(live.calls.map((call) => call.path)).toEqual([
      '/api/computer/diagnostics',
      '/api/computer/logs?plugin=botharness-computer&owner=bot%3Aada&limit=20',
    ]);
    expect((await invoke(['computer-logs', '--limit', 'many'], live.url)).code).toBe(2);
  });
});

describe('Container Computer transfer', () => {
  it('exports and downloads an archive without printing the download token', async () => {
    const out = join(scratch(), 'computer.tar');
    const live = await host((call) =>
      call.path.startsWith('/api/computer/download')
        ? { bytes: Buffer.from('tar-bytes') }
        : {
            json: {
              ok: true,
              archive: '/exports/computer-1.tar',
              downloadToken: 'one-time-download',
            },
          },
    );
    const result = await invoke(['computer-export', '--dir', '/exports', '--out', out], live.url);
    expect(result.json).toEqual({
      ok: true,
      archive: '/exports/computer-1.tar',
      download: { path: out, bytes: 9 },
    });
    expect(JSON.stringify(result.json)).not.toContain('one-time-download');
    expect(readFileSync(out, 'utf8')).toBe('tar-bytes');
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/computer/export', { authorize: true, dir: '/exports' }],
      ['GET', '/api/computer/download?token=one-time-download', undefined],
    ]);
  });

  it('uploads a local archive, lists it, and imports it only with --confirm', async () => {
    const file = join(scratch(), 'backup.tar');
    writeFileSync(file, 'archive-content');
    const live = await host((call) => {
      if (call.path === '/api/computer/upload') return { json: { ok: true, uploadToken: 'up-1' } };
      if (call.path === '/api/computer/exports')
        return { json: { ok: true, files: ['backup.tar'] } };
      return { json: { ok: true } };
    });
    expect((await invoke(['computer-upload', file], live.url)).json).toEqual({
      ok: true,
      file: 'backup.tar',
      bytes: 15,
    });
    expect((await invoke(['computer-exports'], live.url)).json).toEqual({
      ok: true,
      files: ['backup.tar'],
    });
    expect((await invoke(['computer-import', 'backup.tar'], live.url)).code).toBe(2);
    await invoke(['computer-import', 'backup.tar', '--confirm'], live.url);
    await invoke(['computer-open-dir'], live.url);
    expect(live.calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/computer/upload', { authorize: true, file: 'backup.tar' }],
      ['POST', '/api/computer/upload-content?token=up-1', 'archive-content'],
      ['GET', '/api/computer/exports', undefined],
      ['POST', '/api/computer/import', { authorize: true, file: 'backup.tar' }],
      ['POST', '/api/computer/open-dir', { authorize: true }],
    ]);
  });

  it('refuses unsafe archive names and relative paths before calling the Host', async () => {
    const live = await host(() => ({ json: { ok: true } }));
    expect((await invoke(['computer-import', '../x.tar', '--confirm'], live.url)).code).toBe(2);
    expect((await invoke(['computer-upload', 'relative.tar'], live.url)).code).toBe(2);
    expect((await invoke(['computer-export', '--out', 'out.tar'], live.url)).code).toBe(2);
    expect(live.calls).toEqual([]);
  });
});

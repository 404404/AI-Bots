import { readFileSync, writeFileSync, existsSync, lstatSync, chmodSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { BotError, publicError, requireValue } from './errors.ts';

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
function readAvatarFile(path: string): Buffer {
  const limit = 2 * 1024 * 1024;
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    throw new BotError('unsafe-avatar-file', '头像文件无法安全打开。');
  }
  try {
    const stat = fstatSync(fd);
    requireValue(stat.isFile(), 'unsafe-avatar-file', '头像输入须为普通文件。');
    requireValue(stat.size <= limit, 'avatar-input-too-large', '头像 PNG 输入不能超过 2 MiB。');
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    while (total <= limit) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, limit + 1 - total), null);
      if (count === 0) break;
      total += count;
      requireValue(total <= limit, 'avatar-input-too-large', '头像 PNG 输入不能超过 2 MiB。');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks, total);
  } finally {
    closeSync(fd);
  }
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || !command) {
    process.stdout.write(
      JSON.stringify({
        usage:
          'BOT_URL=http://... BOT_SESSION_FILE=<private-file> node dist/cli.ts login --code-file <private-code-file> | <command> [--input-file <private-json-file>]',
        commands: [
          'bots.list',
          'main.get',
          'main.catalog',
          'bots.create',
          'bots.get',
          'bots.update',
          'conversations.list',
          'conversations.create',
          'messages.list',
          'runs.submit',
          'runs.get',
          'runs.cancel',
          'connections.list',
          'connections.bind-main',
          'connections.grant-main',
          'connections.unbind-main',
          'connections.revoke',
          'delegation.grant',
          'delegation.revoke',
          'worker-policy.get',
          'worker-policy.update',
          'workers.create',
          'workers.update',
          'tasks.create',
          'tasks.list',
          'tasks.get',
          'tasks.cancel',
          'avatars.get',
          'avatar.set',
          'avatars.delete',
          'browser.status',
          'browser.origins.list',
          'browser.origins.grant',
          'browser.origins.revoke',
          'browser.open',
          'browser.step',
          'browser.close',
          'browser.cancel',
          'browser.tasks.list',
          'browser.trace',
          'browser.screenshot',
          'memory.list',
          'memory.read',
          'memory.write',
          'diagnostics.list',
          'auth.status',
          'auth.start',
          'auth.answer',
          'auth.cancel',
          'auth.logout',
        ],
        notes:
          'Missing input-file: JSON from stdin. Use avatar.set --bot-id ID --image-file PNG [--expected-revision HASH] for a PNG upload; use browser.screenshot --resource-id ID --bot-id ID --task-id ID --output-file PATH to save an authenticated PNG. Browser actions use the same JSON command contract. workers.create/workers.update require explicit operationId; secrets never belong in argv. Run IDs and paging cursors are returned unchanged.',
      }) + '\n',
    );
  } else {
    const base = new URL(process.env.BOT_URL ?? 'http://127.0.0.1:22443');
    requireValue(
      ['http:', 'https:'].includes(base.protocol) && !base.username && !base.password,
      'invalid-url',
      'Invalid BOT_URL.',
    );
    const sessionFile = process.env.BOT_SESSION_FILE;
    requireValue(
      sessionFile,
      'session-file-required',
      'Set BOT_SESSION_FILE to a private session file.',
    );
    requireValue(
      !existsSync(sessionFile) || !lstatSync(sessionFile).isSymbolicLink(),
      'unsafe-session-file',
      'Session file must not be a symbolic link.',
    );
    const avatarSet = command === 'avatar.set';
    const browserScreenshot = command === 'browser.screenshot';
    let data: Record<string, unknown>;
    let route: string;
    if (browserScreenshot) {
      requireValue(args.length === 8 && args[0] === '--resource-id' && args[2] === '--bot-id' &&
        args[4] === '--task-id' && args[6] === '--output-file', 'invalid-arguments',
      'Use browser.screenshot --resource-id ID --bot-id ID --task-id ID --output-file PATH.');
      const url = new URL(`/api/v1/browser-screenshots/${encodeURIComponent(args[1]!)}`, base);
      url.searchParams.set('botId', args[3]!);
      url.searchParams.set('taskId', args[5]!);
      const response = await fetch(url, { method: 'GET', redirect: 'error', headers: { cookie: readFileSync(sessionFile, 'utf8').trim() } });
      if (!response.ok) {
        let payload;
        try { payload = await response.json(); } catch { payload = { error: { code: 'invalid-response', message: 'Server response is invalid.' } }; }
        process.stdout.write(JSON.stringify(payload) + '\n');
        process.exitCode = 1;
      } else {
        const reader = response.body?.getReader();
        try {
          requireValue(String(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/png'),
            'invalid-image-response', 'Server did not return PNG data.');
          const declared = Number(response.headers.get('content-length') ?? 0);
          requireValue(!declared || declared <= 2 * 1024 * 1024, 'browser-screenshot-too-large', 'Browser screenshot exceeds 2 MiB.');
          requireValue(reader, 'invalid-image-response', 'Server response body is missing.');
          const chunks: Buffer[] = [];
          let total = 0;
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            total += item.value.length;
            requireValue(total <= 2 * 1024 * 1024, 'browser-screenshot-too-large', 'Browser screenshot exceeds 2 MiB.');
            chunks.push(Buffer.from(item.value));
          }
          const png = Buffer.concat(chunks, total);
          requireValue(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
            'invalid-image-response', 'Server did not return a PNG file.');
          const fd = openSync(args[7]!, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try { writeFileSync(fd, png); } finally { closeSync(fd); }
          process.stdout.write(JSON.stringify({ saved: true, bytes: png.length }) + '\n');
        } catch (error) {
          try {
            if (reader) await reader.cancel();
            else await response.body?.cancel();
          } catch {}
          throw error;
        }
      }
      process.exitCode ??= 0;
    } else if (avatarSet) {
      requireValue(args.length === 4 || args.length === 6, 'invalid-arguments',
        'Use avatar.set --bot-id ID --image-file PNG [--expected-revision HASH].');
      requireValue(args[0] === '--bot-id' && args[2] === '--image-file', 'invalid-arguments',
        'Use avatar.set --bot-id ID --image-file PNG [--expected-revision HASH].');
      const imagePath = args[3]!;
      if (args.length === 6) requireValue(args[4] === '--expected-revision', 'invalid-arguments',
        'Use --expected-revision HASH to replace an existing avatar.');
      data = { botId: args[1], pngBase64: readAvatarFile(imagePath).toString('base64'),
        ...(args.length === 6 ? { expectedRevision: args[5] } : {}) };
      route = '/api/v1/avatar';
    } else {
      const option = command === 'login' ? '--code-file' : '--input-file';
      requireValue(
        args.length === 0 || (args.length === 2 && args[0] === option),
        'invalid-arguments',
        'Use the documented input-file option; secrets must not appear in argv.',
      );
      const input = args[0] === option ? readFileSync(args[1]!, 'utf8') : await stdin();
      data = command === 'login' ? { code: input.trim() } : { command, params: JSON.parse(input.trim() || '{}') };
      route = command === 'login' ? '/api/v1/session' : '/api/v1/command';
    }
    if (!browserScreenshot) {
    const cookie = command === 'login' ? '' : readFileSync(sessionFile, 'utf8').trim();
    const response = await fetch(
      new URL(route, base),
      {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(data),
      },
    );
    const payload = await response.json();
    if (command === 'login' && response.ok) {
      const session = response.headers.get('set-cookie')?.split(';')[0];
      requireValue(session, 'session-cookie-missing', 'Server did not establish a session.');
      writeFileSync(sessionFile, session, { mode: 0o600, flag: 'w' });
      chmodSync(sessionFile, 0o600);
    }
    process.stdout.write(JSON.stringify(payload) + '\n');
    if (!response.ok) process.exitCode = 1;
    }
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify(
      publicError(
        error instanceof SyntaxError ? new BotError('invalid-json', 'Invalid JSON input.') : error,
      ),
    ) + '\n',
  );
  process.exitCode = 1;
}

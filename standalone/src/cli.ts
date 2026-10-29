import { readFileSync, writeFileSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import { BotError, publicError, requireValue } from './errors.ts';

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
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
          'Missing input-file: JSON from stdin. Secrets never belong in argv. Run IDs and paging cursors are returned unchanged.',
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
    const option = command === 'login' ? '--code-file' : '--input-file';
    requireValue(
      args.length === 0 || (args.length === 2 && args[0] === option),
      'invalid-arguments',
      'Use the documented input-file option; secrets must not appear in argv.',
    );
    const input = args[0] === option ? readFileSync(args[1], 'utf8') : await stdin();
    const data =
      command === 'login'
        ? { code: input.trim() }
        : { command, params: JSON.parse(input.trim() || '{}') };
    const cookie = command === 'login' ? '' : readFileSync(sessionFile, 'utf8').trim();
    const response = await fetch(
      new URL(command === 'login' ? '/api/v1/session' : '/api/v1/command', base),
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

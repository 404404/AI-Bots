import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3080';
const login = await fetch(`${base}/api/v1/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: readFileSync('/data/bot/secrets/access-code', 'utf8').trim() }),
});
if (!login.ok) throw new Error('Authenticated standalone smoke failed');
const cookie = login.headers.get('set-cookie').split(';')[0];
async function call(command, params = {}) {
  const response = await fetch(`${base}/api/v1/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ command, params }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.code ?? 'smoke-command-failed');
  return body.result;
}
if (process.argv[2] === 'seed') {
  const bot = await call('bots.create', { slug: 'ci-smoke', name: 'CI standalone smoke' });
  const memory = await call('memory.write', {
    botId: bot.id,
    path: 'notes.md',
    body: 'CI persistence marker',
    expectedRevision: null,
  });
  writeFileSync(
    '/data/bot/smoke-fixture.json',
    JSON.stringify({ id: bot.id, revision: memory.revision }),
    { mode: 0o600 },
  );
} else {
  const fixture = JSON.parse(readFileSync('/data/bot/smoke-fixture.json', 'utf8'));
  const bot = await call('bots.get', { botId: fixture.id }),
    memory = await call('memory.read', { botId: fixture.id, path: 'notes.md' });
  if (bot.id !== fixture.id || memory.revision !== fixture.revision)
    throw new Error('Persistence mismatch');
}
process.stdout.write(
  JSON.stringify({
    status: 'passed',
    phase: process.argv[2],
    product: 'standalone-bot',
    frameworkHostStarted: false,
    realModelTested: false,
  }) + '\n',
);

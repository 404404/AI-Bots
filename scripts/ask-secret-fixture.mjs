import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 31381);
const key = 'SYNTHETIC-1380-key-A';
const secret = 'SYNTHETIC-1380-secret-A';
const marker = 'SYNTHETIC-1380-url-A';
let requests = 0;
let authenticated = 0;
const server = createServer((request, response) => {
  if (request.url === '/evidence') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ requests, authenticated }));
    return;
  }
  requests++;
  const accepted =
    request.method === 'GET' &&
    request.url === '/status?marker=' + marker &&
    request.headers['x-api-key'] === key &&
    request.headers['x-api-secret'] === secret;
  if (accepted) authenticated++;
  response.writeHead(accepted ? 200 : 401, { 'content-type': 'text/plain', 'x-private-echo': key });
  response.end([key, secret, marker, Buffer.from(secret).toString('base64')].join('\n'));
});
server.listen(port, '127.0.0.1', () =>
  process.stdout.write(JSON.stringify({ phase: 'ready', port, synthetic: true }) + '\n'),
);
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => server.close());

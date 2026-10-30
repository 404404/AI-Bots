import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createFixtureServer({ expectedHost = process.env.FIXTURE_HOST || 'fixture.test:8081' } = {}) {
  let count = 0;
  return createServer((req, res) => {
    const acceptedHost = typeof expectedHost === 'function' ? expectedHost(req) : expectedHost;
    if (req.headers.host !== acceptedHost) {
      res.writeHead(421, { 'content-type': 'text/plain', connection: 'close' });
      return res.end('wrong host');
    }
    const url = new URL(req.url ?? '/', 'http://fixture.test:8081');
    if (req.method === 'GET' && url.pathname === '/') {
      const page = `<!doctype html><html><head><title>Isolated Browser Fixture</title><style>main{height:1800px;font:18px sans-serif}input,button{margin:1rem;padding:.6rem}</style></head><body><main><h1>Isolated fixture</h1><form method="post" action="/increment"><label>Input <input name="note" id="note"></label><button id="increment" type="submit">Increment</button></form><p id="count">Count: ${count}</p><p id="end">Scroll target</p></main></body></html>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(page), 'set-cookie': 'fixture-session=isolated; HttpOnly; SameSite=Strict; Path=/' });
      return res.end(page);
    }
    if (req.method === 'POST' && url.pathname === '/increment') {
      let size = 0;
      req.on('data', (part) => { size += part.length; if (size > 4096) req.destroy(); });
      req.on('end', () => {
        count += 1;
        res.writeHead(303, { location: '/count', 'cache-control': 'no-store' });
        res.end();
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/count') {
      const body = `<!doctype html><title>Fixture count</title><p id="count">Count: ${count}</p>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
      return res.end(body);
    }
    if (req.method === 'GET' && url.pathname === '/isolation') {
      const body = `<!doctype html><title>Isolation</title><p id="cookie">${req.headers.cookie ?? ''}</p><input id="marker">`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
      return res.end(body);
    }
    res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('not found');
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = createFixtureServer();
  server.listen(Number(process.env.FIXTURE_PORT ?? 8081), process.env.FIXTURE_BIND ?? '0.0.0.0');
  process.once('SIGTERM', () => server.close(() => process.exit(0)));
}

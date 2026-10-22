import { createServer, request } from 'node:http';

const hopByHopHeaders = ['connection', 'keep-alive', 'proxy-connection', 'upgrade'];

export async function startLoopbackHostProxy(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin);
  if (
    upstream.protocol !== 'http:' ||
    !upstream.port ||
    upstream.pathname !== '/' ||
    upstream.search ||
    upstream.hash ||
    upstream.username ||
    upstream.password
  )
    throw new Error('The internal DSH Host must be an HTTP origin.');

  const server = createServer((incoming, outgoing) => {
    let destination;
    try {
      destination = new URL(incoming.url ?? '/', upstream);
    } catch {
      outgoing.writeHead(400).end();
      return;
    }
    if (destination.origin !== upstream.origin) {
      outgoing.writeHead(400).end();
      return;
    }

    const headers = { ...incoming.headers, host: upstream.host };
    for (const header of hopByHopHeaders) delete headers[header];
    const forwarded = request(destination, { method: incoming.method, headers }, (response) => {
      const responseHeaders = { ...response.headers };
      for (const header of hopByHopHeaders) delete responseHeaders[header];
      outgoing.writeHead(response.statusCode ?? 502, responseHeaders);
      response.pipe(outgoing);
    });
    forwarded.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.on('error', () => forwarded.destroy());
    incoming.pipe(forwarded);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback proxy failed to bind.');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { ProtectedExecution, secretHttpTarget } from '../src/credentials/protected-execution.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))),
  );
});

async function echo(): Promise<{ base: string; seen: Array<Record<string, unknown>> }> {
  const seen: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, body });
      if (request.url?.startsWith('/v1/redirect')) {
        response.writeHead(302, { location: 'http://127.0.0.1:9/elsewhere' });
        response.end();
        return;
      }
      response.writeHead(request.url?.startsWith('/v1/denied') ? 401 : 200, {
        'content-type': 'application/json',
      });
      response.end(
        JSON.stringify({
          echoed: request.headers['authorization'],
          encoded: Buffer.from('SYNTHETIC-token-value').toString('base64'),
          ok: true,
        }),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, seen };
}

describe('Host-run secret HTTP consumer', () => {
  it('keeps the destination under the Owner-supplied endpoint', () => {
    expect(secretHttpTarget('https://api.example.com/v1/', '/items?x=1').href).toBe(
      'https://api.example.com/v1/items?x=1',
    );
    expect(secretHttpTarget('https://api.example.com', '').href).toBe('https://api.example.com/');
    for (const [endpoint, path] of [
      ['https://api.example.com/v1', '//evil.example/x'],
      ['https://api.example.com/v1', 'https://evil.example/x'],
      ['https://api.example.com/v1', '/../admin'],
      ['https://api.example.com/v1', '/..%2f..%2fadmin/../../x'],
      ['http://api.example.com/v1', '/items'],
      ['https://user:pass@api.example.com', '/items'],
      ['https://api.example.com/v1?key=1', '/items'],
      ['ftp://api.example.com', '/items'],
      ['not a url', '/items'],
    ] as const)
      expect(() => secretHttpTarget(endpoint, path), `${endpoint} ${path}`).toThrow();
  });

  it('sends the substituted secret, returns the response and masks the secret in it', async () => {
    const { base, seen } = await echo();
    const execution = new ProtectedExecution(() => undefined);
    try {
      const result = await execution.authenticatedRequest(
        {
          endpoint: base,
          path: '/items',
          method: 'post',
          headers: [
            { name: 'Authorization', value: 'Bearer SYNTHETIC-token-value' },
            { name: 'Content-Type', value: 'application/json' },
          ],
          query: [{ name: 'page', value: '2' }],
          body: '{"name":"a"}',
        },
        ['SYNTHETIC-token-value'],
        new AbortController().signal,
      );
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        method: 'POST',
        url: '/v1/items?page=2',
        body: '{"name":"a"}',
      });
      expect((seen[0]!['headers'] as Record<string, string>)['authorization']).toBe(
        'Bearer SYNTHETIC-token-value',
      );
      expect(result).toMatchObject({
        consumer: 'http-request-v1',
        httpStatus: 200,
        successful: true,
        truncated: false,
      });
      expect(result.body).not.toContain('SYNTHETIC-token-value');
      expect(result.body).not.toContain(Buffer.from('SYNTHETIC-token-value').toString('base64'));
      expect(JSON.parse(result.body)).toEqual({
        echoed: 'Bearer [secret]',
        encoded: '[secret]',
        ok: true,
      });
    } finally {
      await execution.close();
    }
  });

  it('reports a refusal status, refuses redirects and rejects unsafe requests before sending', async () => {
    const { base, seen } = await echo();
    const execution = new ProtectedExecution(() => undefined);
    const signal = new AbortController().signal;
    const request = { endpoint: base, method: 'GET', headers: [], query: [] };
    try {
      expect(
        await execution.authenticatedRequest({ ...request, path: '/denied' }, [], signal),
      ).toMatchObject({ httpStatus: 401, successful: false });
      await expect(
        execution.authenticatedRequest({ ...request, path: '/redirect' }, [], signal),
      ).rejects.toThrow('Protected execution failed');
      const sent = seen.length;
      for (const unsafe of [
        { ...request, path: '/items', method: 'TRACE' },
        { ...request, path: '/items', headers: [{ name: 'Host', value: 'evil.example' }] },
        { ...request, path: '/items', headers: [{ name: 'X-A', value: 'a\r\nX-B: b' }] },
        { ...request, path: '/items', body: 'not allowed on GET' },
        { ...request, path: '/../admin' },
      ])
        await expect(execution.authenticatedRequest(unsafe, [], signal)).rejects.toThrow();
      expect(seen).toHaveLength(sent);
    } finally {
      await execution.close();
    }
  });
});

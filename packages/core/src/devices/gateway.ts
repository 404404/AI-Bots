import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import type { DevicePairing, DeviceRefusal, OfferRefusal } from './pairing.js';

export const DEVICE_GATEWAY_PREFIX = '/botharness-device';
export const DEVICE_PAIR_PATH = `${DEVICE_GATEWAY_PREFIX}/pair`;
export const DEVICE_MUX_PATH = `${DEVICE_GATEWAY_PREFIX}/api/remote.mux`;

const PAIR_BODY_LIMIT = 4096;
const COOKIE_LIFETIME_MS = 6 * 60 * 60 * 1000;
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const NEVER_FORWARDED = new Set(['host', 'cookie', 'authorization', 'origin', 'referer']);
const WEBSOCKET_HEADERS = [
  'upgrade',
  'connection',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
];

export type GatewayRefusal =
  | DeviceRefusal
  | OfferRefusal
  | 'origin-refused'
  | 'host-session-unavailable'
  | 'not-found';

export interface DeviceGatewayOptions {
  pairing: DevicePairing;
  port: () => number;
  authenticatedUrl: (baseUrl: string) => string;
  now?: () => number;
  log?: (message: string) => void;
}

export interface DeviceGateway {
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function crossOrigin(request: IncomingMessage): boolean {
  const origin = header(request, 'origin');
  if (origin === undefined) return false;
  try {
    return new URL(origin).host !== header(request, 'host');
  } catch {
    return true;
  }
}

function refuse(response: ServerResponse, status: number, code: GatewayRefusal): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ code }));
}

function refuseUpgrade(socket: Duplex, status: number, code: GatewayRefusal): void {
  const body = JSON.stringify({ code });
  const reason = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Error';
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

async function readSmall(request: IncomingMessage, limit: number): Promise<string | undefined> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createDeviceGateway(options: DeviceGatewayOptions): DeviceGateway {
  const { pairing } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});
  const loopback = (): string => `127.0.0.1:${String(options.port())}`;
  let cookie: { value: string; mintedAt: number } | undefined;
  let minting: Promise<string> | undefined;

  const mint = (): Promise<string> => {
    minting ??= (async () => {
      try {
        const url = options.authenticatedUrl(`http://${loopback()}/`);
        const response = await fetch(url, { redirect: 'manual' });
        const issued = response.headers.getSetCookie();
        await response.body?.cancel();
        if (issued.length === 0) throw new Error(`loopback login answered ${response.status}`);
        const value = issued.map((entry) => entry.split(';')[0]).join('; ');
        cookie = { value, mintedAt: now() };
        log('device-gateway phase=host-session-minted');
        return value;
      } finally {
        minting = undefined;
      }
    })();
    return minting;
  };

  const hostSession = async (): Promise<string> =>
    cookie !== undefined && now() - cookie.mintedAt < COOKIE_LIFETIME_MS
      ? cookie.value
      : await mint();

  const forwardHeaders = (request: IncomingMessage, session: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name) || NEVER_FORWARDED.has(name)) continue;
      headers[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    headers.host = loopback();
    headers.cookie = session;
    return headers;
  };

  const pair = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST') return refuse(response, 404, 'not-found');
    const text = await readSmall(request, PAIR_BODY_LIMIT);
    let input: { offer?: unknown; name?: unknown } = {};
    try {
      input = JSON.parse(text ?? '') as typeof input;
    } catch {}
    if (typeof input.offer !== 'string') return refuse(response, 401, 'offer-invalid');
    const result = pairing.redeem({
      offer: input.offer,
      ...(typeof input.name === 'string' ? { name: input.name } : {}),
    });
    if (!result.ok) return refuse(response, 401, result.code);
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(
      JSON.stringify({
        deviceId: result.device.id,
        credential: result.credential,
        host: result.host,
      }),
    );
  };

  const unary = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const admission = pairing.admit(header(request, 'authorization'));
    if (!admission.ok) return refuse(response, 401, admission.code);
    let session: string;
    try {
      session = await hostSession();
    } catch {
      return refuse(response, 503, 'host-session-unavailable');
    }
    const path = (request.url ?? '/').slice(DEVICE_GATEWAY_PREFIX.length);
    await new Promise<void>((resolve) => {
      const upstream = httpRequest(
        {
          host: '127.0.0.1',
          port: options.port(),
          path,
          method: request.method,
          headers: forwardHeaders(request, session),
        },
        (answer) => {
          if (answer.statusCode === 401) {
            cookie = undefined;
            answer.resume();
            refuse(response, 503, 'host-session-unavailable');
            return resolve();
          }
          const headers: Record<string, string | string[]> = {};
          for (const [name, value] of Object.entries(answer.headers))
            if (value !== undefined && !HOP_BY_HOP.has(name) && name !== 'set-cookie')
              headers[name] = value;
          response.writeHead(answer.statusCode ?? 502, headers);
          answer.pipe(response);
          answer.on('end', resolve);
          answer.on('error', resolve);
        },
      );
      const detach = pairing.attachStream(admission.device.id, () => {
        upstream.destroy();
        response.destroy();
      });
      response.on('close', () => {
        detach();
        upstream.destroy();
        resolve();
      });
      upstream.on('error', () => {
        if (!response.headersSent) refuse(response, 502, 'host-session-unavailable');
        else response.destroy();
        resolve();
      });
      request.pipe(upstream);
    });
  };

  const openStream = (
    request: IncomingMessage,
    session: string,
  ): Promise<
    | { kind: 'upgraded'; answer: IncomingMessage; socket: Duplex; head: Buffer }
    | { kind: 'refused'; status: number }
  > =>
    new Promise((resolve, reject) => {
      const headers: Record<string, string> = { host: loopback(), cookie: session };
      for (const name of WEBSOCKET_HEADERS) {
        const value = header(request, name);
        if (value !== undefined) headers[name] = value;
      }
      const upstream = httpRequest({
        host: '127.0.0.1',
        port: options.port(),
        path: '/api/remote.mux',
        method: 'GET',
        headers,
      });
      upstream.on('upgrade', (answer, socket, head) =>
        resolve({ kind: 'upgraded', answer, socket, head }),
      );
      upstream.on('response', (answer) => {
        answer.resume();
        resolve({ kind: 'refused', status: answer.statusCode ?? 502 });
      });
      upstream.on('error', reject);
      upstream.end();
    });

  return {
    async handle(request, response) {
      const path = new URL(request.url ?? '/', 'http://device').pathname;
      if (crossOrigin(request)) return refuse(response, 403, 'origin-refused');
      if (path === DEVICE_PAIR_PATH) return pair(request, response);
      if (path.startsWith(`${DEVICE_GATEWAY_PREFIX}/api/`)) return unary(request, response);
      return refuse(response, 404, 'not-found');
    },

    async upgrade(request, socket, head) {
      if (crossOrigin(request)) return refuseUpgrade(socket, 403, 'origin-refused');
      const admission = pairing.admit(header(request, 'authorization'));
      if (!admission.ok) return refuseUpgrade(socket, 401, admission.code);
      let opened: Awaited<ReturnType<typeof openStream>> | undefined;
      try {
        opened = await openStream(request, await hostSession());
        if (opened.kind === 'refused' && opened.status === 401) {
          cookie = undefined;
          opened = await openStream(request, await mint());
        }
      } catch {
        opened = undefined;
      }
      if (opened === undefined || opened.kind === 'refused')
        return refuseUpgrade(socket, 503, 'host-session-unavailable');
      const { answer, socket: upstream, head: upstreamHead } = opened;
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (let index = 0; index < answer.rawHeaders.length; index += 2) {
        const name = answer.rawHeaders[index]!;
        if (name.toLowerCase() !== 'set-cookie')
          lines.push(`${name}: ${answer.rawHeaders[index + 1]!}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      if (head.length > 0) upstream.write(head);
      const close = (): void => {
        detach();
        upstream.destroy();
        socket.destroy();
      };
      const detach = pairing.attachStream(admission.device.id, close);
      upstream.pipe(socket);
      socket.pipe(upstream);
      socket.on('close', close);
      upstream.on('close', close);
      socket.on('error', close);
      upstream.on('error', close);
    },
  };
}

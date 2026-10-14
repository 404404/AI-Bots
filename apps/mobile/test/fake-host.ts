import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import type { MuxClientFrame } from '../src/host/wire';
import wire from './fixtures/host-wire.json';

type Rpc = keyof typeof wire.rpc;

function recorded(method: Rpc): unknown {
  const bodies = wire.rpc[method].filter((entry) => entry.status === 200);
  return structuredClone(bodies.at(-1)!.body);
}

export class FakeHost {
  readonly hostId = 'host-1';
  readonly credential = 'device-1.secret-1';
  offer = 'offer-1';
  revoked = false;
  up = true;
  private sockets = new Set<{
    events: HostSocketEvents;
    streams: Map<string, string>;
    device: boolean;
  }>();
  readonly requests: string[] = [];
  readonly unreachable = new Set<string>();
  readonly answers = new Map<string, (args: Record<string, unknown>) => unknown>();

  readonly carrier: HostCarrier = {
    request: async (url, init) => {
      await Promise.resolve();
      this.requests.push(`${init.method} ${url}`);
      const parsed = new URL(url);
      if (!this.up || this.unreachable.has(parsed.origin))
        throw new TypeError('Network request failed');
      if (parsed.pathname === '/botharness-device/pair') {
        const body = JSON.parse(init.body ?? '{}') as { offer?: string };
        if (body.offer !== this.offer) return response(401, '{"code":"offer-invalid"}');
        this.offer = 'used';
        return response(
          200,
          JSON.stringify({
            deviceId: 'device-1',
            credential: this.credential,
            host: { id: this.hostId, name: 'studio' },
          }),
        );
      }
      const refusal = this.refusal(init.headers?.['authorization']);
      if (refusal !== undefined) return response(401, JSON.stringify({ code: refusal }));
      const method = parsed.pathname.replace('/botharness-device/api/botharness/', '') as Rpc;
      const body = JSON.parse(init.body ?? '{}') as {
        rpcId: string;
        payload: { args: Record<string, unknown> };
      };
      const answer = this.answers.get(method);
      if (answer !== undefined)
        return response(
          200,
          JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId,
            result: answer(body.payload.args),
          }),
        );
      const recordedBody = recorded(method) as { rpcId: string };
      return response(200, JSON.stringify({ ...recordedBody, rpcId: body.rpcId }));
    },
    openSocket: (url, events, headers) => {
      const entry = { events, streams: new Map<string, string>(), device: true };
      queueMicrotask(() => {
        if (!this.up || this.unreachable.has(new URL(url.replace(/^ws/u, 'http')).origin))
          return events.closed('connection refused');
        if (
          !url.endsWith('/botharness-device/api/remote.mux') ||
          this.refusal(headers?.['authorization']) !== undefined
        )
          return events.closed('Expected HTTP 101 response but was 401');
        this.sockets.add(entry);
        events.open();
      });
      return {
        send: (text) => {
          const frame = JSON.parse(text) as MuxClientFrame;
          if (frame.type !== 'open') return;
          entry.streams.set(frame.endpoint, frame.streamId);
          queueMicrotask(() => {
            if (frame.endpoint === 'botharness/followRoster')
              this.emit(entry, frame.streamId, wire.mux.roster[0]);
            else if (frame.endpoint === 'botharness/followActivity')
              this.emit(entry, frame.streamId, wire.mux.activity[0]);
            else
              entry.events.message(
                JSON.stringify({ ...wire.mux.unknownEndpoint!.frame, streamId: frame.streamId }),
              );
          });
        },
        close: () => {
          if (this.sockets.delete(entry)) entry.events.closed('closed by client');
        },
      };
    },
  };

  private refusal(authorization: string | undefined): string | undefined {
    if (authorization === undefined) return 'device-credential-missing';
    if (authorization !== `Device ${this.credential}`) return 'device-unknown';
    return this.revoked ? 'device-revoked' : undefined;
  }

  revoke(): void {
    this.revoked = true;
    for (const entry of this.sockets) {
      this.sockets.delete(entry);
      entry.events.closed('');
    }
  }

  private emit(entry: { events: HostSocketEvents }, streamId: string, value: unknown): void {
    entry.events.message(JSON.stringify({ type: 'item', streamId, value }));
  }

  push(endpoint: 'botharness/followRoster' | 'botharness/followActivity', value: unknown): void {
    for (const entry of this.sockets) {
      const streamId = entry.streams.get(endpoint);
      if (streamId !== undefined) this.emit(entry, streamId, value);
    }
  }

  kill(): void {
    this.up = false;
    for (const entry of this.sockets) {
      this.sockets.delete(entry);
      entry.events.closed('connection lost');
    }
  }

  restart(): void {
    this.up = true;
  }
}

function response(status: number, body: string) {
  return { status, text: async () => body };
}

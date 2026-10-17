import { randomUUID } from 'node:crypto';
import { TobError } from '../tob/service.js';
import { isClientTarget, type ClientControlCommand, type ClientTarget } from './contracts.js';

type Pending = {
  command: ClientControlCommand;
  guard: () => void;
  beforeEffect: (() => void) | undefined;
  delivered: boolean;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
};
type Client = {
  target: ClientTarget;
  proof: string;
  peerId: string | undefined;
  ownerProof: string;
  retired: Set<string>;
  kind: string;
  seen: number;
  pending: Map<string, Pending>;
};
export class ClientControlService {
  readonly #clients = new Map<string, Client>();
  constructor(
    readonly leaseMs = 15_000,
    readonly timeoutMs = 10_000,
    readonly log?: (phase: string, details: Record<string, string | number>) => void,
  ) {}
  targets() {
    return [...this.#clients.values()]
      .filter((client) => Date.now() - client.seen < this.leaseMs)
      .map(({ target, kind }) => ({ ...target, kind, scope: 'client' as const }));
  }
  #target(target: unknown): Client {
    if (!isClientTarget(target)) throw new TobError('client-target-required');
    const client = this.#clients.get(target.clientId);
    if (!client)
      throw new TobError(this.targets().length ? 'unknown-client-target' : 'no-connected-client');
    if (client.target.generation !== target.generation)
      throw new TobError('client-target-replaced');
    if (Date.now() - client.seen >= this.leaseMs) throw new TobError('client-target-stale');
    return client;
  }
  require(target: unknown): ClientTarget {
    return { ...this.#target(target).target };
  }
  requireOrigin(target: unknown, proof: unknown, peerId?: string): ClientTarget {
    const client = this.#target(target);
    if (typeof proof !== 'string' || proof !== client.proof || client.peerId !== peerId)
      throw new TobError('client-proof-required');
    return { ...client.target };
  }
  register(
    target: unknown,
    kind: unknown,
    proof: unknown = randomUUID(),
    ownerProof: unknown = proof,
    peerId?: string,
  ) {
    if (
      !isClientTarget(target) ||
      !['web', 'desktop'].includes(String(kind)) ||
      typeof proof !== 'string' ||
      !/^[a-zA-Z0-9-]{16,80}$/u.test(proof) ||
      typeof ownerProof !== 'string' ||
      !/^[a-zA-Z0-9-]{16,80}$/u.test(ownerProof)
    )
      throw new TobError('invalid-input');
    const previous = this.#clients.get(target.clientId);
    if (previous && previous.ownerProof !== ownerProof) throw new TobError('client-proof-required');
    if (previous?.retired.has(target.generation)) throw new TobError('client-target-replaced');
    if (previous?.target.generation === target.generation) {
      if (previous.proof !== proof || previous.peerId !== peerId)
        throw new TobError('client-proof-required');
      previous.seen = Date.now();
      return { ...target };
    }
    if (previous && previous.retired.size >= 128) throw new TobError('client-capacity');
    if (!previous && this.#clients.size >= 256) throw new TobError('client-capacity');
    if (previous)
      for (const pending of previous.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new TobError(pending.delivered ? 'client-outcome-uncertain' : 'client-target-replaced'),
        );
      }
    this.#clients.set(target.clientId, {
      target: { ...target },
      proof,
      peerId,
      ownerProof,
      retired: new Set([
        ...(previous?.retired ?? []),
        ...(previous ? [previous.target.generation] : []),
      ]),
      kind: String(kind),
      seen: Date.now(),
      pending: new Map(),
    });
    this.log?.('registered', { clients: this.#clients.size });
    return { ...target };
  }
  poll(target: unknown): { commands: ClientControlCommand[] } {
    const client = this.#target(target);
    client.seen = Date.now();
    const commands: ClientControlCommand[] = [];
    for (const [id, pending] of client.pending) {
      if (pending.delivered) continue;
      try {
        pending.guard();
        if (pending.command.operation.endsWith('-set')) pending.beforeEffect?.();
        pending.delivered = true;
        this.log?.('dispatched', {
          operation: pending.command.operation,
          pending: client.pending.size,
        });
        commands.push(structuredClone(pending.command));
      } catch (error) {
        clearTimeout(pending.timer);
        client.pending.delete(id);
        pending.reject(error);
      }
    }
    return { commands };
  }
  complete(target: unknown, id: unknown, result: unknown) {
    const client = this.#target(target);
    const pending = typeof id === 'string' ? client.pending.get(id) : undefined;
    if (!pending || !pending.delivered) throw new TobError('client-command-expired');
    clearTimeout(pending.timer);
    client.pending.delete(String(id));
    this.log?.('completed', {
      operation: pending.command.operation,
      durationMs: this.timeoutMs - Math.max(0, pending.command.expiresAt - Date.now()),
    });
    const response = result as { ok?: unknown; value?: unknown; code?: unknown } | null;
    if (response?.ok === true) pending.resolve(response.value);
    else
      pending.reject(
        new TobError(
          typeof response?.code === 'string' ? response.code : 'client-operation-failed',
        ),
      );
    return { accepted: true };
  }
  request(
    target: unknown,
    operation: string,
    args: Record<string, unknown>,
    guard = () => {},
    beforeEffect?: () => void,
  ): Promise<unknown> {
    guard();
    const client = this.#target(target);
    if (client.pending.size >= 16) throw new TobError('client-busy');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        command: {
          id,
          operation,
          args: structuredClone(args),
          expiresAt: Date.now() + this.timeoutMs,
        },
        guard,
        beforeEffect,
        delivered: false,
        resolve,
        reject,
        timer: setTimeout(() => {
          client.pending.delete(id);
          this.log?.('timeout', {
            operation,
            delivered: Number(pending.delivered),
            durationMs: this.timeoutMs,
          });
          reject(
            new TobError(pending.delivered ? 'client-outcome-uncertain' : 'client-unresponsive'),
          );
        }, this.timeoutMs),
      };
      client.pending.set(id, pending);
    });
  }
  dispose(): void {
    for (const client of this.#clients.values())
      for (const pending of client.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(
          new TobError(
            pending.delivered ? 'client-outcome-uncertain' : 'client-control-unavailable',
          ),
        );
      }
    this.#clients.clear();
  }
}

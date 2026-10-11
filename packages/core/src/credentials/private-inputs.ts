import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore, ChannelAppendOnceResult } from '../channels/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { PrivateInputLog } from './diagnostics.js';
import {
  privateRequestSchema,
  privateSubmissionSchema,
  type PrivateInputDeclaration,
  type PrivateInputResult,
  type PrivateInputStatus,
} from './contracts.js';

const grantFields = {
  botSlug: z.string(),
  botCreatedAt: z.string(),
  account: z.string(),
  values: z.record(z.string(), z.string()),
};
const storedGrant = z.discriminatedUnion('version', [
  z.strictObject({ version: z.literal(1), ...grantFields }),
  z.strictObject({
    version: z.literal(2),
    ...grantFields,
    channelId: z.string(),
    requestMessageId: z.string().uuid(),
  }),
]);
const referencePattern = /^private:([0-9a-f-]{36}):([a-z][a-z0-9_]{0,47})$/;
type Terminal = 'cancelled' | 'expired';
type Pending = {
  agent: Agent;
  botSlug: string;
  botCreatedAt: string;
  request: PrivateInputDeclaration;
  signal: AbortSignal;
  deadline: number;
  committed: boolean;
  commit?: Promise<ChannelAppendOnceResult>;
  terminal?: Terminal;
  operation?: Promise<boolean> | undefined;
  abort(): void;
  resolve(result: PrivateInputResult): void;
};
export class PrivateInputs {
  readonly #pending = new Map<string, Pending>();
  readonly #timer: ReturnType<typeof setInterval>;
  #recovery: Promise<void> | undefined;
  #closed = false;

  constructor(
    readonly deps: {
      channels: ChannelStore;
      ownership: SessionOwnership;
      registry: PersonaBotRegistry;
      credentials(): CredentialProvider | undefined;
      isLive(agent: Agent): boolean;
      qualified(): Promise<boolean>;
      log: PrivateInputLog;
      requestTimeoutMs?: number;
      changed?(botSlug: string, count: number): void;
    },
  ) {
    const timeout = deps.requestTimeoutMs ?? 15 * 60_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1)
      throw new Error('Invalid private input lifetime');
    this.#timer = setInterval(
      () => {
        for (const [id, pending] of this.#pending) {
          if (!this.#valid(pending)) void this.#stop(id, pending, 'expired');
        }
      },
      Math.min(timeout, 1000),
    );
    this.#timer.unref();
  }

  #owner(agent: Agent): { botSlug: string; createdAt: string } | undefined {
    const owner = this.deps.ownership.resolve(agent.session.id);
    const bot = owner === undefined ? undefined : this.deps.registry.get(owner.botSlug);
    if (
      this.#closed ||
      owner?.rootRole !== 'orchestrator' ||
      bot === undefined ||
      !this.deps.isLive(agent)
    )
      return undefined;
    return { botSlug: owner.botSlug, createdAt: bot.createdAt };
  }

  #valid(pending: Pending): boolean {
    const owner = this.#owner(pending.agent);
    return (
      pending.terminal === undefined &&
      !pending.signal.aborted &&
      Date.now() < pending.deadline &&
      owner?.botSlug === pending.botSlug &&
      owner.createdAt === pending.botCreatedAt &&
      this.deps.channels.get(dmChannelId(pending.botSlug))?.botSlug === pending.botSlug
    );
  }

  #resolution(channelId: string, messageId: string) {
    return this.deps.channels.message(channelId, 'private-resolution-' + messageId)
      ?.privateInputResolution;
  }

  #publish(botSlug: string): void {
    const count = [...this.#pending.entries()].filter(
      ([id, pending]) =>
        pending.botSlug === botSlug &&
        pending.committed &&
        this.#valid(pending) &&
        this.#resolution(dmChannelId(botSlug), id) === undefined,
    ).length;
    try {
      this.deps.changed?.(botSlug, count);
    } catch {
      this.deps.log('attention-publication-failed', { botSlug });
    }
  }

  activeMessageIds(): string[] {
    return [...this.#pending.entries()].flatMap(([id, pending]) =>
      pending.committed && this.status(dmChannelId(pending.botSlug), id) === 'pending' ? [id] : [],
    );
  }

  #grantCommitted(grant: z.infer<typeof storedGrant>, id: string): boolean {
    if (grant.version === 1) return true;
    if (grant.channelId !== dmChannelId(grant.botSlug)) return false;
    const card = this.deps.channels.message(grant.channelId, grant.requestMessageId);
    const request = card?.privateInputRequest;
    const resolution = this.#resolution(grant.channelId, grant.requestMessageId);
    const configured = Object.entries(grant.values).filter(([, value]) => value.length > 0);
    return (
      card?.author.kind === 'bot' &&
      card.author.slug === grant.botSlug &&
      request?.account === grant.account &&
      resolution?.state === 'configured' &&
      configured.length === Object.keys(resolution.references).length &&
      configured.every(
        ([field]) =>
          request.fields.some((declared) => declared.id === field) &&
          resolution.references[field] === `private:${id}:${field}`,
      ) &&
      request.fields.every((field) => !field.required || (grant.values[field.id]?.length ?? 0) > 0)
    );
  }

  recover(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error('Private input owner is closed'));
    if (this.#recovery !== undefined) return this.#recovery;
    this.#recovery = this.#recover().catch(() => {
      this.#recovery = undefined;
      this.deps.log('recovery-failed');
      throw new Error('Private input recovery is unavailable');
    });
    return this.#recovery;
  }

  async #recover(): Promise<void> {
    const credentials = this.deps.credentials();
    if (credentials === undefined) throw new Error('Credential provider is unavailable');
    for (const channel of this.deps.channels.list()) {
      if (channel.type !== 'dm' || channel.botSlug === undefined) continue;
      let cursor: string | undefined;
      do {
        const page = this.deps.channels.queryMessages(channel.id, {
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        });
        for (const message of page.messages) {
          if (
            message.privateInputRequest === undefined ||
            this.#pending.has(message.id) ||
            this.#resolution(channel.id, message.id) !== undefined
          )
            continue;
          const result = await this.deps.channels.appendMessageOnce(channel.id, {
            id: 'private-resolution-' + message.id,
            at: new Date().toISOString(),
            author: { kind: 'human' },
            replyTo: message.id,
            body: 'Private input expired',
            privateInputResolution: {
              requestMessageId: message.id,
              state: 'expired',
              references: {},
            },
          });
          if (result.status !== 'appended' && result.status !== 'existing')
            throw new Error('Private request reconciliation failed');
          this.deps.log('recovered-expired', { requestId: message.id, botSlug: channel.botSlug });
        }
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      this.#publish(channel.botSlug);
    }
    for (const entry of await credentials.listRecords()) {
      const id = /^botharness-private\/grant-([0-9a-f-]{36})$/.exec(entry.key)?.[1];
      if (id === undefined || entry.kind !== 'grant') continue;
      const record = await credentials.readRecord(entry.key);
      const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (grant.success && grant.data.version === 2 && !this.#grantCommitted(grant.data, id)) {
        await credentials.deleteRecord(entry.key);
        this.deps.log('orphan-grant-removed', { requestId: id });
      }
    }
  }

  async ask(agent: Agent, input: unknown, signal: AbortSignal): Promise<PrivateInputResult> {
    const request = privateRequestSchema.safeParse(input);
    const owner = this.#owner(agent);
    if (!request.success || owner === undefined || signal.aborted)
      throw new Error('Private input request is invalid or unavailable');
    await this.recover();
    if (!(await this.deps.qualified()) || this.deps.credentials() === undefined)
      throw new Error('Protected credential consumption is unavailable in this Profile');
    const currentOwner = this.#owner(agent);
    if (
      signal.aborted ||
      currentOwner?.botSlug !== owner.botSlug ||
      currentOwner.createdAt !== owner.createdAt
    )
      throw new Error('Private input request expired');
    const channelId = dmChannelId(owner.botSlug);
    if (this.deps.channels.get(channelId)?.botSlug !== owner.botSlug)
      throw new Error('Owned conversation is unavailable');
    const id = randomUUID();
    let resolve!: Pending['resolve'];
    const result = new Promise<PrivateInputResult>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      agent,
      botSlug: owner.botSlug,
      botCreatedAt: owner.createdAt,
      request: request.data,
      signal,
      committed: false,
      deadline: Date.now() + (this.deps.requestTimeoutMs ?? 15 * 60_000),
      resolve,
      abort: () => {
        void this.#stop(id, pending, 'expired');
      },
    };
    this.#pending.set(id, pending);
    signal.addEventListener('abort', pending.abort, { once: true });
    try {
      pending.commit = this.deps.channels.appendMessageOnce(channelId, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: owner.botSlug },
        body: request.data.purpose,
        privateInputRequest: {
          ...request.data,
          sessionId: agent.session.id,
          expiresAt: new Date(pending.deadline).toISOString(),
        },
      });
      const committed = await pending.commit;
      if (committed.status !== 'appended')
        throw new Error('Private input request could not be saved');
      pending.committed = true;
      this.#publish(pending.botSlug);
      this.deps.log('requested', {
        requestId: id,
        botSlug: owner.botSlug,
        sessionId: agent.session.id,
      });
      if (!this.#valid(pending)) await this.#stop(id, pending, pending.terminal ?? 'expired');
      return await result;
    } finally {
      signal.removeEventListener('abort', pending.abort);
      if (this.#pending.get(id) === pending) {
        this.#pending.delete(id);
        this.#publish(pending.botSlug);
      }
    }
  }

  status(channelId: string, messageId: string): PrivateInputStatus {
    const resolution = this.#resolution(channelId, messageId);
    if (resolution !== undefined) return resolution.state;
    const pending = this.#pending.get(messageId);
    if (pending !== undefined && channelId === dmChannelId(pending.botSlug) && pending.committed) {
      if (this.#valid(pending)) return 'pending';
      void this.#stop(messageId, pending, pending.terminal ?? 'expired');
    }
    return 'expired';
  }

  #finish(id: string, pending: Pending, result: PrivateInputResult): void {
    this.#pending.delete(id);
    pending.resolve(result);
    this.#publish(pending.botSlug);
    this.deps.log(result.status, {
      requestId: id,
      botSlug: pending.botSlug,
      sessionId: pending.agent.session.id,
    });
  }

  async #terminal(id: string, pending: Pending): Promise<boolean> {
    const state = pending.terminal ?? 'expired';
    const channelId = dmChannelId(pending.botSlug);
    let committed = false;
    try {
      const result = await this.deps.channels.appendMessageOnce(channelId, {
        id: 'private-resolution-' + id,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: id,
        body: state === 'cancelled' ? 'Private input cancelled' : 'Private input expired',
        privateInputResolution: { requestMessageId: id, state, references: {} },
      });
      committed =
        (result.status === 'appended' || result.status === 'existing') &&
        result.message.privateInputResolution?.state === state;
    } catch {
      committed = this.#resolution(channelId, id)?.state === state;
      if (!committed)
        this.deps.log('terminal-save-failed', { requestId: id, botSlug: pending.botSlug });
    }
    this.#finish(id, pending, {
      status: committed ? state : 'expired',
      account: pending.request.account,
      references: {},
    });
    return committed;
  }

  async #stop(id: string, pending: Pending, state: Terminal): Promise<boolean> {
    if (this.#pending.get(id) !== pending) return false;
    const resolution = this.#resolution(dmChannelId(pending.botSlug), id);
    if (resolution !== undefined) {
      if (pending.operation !== undefined) await pending.operation;
      else
        this.#finish(id, pending, {
          status: resolution.state === 'configured' ? 'expired' : resolution.state,
          account: pending.request.account,
          references: {},
        });
      return false;
    }
    pending.terminal ??= state;
    if (!pending.committed) {
      try {
        if (pending.commit === undefined) return false;
        const result = await pending.commit;
        if (result.status !== 'appended') return false;
        pending.committed = true;
      } catch {
        return false;
      }
    }
    if (pending.operation !== undefined) {
      await pending.operation;
      return this.#resolution(dmChannelId(pending.botSlug), id)?.state === state;
    }
    pending.operation = this.#terminal(id, pending);
    try {
      return await pending.operation;
    } finally {
      pending.operation = undefined;
    }
  }

  async submit(owner: boolean, input: unknown): Promise<boolean> {
    if (!owner) return false;
    const parsed = privateSubmissionSchema.safeParse(input);
    if (!parsed.success) return false;
    const { channelId, messageId, values } = parsed.data;
    const pending = this.#pending.get(messageId);
    if (
      pending === undefined ||
      pending.operation !== undefined ||
      channelId !== dmChannelId(pending.botSlug) ||
      this.status(channelId, messageId) !== 'pending'
    )
      return false;
    const fields = pending.request.fields;
    if (
      Object.keys(values).some((key) => !fields.some((field) => field.id === key)) ||
      fields.some((field) => field.required && (values[field.id]?.length ?? 0) === 0)
    )
      return false;
    const credentials = this.deps.credentials();
    if (credentials === undefined) return false;
    pending.operation = this.#submit(channelId, messageId, pending, credentials, values);
    try {
      return await pending.operation;
    } finally {
      pending.operation = undefined;
    }
  }

  async #submit(
    channelId: string,
    id: string,
    pending: Pending,
    credentials: CredentialProvider,
    values: Record<string, string>,
  ): Promise<boolean> {
    const grantId = randomUUID();
    const key = credentialKey('botharness-private', 'grant-' + grantId);
    const references = Object.fromEntries(
      pending.request.fields
        .filter((field) => (values[field.id]?.length ?? 0) > 0)
        .map((field) => [field.id, `private:${grantId}:${field.id}`]),
    );
    let configured = false;
    let writeAttempted = false;
    try {
      if (!(await this.deps.qualified()) || !this.#valid(pending))
        throw new Error('Private input expired');
      await credentials.modifyRecord(key, async (current) => {
        if (current !== undefined || !this.#valid(pending))
          throw new Error('Private grant unavailable');
        writeAttempted = true;
        return {
          kind: 'grant',
          payload: {
            version: 2,
            botSlug: pending.botSlug,
            botCreatedAt: pending.botCreatedAt,
            account: pending.request.account,
            channelId,
            requestMessageId: id,
            values: { ...values },
          },
        };
      });
      if (!this.#valid(pending)) throw new Error('Private input expired');
      await this.deps.channels.appendMessageOnce(
        channelId,
        {
          id: 'private-resolution-' + id,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          replyTo: id,
          body: 'Private information configured',
          privateInputResolution: { requestMessageId: id, state: 'configured', references },
        },
        undefined,
        undefined,
        () => this.#valid(pending),
      );
    } catch {
      this.deps.log('submit-failed', {
        requestId: id,
        botSlug: pending.botSlug,
        sessionId: pending.agent.session.id,
      });
    } finally {
      const resolution = this.#resolution(channelId, id);
      configured =
        resolution?.state === 'configured' &&
        JSON.stringify(resolution.references) === JSON.stringify(references);
      if (configured) {
        this.#finish(id, pending, {
          status: this.#valid(pending) ? 'configured' : 'expired',
          account: pending.request.account,
          references: this.#valid(pending) ? references : {},
        });
      } else {
        if (writeAttempted)
          await credentials
            .deleteRecord(key)
            .catch(() => this.deps.log('cleanup-failed', { requestId: id }));
        pending.terminal ??= 'expired';
        await this.#terminal(id, pending);
      }
      for (const field of Object.keys(values)) delete values[field];
    }
    return configured;
  }

  async cancel(owner: boolean, channelId: string, messageId: string): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (
      !owner ||
      pending === undefined ||
      channelId !== dmChannelId(pending.botSlug) ||
      this.status(channelId, messageId) !== 'pending'
    )
      return false;
    return this.#stop(messageId, pending, 'cancelled');
  }

  async consume<T>(
    agent: Agent,
    account: string,
    references: Record<string, string>,
    run: (values: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    await this.recover();
    const owner = this.#owner(agent);
    if (owner === undefined || !(await this.deps.qualified()))
      throw new Error('Protected credential consumption is unavailable');
    const entries = Object.entries(references);
    if (entries.length === 0 || entries.length > 8)
      throw new Error('Credential references are invalid');
    const matches = entries.map(([field, ref]) => ({ field, match: referencePattern.exec(ref) }));
    const id = matches[0]?.match?.[1];
    if (
      id === undefined ||
      matches.some(({ field, match }) => match?.[1] !== id || match?.[2] !== field)
    )
      throw new Error('Credential references are invalid');
    const record = await this.deps
      .credentials()
      ?.readRecord(credentialKey('botharness-private', 'grant-' + id));
    const grant = storedGrant.safeParse(record?.kind === 'grant' ? record.payload : undefined);
    if (
      !grant.success ||
      grant.data.botSlug !== owner.botSlug ||
      grant.data.botCreatedAt !== owner.createdAt ||
      grant.data.account !== account ||
      !this.#grantCommitted(grant.data, id) ||
      matches.some(({ field }) => grant.data.values[field] === undefined)
    )
      throw new Error('Credential grant is unavailable for this PersonaBot and account');
    const currentOwner = this.#owner(agent);
    if (currentOwner?.botSlug !== owner.botSlug || currentOwner.createdAt !== owner.createdAt)
      throw new Error('Credential authority changed');
    const started = Date.now();
    const details = { requestId: id, botSlug: owner.botSlug, sessionId: agent.session.id };
    this.deps.log('consume-started', details);
    try {
      const result = await run(
        Object.fromEntries(matches.map(({ field }) => [field, grant.data.values[field]!])),
      );
      this.deps.log('consume-completed', { ...details, durationMs: Date.now() - started });
      return result;
    } catch {
      this.deps.log('consume-failed', { ...details, durationMs: Date.now() - started });
      throw new Error('Protected credential consumer failed or was cancelled');
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer);
    await Promise.all(
      [...this.#pending.entries()].map(([id, pending]) => this.#stop(id, pending, 'expired')),
    );
    await this.#recovery?.catch(() => undefined);
  }
}

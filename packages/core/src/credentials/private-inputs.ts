import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
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

const storedGrant = z.strictObject({
  version: z.literal(1),
  botSlug: z.string(),
  botCreatedAt: z.string(),
  account: z.string(),
  values: z.record(z.string(), z.string()),
});
const referencePattern = /^private:([0-9a-f-]{36}):([a-z][a-z0-9_]{0,47})$/;
type Pending = {
  agent: Agent;
  botSlug: string;
  botCreatedAt: string;
  request: PrivateInputDeclaration;
  signal: AbortSignal;
  abort(): void;
  resolve(result: PrivateInputResult): void;
  deciding: boolean;
};
export class PrivateInputs {
  readonly #pending = new Map<string, Pending>();
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
    },
  ) {}

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

  async ask(agent: Agent, input: unknown, signal: AbortSignal): Promise<PrivateInputResult> {
    const request = privateRequestSchema.safeParse(input);
    const owner = this.#owner(agent);
    if (!request.success || owner === undefined || signal.aborted)
      throw new Error('Private input request is invalid or unavailable');
    if (!(await this.deps.qualified()) || this.deps.credentials() === undefined)
      throw new Error('Protected credential consumption is unavailable in this Profile');
    if (signal.aborted || this.#owner(agent)?.createdAt !== owner.createdAt)
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
      deciding: false,
      resolve,
      abort: () => this.#cancel(id),
    };
    this.#pending.set(id, pending);
    signal.addEventListener('abort', pending.abort, { once: true });
    try {
      const committed = await this.deps.channels.appendMessage(channelId, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: owner.botSlug },
        body: request.data.purpose,
        privateInputRequest: { ...request.data, sessionId: agent.session.id },
      });
      if (committed === undefined) throw new Error('Private input request could not be saved');
      if (signal.aborted) this.#cancel(id);
      this.deps.log('requested', {
        requestId: id,
        botSlug: owner.botSlug,
        sessionId: agent.session.id,
      });
      return await result;
    } finally {
      signal.removeEventListener('abort', pending.abort);
      if (this.#pending.get(id) === pending) this.#pending.delete(id);
    }
  }

  status(channelId: string, messageId: string): PrivateInputStatus {
    const pending = this.#pending.get(messageId);
    if (pending !== undefined && channelId === dmChannelId(pending.botSlug)) {
      const owner = this.#owner(pending.agent);
      if (
        !pending.signal.aborted &&
        owner?.botSlug === pending.botSlug &&
        owner.createdAt === pending.botCreatedAt
      )
        return 'pending';
      this.#cancel(messageId);
    }
    const resolution = this.deps.channels.message(
      channelId,
      'private-resolution-' + messageId,
    )?.privateInputResolution;
    return resolution?.state ?? 'expired';
  }
  async submit(owner: boolean, input: unknown): Promise<boolean> {
    if (!owner) return false;
    const parsed = privateSubmissionSchema.safeParse(input);
    if (!parsed.success) return false;
    const { channelId, messageId, values } = parsed.data;
    const pending = this.#pending.get(messageId);
    if (
      pending === undefined ||
      pending.deciding ||
      this.status(channelId, messageId) !== 'pending' ||
      channelId !== dmChannelId(pending.botSlug)
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
    pending.deciding = true;
    const grantId = randomUUID();
    const key = credentialKey('botharness-private', 'grant-' + grantId);
    const references = Object.fromEntries(
      fields
        .filter((field) => (values[field.id]?.length ?? 0) > 0)
        .map((field) => [field.id, `private:${grantId}:${field.id}`]),
    );
    let stored = false;
    try {
      if (!(await this.deps.qualified()) || this.status(channelId, messageId) !== 'pending')
        return false;
      await credentials.modifyRecord(key, async (current) => {
        if (current !== undefined) throw new Error('Private credential grant collision');
        if (this.status(channelId, messageId) !== 'pending')
          throw new Error('Private input request expired');
        return {
          kind: 'grant',
          payload: {
            version: 1,
            botSlug: pending.botSlug,
            botCreatedAt: pending.botCreatedAt,
            account: pending.request.account,
            values,
          },
        };
      });
      stored = true;
      if (this.status(channelId, messageId) !== 'pending') return false;
      const committed = await this.deps.channels.appendMessage(channelId, {
        id: 'private-resolution-' + messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: messageId,
        body: 'Private information configured',
        privateInputResolution: { requestMessageId: messageId, state: 'configured', references },
      });
      if (committed === undefined || this.status(channelId, messageId) !== 'pending') return false;
      this.#pending.delete(messageId);
      pending.resolve({ status: 'configured', account: pending.request.account, references });
      this.deps.log('configured', {
        requestId: messageId,
        botSlug: pending.botSlug,
        sessionId: pending.agent.session.id,
      });
      stored = false;
      return true;
    } catch {
      this.deps.log('submit-failed', {
        requestId: messageId,
        botSlug: pending.botSlug,
        sessionId: pending.agent.session.id,
      });
      return false;
    } finally {
      if (stored) await credentials.deleteRecord(key).catch(() => this.deps.log('cleanup-failed'));
      pending.deciding = false;
    }
  }

  cancel(owner: boolean, channelId: string, messageId: string): boolean {
    if (
      !owner ||
      this.status(channelId, messageId) !== 'pending' ||
      this.#pending.get(messageId)?.deciding
    )
      return false;
    this.#cancel(messageId);
    return true;
  }

  #cancel(messageId: string): void {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) return;
    this.#pending.delete(messageId);
    pending.resolve({ status: 'cancelled', account: pending.request.account, references: {} });
    void this.deps.channels
      .appendMessage(dmChannelId(pending.botSlug), {
        id: 'private-resolution-' + messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        replyTo: messageId,
        body: 'Private input cancelled',
        privateInputResolution: { requestMessageId: messageId, state: 'cancelled', references: {} },
      })
      .catch(() => this.deps.log('cancel-save-failed'));
    this.deps.log('cancelled', {
      requestId: messageId,
      botSlug: pending.botSlug,
      sessionId: pending.agent.session.id,
    });
  }

  async consume<T>(
    agent: Agent,
    account: string,
    references: Record<string, string>,
    run: (values: Record<string, string>) => Promise<T>,
  ): Promise<T> {
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
      matches.some(({ field }) => grant.data.values[field] === undefined)
    )
      throw new Error('Credential grant is unavailable for this PersonaBot and account');
    if (this.#owner(agent)?.createdAt !== owner.createdAt)
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

  close(): void {
    this.#closed = true;
    for (const id of this.#pending.keys()) this.#cancel(id);
  }
}

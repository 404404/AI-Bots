import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import type { ContentPurge } from '../purge/contracts.js';
import type { ChannelMessage } from '../channels/channel.js';
import type { BotRuntime, AssignmentSummary } from '../runtime/bot-runtime.js';
import type { BotStateTracker } from '../state/bot-state.js';
import { TobError } from './service.js';

export interface TobContentReadInput {
  target: string;
  messageId?: string;
  expectedTarget?: string;
  cursor?: string;
  limit?: number;
}
export interface TobContentPage {
  target: string;
  targetFingerprint: string;
  revision: string;
  readOnly: true;
  contentRole: 'data';
  source: 'human-channel-timeline' | 'assignment-directory-and-runtime-state';
  entries: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
  observedAt: string;
  state?: string;
  attention?: unknown;
  completeness: string;
}
type Dependencies = {
  registry: Pick<PersonaBotRegistry, 'get'>;
  channels: Pick<ChannelStore, 'get' | 'revision' | 'readHumanTimeline'>;
  runtime?: Pick<BotRuntime, 'listAssignments'>;
  contentPurge?: Pick<ContentPurge, 'redactions'>;
  states: Pick<BotStateTracker, 'snapshot' | 'version'>;
};
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function text(value: unknown, max = 512): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max)
    throw new TobError('invalid-input');
  return value;
}
function input(value: unknown): TobContentReadInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !['target', 'messageId', 'expectedTarget', 'cursor', 'limit'].includes(key),
    )
  )
    throw new TobError('invalid-input');
  const limit = raw.limit ?? 10;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new TobError('invalid-input');
  const expectedTarget = raw.expectedTarget === undefined ? undefined : text(raw.expectedTarget);
  if (expectedTarget !== undefined && !/^[a-f0-9]{64}$/u.test(expectedTarget))
    throw new TobError('invalid-input');
  return {
    target: text(raw.target),
    ...(raw.messageId === undefined ? {} : { messageId: text(raw.messageId) }),
    limit,
    ...(expectedTarget === undefined ? {} : { expectedTarget }),
    ...(raw.cursor === undefined ? {} : { cursor: text(raw.cursor, 2048) }),
  };
}
function offset(
  args: TobContentReadInput,
  fingerprint: string,
  revision: string,
  kind: 'channel' | 'body' | 'progress',
  secret: Buffer,
): number {
  if (args.expectedTarget !== undefined && args.expectedTarget !== fingerprint)
    throw new TobError('changed-read-target');
  if (args.cursor === undefined) return 0;
  const [payload, signature, extra] = args.cursor.split('.');
  if (!payload || !signature || extra !== undefined || !/^[a-f0-9]{64}$/u.test(signature))
    throw new TobError('invalid-read-cursor');
  const expected = createHmac('sha256', secret).update(payload).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new TobError('invalid-read-cursor');
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new TobError('invalid-read-cursor');
  }
  if (!value || typeof value !== 'object') throw new TobError('invalid-read-cursor');
  const cursor = value as Record<string, unknown>;
  if (
    cursor.target !== args.target ||
    cursor.fingerprint !== fingerprint ||
    cursor.messageId !== args.messageId
  )
    throw new TobError('changed-read-target');
  if (cursor.revision !== revision) throw new TobError('stale-read-revision');
  if (cursor.kind !== kind || (kind === 'channel' && typeof cursor.anchor !== 'string'))
    throw new TobError('invalid-read-cursor');
  if (
    cursor.v !== 1 ||
    typeof cursor.offset !== 'number' ||
    !Number.isSafeInteger(cursor.offset) ||
    cursor.offset < 1 ||
    cursor.offset >= (args.messageId === undefined ? 1000 : 1_000_000)
  )
    throw new TobError('invalid-read-cursor');
  return cursor.offset;
}
function cursor(
  args: TobContentReadInput,
  fingerprint: string,
  revision: string,
  offset: number,
  secret: Buffer,
  anchor?: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      target: args.target,
      fingerprint,
      revision,
      offset,
      kind: args.messageId !== undefined ? 'body' : anchor === undefined ? 'progress' : 'channel',
      ...(anchor === undefined ? {} : { anchor }),
      ...(args.messageId === undefined ? {} : { messageId: args.messageId }),
    }),
  ).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('hex');
}
function bounded(value: string, maximum = 1000) {
  let text = '';
  let bytes = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char);
    if (text.length + char.length > maximum || bytes + size > 1000) break;
    text += char;
    bytes += size;
  }
  return { text, truncated: text.length < value.length, characters: value.length };
}
export function readTobBodyChunk(body: string, start: number) {
  const text = bounded(body.slice(start), Math.min(1000, 1_000_000 - start)).text;
  const next = start + text.length;
  const hasMore = next < body.length;
  const limitReached = hasMore && (next >= 1_000_000 || text.length === 0);
  return { text, next, hasMore, limitReached };
}
function checked(result: TobContentPage): TobContentPage {
  if (Buffer.byteLength(JSON.stringify(result)) > 8192) throw new TobError('read-result-too-large');
  return result;
}
function fitPage<T>(entries: T[]): T[] {
  let bytes = 0;
  const result: T[] = [];
  for (const entry of entries) {
    const size = Buffer.byteLength(JSON.stringify(entry));
    if (bytes + size > 6144) break;
    bytes += size;
    result.push(entry);
  }
  return result;
}
function messageView(message: ChannelMessage, revision: number) {
  return {
    messageId: message.id,
    revision,
    at: message.at,
    author:
      message.author.kind === 'bridged'
        ? { kind: 'bridged', source: bounded(message.author.source, 256).text }
        : message.author.kind === 'bot'
          ? { kind: 'bot', slug: message.author.slug }
          : { kind: message.author.kind },
    body: bounded(message.body),
    ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
    attachments: (message.attachments ?? []).slice(0, 8).map((attachment) => ({
      ...(attachment.fileId === undefined
        ? { hash: attachment.hash }
        : { fileId: attachment.fileId }),
      size: attachment.size,
      name: attachment.name.slice(0, 120),
      mime: attachment.mime.slice(0, 128),
    })),
    attachmentsOmitted: Math.max(0, (message.attachments?.length ?? 0) - 8),
    cardKinds: [
      'toolApprovalRequest',
      'toolApprovalDecision',
      'privateInputRequest',
      'privateInputResolution',
      'sessionFailure',
      'userQuestionRequest',
      'userQuestionResolution',
    ].filter((key) => Object.hasOwn(message, key)),
  };
}
function assignmentView(assignment: AssignmentSummary) {
  return {
    sessionId: assignment.sessionId,
    purpose: bounded(assignment.purpose),
    activity: assignment.activity,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    ...(assignment.latestReport === undefined
      ? {}
      : {
          latestReport: {
            state: assignment.latestReport.state,
            at: assignment.latestReport.at,
            summary: bounded(assignment.latestReport.summary),
            contentRole: 'data',
          },
        }),
    ...(assignment.openAsk === undefined
      ? {}
      : {
          openAsk: {
            sourceEventId: assignment.openAsk.sourceEventId,
            at: assignment.openAsk.at,
            summary: bounded(assignment.openAsk.summary),
          },
        }),
    ...(assignment.executionWait === undefined ? {} : { executionWait: assignment.executionWait }),
  };
}
export function createTobContentReader(deps: Dependencies) {
  const secret = randomBytes(32);
  const bot = (slug: string) => {
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    if (record.paused) throw new TobError('archived-bot');
    return record;
  };
  const queries = {
    channel(raw: unknown): TobContentPage {
      const args = input(raw);
      const channel = deps.channels.get(args.target);
      if (!channel || channel.deletedAt) throw new TobError('channel-unavailable');
      const humanDm = channel.type === 'dm' && channel.botSlug !== undefined;
      const targetBot = humanDm ? bot(channel.botSlug!) : undefined;
      const memberIdentities =
        channel.type === 'dm'
          ? channel.members.map((slug) => {
              const member = bot(slug);
              return { slug, createdAt: member.createdAt };
            })
          : undefined;
      const fingerprint = hash({
        memberIdentities,
        kind: 'channel',
        id: channel.id,
        createdAt: channel.createdAt,
        type: channel.type,
        name: channel.name,
        members: channel.members,
        owner: channel.ownerBotSlug,
        bot: targetBot && { slug: targetBot.slug, createdAt: targetBot.createdAt },
      });
      const revision = hash({
        head: deps.channels.revision(channel.id),
        purged:
          deps.contentPurge?.redactions().filter((entry) => entry.channelId === channel.id) ?? [],
      });
      const start = offset(
        args,
        fingerprint,
        revision,
        args.messageId === undefined ? 'channel' : 'body',
        secret,
      );
      if (args.messageId !== undefined) {
        const page = deps.channels.readHumanTimeline(channel.id, {
          direction: 'around',
          around: args.messageId,
          olderLimit: 0,
          newerLimit: 0,
        });
        const message = page?.entries.find((entry) => entry.id === args.messageId);
        if (!message) throw new TobError('message-unavailable');
        if (start > message.body.length) throw new TobError('invalid-read-cursor');
        const chunk = readTobBodyChunk(message.body, start);
        const { next, hasMore, limitReached } = chunk;
        return {
          target: channel.id,
          targetFingerprint: fingerprint,
          revision,
          readOnly: true,
          contentRole: 'data',
          source: 'human-channel-timeline',
          entries: [
            {
              ...messageView(message, message.channelRevision ?? 0),
              body: {
                text: chunk.text,
                offset: start,
                characters: message.body.length,
                truncated: hasMore || start > 0,
              },
            },
          ],
          hasMore,
          nextCursor:
            hasMore && !limitReached ? cursor(args, fingerprint, revision, next, secret) : null,
          observedAt: new Date().toISOString(),
          completeness: limitReached
            ? 'traversal-limit'
            : 'bounded selected message body chunk; structured private/approval payloads omitted; attachments metadata only',
        };
      }
      const request = {
        limit: Math.min(args.limit!, 1000 - start),
        ...(args.cursor === undefined
          ? {}
          : {
              direction: 'older' as const,
              cursor: (
                JSON.parse(
                  Buffer.from(args.cursor.split('.')[0]!, 'base64url').toString('utf8'),
                ) as {
                  anchor: string;
                }
              ).anchor,
            }),
      };
      let page = deps.channels.readHumanTimeline(channel.id, request);
      if (!page) throw new TobError('stale-read-revision');
      const fitting = fitPage(
        [...page.entries].reverse().map((entry) => messageView(entry, entry.channelRevision ?? 0)),
      );
      if (fitting.length < page.entries.length) {
        if (fitting.length === 0) throw new TobError('read-result-too-large');
        page = deps.channels.readHumanTimeline(channel.id, { ...request, limit: fitting.length });
        if (!page) throw new TobError('stale-read-revision');
      }
      const hasMore = page.hasOlder;
      const next = start + page.entries.length;
      return {
        target: channel.id,
        targetFingerprint: fingerprint,
        revision,
        readOnly: true,
        contentRole: 'data',
        source: 'human-channel-timeline',
        entries: page.entries.map((entry) => messageView(entry, entry.channelRevision ?? 0)),
        hasMore,
        nextCursor:
          hasMore && next < 1000
            ? cursor(args, fingerprint, revision, next, secret, page.olderCursor ?? undefined)
            : null,
        observedAt: new Date().toISOString(),
        completeness:
          hasMore && next >= 1000
            ? 'traversal-limit; narrow the request or start a fresh snapshot'
            : 'bounded message page; bodies may be truncated; attachments are metadata only; structured private and approval payloads omitted',
      };
    },
    progress(raw: unknown): TobContentPage {
      const args = input(raw);
      if (args.messageId !== undefined) throw new TobError('invalid-input');
      const target = bot(args.target);
      if (!deps.runtime) throw new TobError('progress-unavailable');
      const fingerprint = hash({ kind: 'bot', slug: target.slug, createdAt: target.createdAt });
      const canonicalAssignments = deps.runtime
        .listAssignments(target.slug)
        .filter((assignment) => assignment.archivedAt === undefined);
      const assignments = canonicalAssignments.map(assignmentView);
      const state = deps.states.snapshot(target.slug);
      const revision = hash({
        assignments: canonicalAssignments,
        state,
        generation: deps.states.version().generation,
      });
      const start = offset(args, fingerprint, revision, 'progress', secret);
      if (start > assignments.length) throw new TobError('invalid-read-cursor');
      const entries = fitPage(assignments.slice(start, Math.min(start + args.limit!, 1000)));
      if (entries.length === 0 && start < assignments.length)
        throw new TobError('read-result-too-large');
      const next = start + entries.length;
      const hasMore = next < assignments.length;
      return {
        target: target.slug,
        targetFingerprint: fingerprint,
        revision,
        readOnly: true,
        contentRole: 'data',
        source: 'assignment-directory-and-runtime-state',
        entries,
        state: state.state,
        ...(state.attention === undefined ? {} : { attention: state.attention }),
        hasMore,
        nextCursor:
          hasMore && next < 1000 ? cursor(args, fingerprint, revision, next, secret) : null,
        observedAt: new Date().toISOString(),
        completeness:
          hasMore && next >= 1000
            ? 'traversal-limit'
            : 'current process activity and bounded non-archived Assignment facts; reports are quoted claims, not proof of completion; no full Session history',
      };
    },
  };
  return {
    channel(raw: unknown): TobContentPage {
      return checked(queries.channel(raw));
    },
    progress(raw: unknown): TobContentPage {
      return checked(queries.progress(raw));
    },
  };
}

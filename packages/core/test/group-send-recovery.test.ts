import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

function open(dshHome: string) {
  return createCore({
    dshHome,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
}

async function fixture(
  check: (f: {
    current(): ReturnType<typeof createCore>;
    channelId: string;
    restart(): Promise<void>;
    human(id: string, body: string): Promise<void>;
    tool(
      args: Record<string, unknown>,
      bot?: string,
    ): Promise<{
      status?: string;
      draftId: string;
      messageId: string;
      review: { observationId: string };
      drafts: { state: string; draftId: string; messageId: string }[];
    }>;
    read(): Promise<string>;
  }) => Promise<void>,
) {
  const home = createTempRoot('group-send-recovery-');
  let core = open(home);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bob', displayName: 'Bob' });
  const group = core.channels.createGroup({ name: 'Recovery', members: ['ada', 'bob'] });
  for (const bot of group.members)
    core.channels.setGroupWakePolicy(group.id, bot, {
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
  core.runtime.groupSendReview!.configure(group.id, true);
  const call = async (name: string, args: Record<string, unknown>, bot = 'ada') =>
    (
      await core.runtime.runDirectBotTool!(
        bot,
        name,
        { channel_id: group.id, ...args },
        new AbortController().signal,
      )
    ).result;
  try {
    await check({
      current: () => core,
      channelId: group.id,
      restart: async () => {
        await core.runtime.close();
        core.operationalDatabase.close();
        core = open(home);
      },
      human: async (id, body) => {
        await core.channels.appendMessage(group.id, {
          id,
          body,
          author: { kind: 'human' },
          at: new Date().toISOString(),
        });
      },
      tool: async (args, bot) => JSON.parse(JSON.stringify(await call('channel_send', args, bot))),
      read: async () =>
        JSON.parse(JSON.stringify(await call('channel_read', {}))).observationIds[group.id],
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('explicit Group draft recovery and commit receipts', () => {
  it('holds recovery when an attachment changes after the fresh observation', async () => {
    await fixture(async (f) => {
      const ref = await f.current().attachments.upload({
        name: 'agenda.txt',
        data: (async function* () {
          yield Buffer.from('Meet at 10:00');
        })(),
      });
      await f.current().channels.appendMessage(f.channelId, {
        id: 'attachment-request',
        body: 'Summarize this agenda',
        author: { kind: 'human' },
        at: new Date().toISOString(),
        attachments: [ref],
      });
      const held = await f.tool({ body: 'Meet at 10:00' });
      await f.restart();
      const observation = await f.read();
      writeFileSync(f.current().attachments.fileTarget(ref.fileId!).path, 'Meet at 11:00');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: observation,
        }),
      ).toMatchObject({
        status: 'requires-review',
        changedMessageIds: ['attachment-request'],
      });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });

  it.each(['drop', 'stop'] as const)(
    'does not revive a draft after %s and restart',
    async (action) => {
      await fixture(async (f) => {
        await f.human('request', 'Do not send after cancellation');
        const held = await f.tool({ body: 'Cancelled notice' });
        if (action === 'stop') await f.current().runtime.stopBot!('ada');
        else await f.tool({ body: '', drop: true, draft_id: held.draftId });
        await f.restart();
        expect(
          await f.tool({
            body: 'Cancelled notice',
            review_action: 'recover',
            draft_id: held.draftId,
            observation_id: await f.read(),
          }),
        ).toMatchObject({ status: 'refused', reason: 'draft-terminal' });
        expect(
          f
            .current()
            .channels.readMessages(f.channelId)
            .filter((m) => m.author.kind === 'bot'),
        ).toHaveLength(0);
      });
    },
  );

  it('still holds a correction that arrives after the recovery observation', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      const held = await f.tool({ body: 'Meet at 10:00' });
      await f.restart();
      const observation = await f.read();
      await f.human('correction', 'Actually 11:00');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          review_action: 'recover',
          draft_id: held.draftId,
          observation_id: observation,
        }),
      ).toMatchObject({ status: 'requires-review' });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });

  it('removes receipt metadata with canonical purge and cannot inspect it across Groups', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private request');
      const held = await f.tool({ body: 'Private draft' });
      const other = f.current().channels.createGroup({ name: 'Other', members: ['ada'] });
      expect(
        await f.tool({
          body: '',
          review_action: 'inspect',
          channel_id: other.id,
          draft_id: held.draftId,
        }),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      const draft = f
        .current()
        .runtime.groupSendReview!.inspect('direct:ada', f.channelId, held.draftId)!;
      f.current().channels.deleteGroup(f.channelId);
      const preview = f.current().contentPurge.preview(f.channelId, [draft.sourceEventId]);
      f.current().contentPurge.confirm(f.channelId, preview.sourceEventIds, preview.token);
      expect(
        f
          .current()
          .runtime.groupSendReview!.inspectRecords('direct:ada', f.channelId, held.draftId),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
    });
  });

  it('requires a fresh observation after a real Core restart and commits only the corrected draft', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 10:00');
      const held = await f.tool({ body: 'Meet at 10:00' });
      const oldObservation = held.review.observationId;
      await f.restart();
      await f.human('correction', 'Actually 11:00');
      const inspection = await f.tool({
        body: '',
        review_action: 'inspect',
        draft_id: held.draftId,
      });
      expect(inspection).toMatchObject({
        status: 'inspected',
        drafts: [{ draftId: held.draftId, state: 'held', requiresRecovery: true }],
      });
      expect(JSON.stringify(inspection)).not.toContain('Meet at');
      expect(
        await f.tool({
          body: 'Meet at 10:00',
          draft_id: held.draftId,
          observation_id: oldObservation,
        }),
      ).toMatchObject({ status: 'requires-review', reason: 'host-restarted' });
      expect(
        await f.tool({
          body: 'Meet at 11:00',
          draft_id: held.draftId,
          observation_id: oldObservation,
          review_action: 'recover',
        }),
      ).toMatchObject({
        status: 'refused',
        reason: 'recovery-requires-draft-and-fresh-observation',
      });
      const result = await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: await f.read(),
        review_action: 'recover',
      });
      expect(result.status).toBe('committed');
      const replies = f
        .current()
        .channels.readMessages(f.channelId)
        .filter((m) => m.author.kind === 'bot');
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ id: result.messageId, body: 'Meet at 11:00' });
    });
  });

  it('confirms the same canonical commit after its response is discarded, including after restart', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Meet at 11:00');
      const held = await f.tool({ body: 'Meet at 11:00' });
      await f.tool({
        body: 'Meet at 11:00',
        draft_id: held.draftId,
        observation_id: held.review.observationId,
      });
      const before = f.current().channels.readMessages(f.channelId);
      const db = attachOperationalModule(f.current().operationalDatabase, 'receipt-test');
      const admissions = db.read(
        (database) => database.prepare('SELECT COUNT(*) AS n FROM inbox_admissions').get()!.n,
      );
      await f.restart();
      const receipt = await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId });
      expect(receipt).toMatchObject({
        status: 'inspected',
        drafts: [{ state: 'committed', requiresRecovery: false }],
      });
      const replay = await f.tool({ body: 'Meet at 11:00', draft_id: held.draftId });
      expect(replay.messageId).toBe(receipt.drafts[0]!.messageId);
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .map((m) => m.id),
      ).toEqual(before.map((m) => m.id));
      const after = attachOperationalModule(f.current().operationalDatabase, 'receipt-test');
      expect(
        after.read(
          (database) => database.prepare('SELECT COUNT(*) AS n FROM inbox_admissions').get()!.n,
        ),
      ).toBe(admissions);
      expect(await f.tool({ body: 'Different notice', draft_id: held.draftId })).toMatchObject({
        status: 'refused',
        reason: 'draft-commit-content-changed',
      });
      expect(await f.tool({ body: 'Meet at 11:00', draft_id: held.draftId }, 'bob')).toMatchObject({
        status: 'refused',
        reason: 'draft-unavailable',
      });
    });
  });

  it('retains a receipt for an uninterrupted send without an additional model round', async () => {
    await fixture(async (f) => {
      await f.human('request', 'A single notice');
      const result = await f.tool({ body: 'A single notice', observation_id: await f.read() });
      expect(result.status).toBe('committed');
      const inspected = await f.tool({ body: '', review_action: 'inspect' });
      expect(inspected.drafts).toHaveLength(1);
      expect(inspected.drafts[0]!.messageId).toBe(result.messageId);
      expect(
        await f.tool({ body: 'A single notice', draft_id: inspected.drafts[0]!.draftId }),
      ).toMatchObject({ messageId: result.messageId });
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('removes committed receipt authority when the canonical Channel content is purged', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private notice');
      const committed = await f.tool({ body: 'Private notice', observation_id: await f.read() });
      const receipt = await f.tool({ body: '', review_action: 'inspect' });
      const draftId = receipt.drafts[0]!.draftId;
      const db = attachOperationalModule(f.current().operationalDatabase, 'receipt-purge-test');
      const source = db.read(
        (database) =>
          database
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(f.channelId, committed.messageId)!.source_event_id,
      );
      f.current().channels.deleteGroup(f.channelId);
      const preview = f.current().contentPurge.preview(f.channelId, [String(source)]);
      f.current().contentPurge.confirm(f.channelId, preview.sourceEventIds, preview.token);
      await f.restart();
      expect(
        f.current().runtime.groupSendReview!.inspectRecords('direct:ada', f.channelId, draftId),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      expect(f.current().channels.message(f.channelId, committed.messageId)).toMatchObject({
        body: '',
        contentPurge: { reason: 'human-request' },
      });
    });
  });

  it('does not inspect or recover another owner, an expired draft, or a revoked Group', async () => {
    await fixture(async (f) => {
      await f.human('request', 'Private request');
      const held = await f.tool({ body: 'Private draft' });
      expect(
        await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }, 'bob'),
      ).toMatchObject({ status: 'refused', reason: 'draft-unavailable' });
      const db = attachOperationalModule(f.current().operationalDatabase, 'expiry-test');
      db.transaction((database) =>
        database
          .prepare(
            "UPDATE group_send_review_drafts SET record_json = json_set(record_json, '$.expires', 0) WHERE id = ?",
          )
          .run(held.draftId),
      );
      expect(
        await f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }),
      ).toMatchObject({ drafts: [{ state: 'expired' }] });
      expect(
        await f.tool({
          body: 'Private draft',
          draft_id: held.draftId,
          review_action: 'recover',
          observation_id: await f.read(),
        }),
      ).toMatchObject({ status: 'expired' });
      f.current().channels.removeGroupMember(f.channelId, 'ada');
      await expect(
        f.tool({ body: '', review_action: 'inspect', draft_id: held.draftId }),
      ).rejects.toThrow(/not a member/);
      expect(
        f
          .current()
          .channels.readMessages(f.channelId)
          .filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });
});

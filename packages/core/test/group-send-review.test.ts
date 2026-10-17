import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { GroupSendReview } from '../src/channels/send-review.js';

async function fixture(
  check: (f: {
    core: ReturnType<typeof createCore>;
    channelId: string;
    human(id: string, body: string): Promise<void>;
    tool(
      name: string,
      args: Record<string, unknown>,
      bot?: string,
    ): Promise<{
      status?: string;
      draftId?: string;
      messageId: string;
      observationIds: Record<string, string>;
      changedMessageIds?: string[];
      review?: { observationId: string; content: string; complete: boolean };
    }>;
  }) => Promise<void>,
) {
  const core = createCore({
    dshHome: createTempRoot('group-send-review-'),
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bob', displayName: 'Bob' });
    const group = core.channels.createGroup({ name: 'Review', members: ['ada', 'bob'] });
    for (const bot of group.members)
      core.channels.setGroupWakePolicy(group.id, bot, {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
    core.runtime.groupSendReview!.configure(group.id, true);
    await check({
      core,
      channelId: group.id,
      human: async (id, body) => {
        await core.channels.appendMessage(group.id, {
          id,
          body,
          author: { kind: 'human' },
          at: new Date().toISOString(),
        });
      },
      tool: async (name, args, bot = 'ada') =>
        JSON.parse(
          JSON.stringify(
            (
              await core.runtime.runDirectBotTool!(
                bot,
                name,
                { channel_id: group.id, ...args },
                new AbortController().signal,
              )
            ).result,
          ),
        ),
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Group send review through the same direct model tools', () => {
  it('holds an obsolete answer without a public message, then commits a revision from actual new content', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Meet at 10:00');
      const read = await tool('channel_read', {});
      await human('correction', 'Correction: meet at 11:00');
      const held = await tool('channel_send', {
        body: 'Confirmed 10:00',
        observation_id: read.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toContain('correction');
      expect(core.channels.readMessages(channelId).map((m) => m.id)).toEqual(['correction', 'old']);
      expect(held.review?.complete).toBe(true);
      expect(
        JSON.parse(held.review!.content).messages.map(
          (view: { message: { body: string } }) => view.message.body,
        ),
      ).toEqual(['Correction: meet at 11:00']);
      const sent = await tool('channel_send', {
        body: 'Confirmed 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Confirmed 11:00');
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('rechecks an unchanged body from the held delta without a separate read or a silent basis upgrade', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee is ready');
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(true);
      const sent = await tool('channel_send', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Answer');
      const stale = await tool('channel_send', {
        body: 'Another answer',
        observation_id: read.observationIds[channelId],
      });
      expect(stale.status).toBe('held');
    });
  });

  it('does not let a held delta cover a later correction or another owner', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Meet at 10');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee');
      const held = await tool('channel_send', {
        body: 'Meet at 10',
        observation_id: read.observationIds[channelId],
      });
      await human('correction', 'Instead meet at 11');
      const recheck = await tool('channel_send', {
        body: 'Meet at 10',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('requires-review');
      expect(recheck.changedMessageIds).toContain('correction');
      const other = await tool(
        'channel_send',
        { body: 'Meet at 10', observation_id: held.review!.observationId },
        'bob',
      );
      expect(other.status).toBe('held');
    });
  });

  it('never observes content omitted from a bounded held delta', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Original');
      const read = await tool('channel_read', {});
      await human('small', 'A small change');
      await human('large', 'x'.repeat(20_000));
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(false);
      expect(held.review!.content.length).toBeLessThan(12_000);
      expect(held.review!.content).not.toContain('x'.repeat(100));
      const recheck = await tool('channel_send', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('requires-review');
      expect(recheck.changedMessageIds).toContain('large');
    });
  });

  it('cannot forge a read, transfer its owner, or pretend an omitted message was read', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('first', 'one');
      const read = await tool('channel_read', {});
      await human('gap', 'two');
      await human('last', 'three');
      const partial = await tool('channel_read', { limit: 1 });
      const held = await tool('channel_send', {
        body: 'one',
        observation_id: read.observationIds[channelId],
      });
      const skipped = await tool('channel_send', {
        body: 'three',
        draft_id: held.draftId,
        observation_id: partial.observationIds[channelId],
      });
      expect(skipped.status).toBe('requires-review');
      expect(skipped.changedMessageIds).toContain('gap');
      expect(
        (await tool('channel_send', { body: 'forged', observation_id: 'invented' })).status,
      ).toBe('requires-review');
      expect(
        (
          await tool(
            'channel_send',
            { body: 'other owner', observation_id: read.observationIds[channelId] },
            'bob',
          )
        ).status,
      ).toBe('held');
    });
  });

  it('allows an unchanged recheck for unrelated chatter, but bounds repeated changes and preserves Inbox responsibility on drop', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Unrelated: coffee');
      const held = await tool('channel_send', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      const fresh = await tool('channel_read', {});
      await human('again', 'Another change');
      const stopped = await tool('channel_send', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: fresh.observationIds[channelId],
      });
      expect(stopped.status).toBe('requires-review');
      const newest = await tool('channel_read', {});
      expect(
        (
          await tool('channel_send', {
            body: 'Answer',
            draft_id: held.draftId,
            observation_id: newest.observationIds[channelId],
          })
        ).status,
      ).toBe('refused');
      expect(
        (await tool('channel_send', { body: '', drop: true, draft_id: held.draftId })).status,
      ).toBe('dropped');
      const unresolved = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM inbox_admissions WHERE bot_slug = 'ada' AND resolution IS NULL",
          )
          .get(),
      );
      expect(Number(unresolved?.count)).toBeGreaterThan(0);
      expect(core.channels.readMessages(channelId).every((m) => m.author.kind !== 'bot')).toBe(
        true,
      );
    });
  });

  it('retains membership checks after a draft has been held', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Question');
      const held = await tool('channel_send', { body: 'Draft' });
      core.channels.removeGroupMember(channelId, 'ada');
      await expect(
        tool('channel_send', { body: 'Draft', draft_id: held.draftId }),
      ).rejects.toThrow();
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });
});

it('refuses automatic recovery after restart or expiry and removes draft content on purge', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('original', 'Private original');
    const held = await tool('channel_send', { body: 'Private draft' });
    const owner = 'direct:ada';
    const draft = core.runtime.groupSendReview!.inspect(owner, channelId, held.draftId!)!;
    const database = attachOperationalModule(core.operationalDatabase, 'test');
    const input = {
      owner,
      channelId,
      sourceEventId: draft.sourceEventId,
      message: draft.current,
      draftId: draft.id,
    };
    const restarted = new GroupSendReview(database);
    expect(database.transaction((db) => restarted.check(db, input))?.reason).toBe('host-restarted');
    const expired = new GroupSendReview(database, () => new Date(draft.expires + 1));
    expect(database.transaction((db) => expired.check(db, input))?.status).toBe('expired');
    core.channels.deleteGroup(channelId);
    const preview = core.contentPurge.preview(channelId, [draft.sourceEventId]);
    core.contentPurge.confirm(channelId, preview.sourceEventIds, preview.token);
    expect(core.runtime.groupSendReview!.inspect(owner, channelId, draft.id)).toBeUndefined();
    await expect(
      tool('channel_send', { body: 'Private draft', draft_id: draft.id }),
    ).rejects.toThrow();
  });
});

it('serializes two sends with the same observation and treats only the first as fresh', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('question', 'One answer');
    const read = await tool('channel_read', {});
    const outcomes = await Promise.all([
      tool('channel_send', { body: 'First', observation_id: read.observationIds[channelId] }),
      tool('channel_send', { body: 'Second', observation_id: read.observationIds[channelId] }),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(['committed', 'held']);
    expect(
      core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
    ).toHaveLength(1);
  });
});

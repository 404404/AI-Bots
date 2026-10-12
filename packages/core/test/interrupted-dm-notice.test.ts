import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('interrupted Human DM notice', () => {
  it('tells the next turn from another Channel that the unanswered DM request stays in its DM', async () => {
    const home = createTempRoot('botharness-interrupted-dm-');
    const turns: Array<{ channel: string | undefined; message: string }> = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns.push({ channel: run.inboundChannelId, message: run.message });
        if (run.message.includes('history of bridges') && turns.length === 1)
          throw new Error('Host stopped');
        await run.channels.send({ body: 'ok' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-dm-interrupted',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Write the history of bridges',
      });
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-dm-interrupted',
        body: 'Write the history of bridges',
      });
      if (!admission.admitted) throw new Error(admission.reason);
      await expect(admission.settled).rejects.toThrow('Host stopped');

      const mention = async (id: string): Promise<void> => {
        await core.channels.appendMessageOnce(group.id, {
          id,
          at: '2026-09-25T00:01:00.000Z',
          author: { kind: 'human' },
          body: '@Ada reply here',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        });
        core.runtime.admitGroupMessage(group.id, id);
        await core.runtime.whenIdle();
      };
      await mention('human-group-1');
      await mention('human-group-2');

      expect(turns.map((turn) => turn.channel)).toEqual([dm.id, group.id, group.id]);
      expect(turns[0]!.message).not.toContain(
        '[Host: earlier Human DM turn ended without a reply]',
      );
      expect(turns[1]!.message).toContain(
        `[Host: earlier Human DM turn ended without a reply]\nChannel: ${dm.id}\nMessage ID: human-dm-interrupted\n`,
      );
      expect(turns[1]!.message).toContain('Do not answer it in any other Channel');
      expect(turns[1]!.message).toContain('[Bot Inbox: direct Group mention from Human]');
      expect(turns[2]!.message).not.toContain(
        '[Host: earlier Human DM turn ended without a reply]',
      );

      await core.channels.appendMessage(dm.id, {
        id: 'human-dm-next',
        at: '2026-09-25T00:02:00.000Z',
        author: { kind: 'human' },
        body: 'Still there?',
      });
      const next = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-dm-next',
        body: 'Still there?',
      });
      if (!next.admitted) throw new Error(next.reason);
      await next.settled;
      expect(turns[3]!.message).not.toContain(
        '[Host: earlier Human DM turn ended without a reply]',
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

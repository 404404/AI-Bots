import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(): BotAgentAdapter {
  return {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('Channel unread counts', () => {
  it('counts unread Bot messages per Channel and drops a Channel once it is read', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-channel-unread-'),
      agents: adapter(),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const append = (channelId: string, id: string, minute: number, human = false) =>
        core.channels.appendMessage(channelId, {
          id,
          at: new Date(Date.UTC(2026, 9, 14, 1, minute)).toISOString(),
          author: human ? { kind: 'human' } : { kind: 'bot', slug: 'ada' },
          body: id,
        });
      await append(group.id, 'own', 0, true);
      await append(group.id, 'first', 1);
      await append(group.id, 'second', 2);
      await append(dm.id, 'dm-one', 3);
      const methods = createBridgeMethods({ ...core });
      const counts = () => {
        const result = methods.channelUnreadCounts({});
        if (!result.ok) throw new Error('channelUnreadCounts failed');
        return [...result.value.channels].sort((a, b) => a.channelId.localeCompare(b.channelId));
      };
      expect(counts()).toEqual(
        [
          { channelId: group.id, unreadCount: 2 },
          { channelId: dm.id, unreadCount: 1 },
        ].sort((a, b) => a.channelId.localeCompare(b.channelId)),
      );
      await core.channels.markRead(group.id, 'second');
      expect(counts()).toEqual([{ channelId: dm.id, unreadCount: 1 }]);
      expect(core.humanAttention.status().unreadCount).toBe(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

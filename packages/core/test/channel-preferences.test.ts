import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture(home = createTempRoot('channel-preferences-')) {
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  await core.roster.attach(createFakeRosterDomain().facility);
  for (const slug of ['ada', 'bob'])
    if (!core.registry.get(slug)) core.registry.create({ slug, displayName: slug });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const group = core.channels.createGroup({ name: 'Study', members: ['ada', 'bob'] });
  const database = attachOperationalModule(core.operationalDatabase, 'channel-preferences-test');
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.roster.detach();
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  cleanup.push(close);
  const methods = createBridgeMethods({
    registry: core.registry,
    channels: core.channels,
    states: core.states,
    ownership: core.ownership,
    roster: core.roster,
    channelPreferences: core.channelPreferences,
  });
  return { home, core, owner: core.channelPreferences, dm, group, database, close, methods };
}

describe('current Human Channel preferences', () => {
  it('reads without writes and changes only the target across ordinary DM and Group', async () => {
    const f = await fixture();
    const untouched = f.owner.snapshot(f.dm.id);
    const channel = f.core.channels.get(f.group.id);
    const bot = f.core.registry.get('ada');
    const before = f.core.operationalDatabase.diagnostics().metrics;
    const initial = f.owner.snapshot(f.group.id);
    expect(initial).toMatchObject({
      scope: 'human-channel',
      humanId: 'local-human',
      pinned: false,
      hidden: false,
      muted: false,
      nickname: null,
    });
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(
      before.transactionsCommitted,
    );
    const muted = await f.owner.update({
      channelId: f.group.id,
      expectedState: initial.stateFingerprint,
      patch: { muted: true },
    });
    const pinned = await f.owner.update({
      channelId: f.group.id,
      expectedState: muted.stateFingerprint,
      patch: { pinned: true },
    });
    const hidden = await f.owner.update({
      channelId: f.group.id,
      expectedState: pinned.stateFingerprint,
      patch: { hidden: true },
    });
    expect(hidden).toMatchObject({ muted: true, pinned: true, hidden: true, nickname: null });
    expect(f.owner.snapshot(f.dm.id)).toEqual(untouched);
    expect(f.core.channels.get(f.group.id)).toEqual(channel);
    expect(f.core.registry.get('ada')).toEqual(bot);
    expect(await f.owner.update({ channelId: f.group.id, patch: { hidden: false } })).toMatchObject(
      { hidden: false, muted: true, pinned: true },
    );
  });

  it('preserves concurrent other-channel changes, sections, ordering and legacy pins', async () => {
    const f = await fixture();
    const section = await f.core.roster.sectionCreate('Keep');
    await f.core.roster.channelAssign(f.dm.id, section.id);
    await f.core.roster.pinsSet(['ada', 'unrelated']);
    const dm = f.owner.snapshot(f.dm.id);
    expect(dm.pinned).toBe(true);
    const initial = f.owner.snapshot(f.group.id);
    await Promise.all([
      f.owner.update({
        channelId: f.dm.id,
        expectedState: dm.stateFingerprint,
        patch: { hidden: true },
      }),
      f.owner.update({
        channelId: f.group.id,
        expectedState: initial.stateFingerprint,
        patch: { pinned: true },
      }),
    ]);
    expect(f.core.roster.snapshot()).toMatchObject({
      pins: ['ada', 'unrelated', f.group.id],
      hidden: [f.dm.id],
      sections: [{ id: section.id, channelIds: [f.dm.id] }],
    });
    await f.owner.update({ channelId: f.dm.id, patch: { pinned: false } });
    expect(f.core.roster.snapshot().pins).toEqual(['unrelated', f.group.id]);
  });

  it('checks CAS after the queue advances and does not mark stale approval as an effect', async () => {
    const f = await fixture();
    const initial = f.owner.snapshot(f.group.id);
    const effect = vi.fn();
    const first = f.owner.update({
      channelId: f.group.id,
      expectedState: initial.stateFingerprint,
      patch: { pinned: true },
    });
    const second = f.owner.update(
      { channelId: f.group.id, expectedState: initial.stateFingerprint, patch: { muted: true } },
      undefined,
      effect,
    );
    await first;
    await expect(second).rejects.toMatchObject({ code: 'stale-channel-preferences' });
    expect(effect).not.toHaveBeenCalled();
    expect(f.owner.snapshot(f.group.id)).toMatchObject({ pinned: true, muted: false });
  });

  it.each(['muted', 'nickname'] as const)(
    'preserves guard refusals for %s with no effect',
    async (field) => {
      const f = await fixture();
      const before = f.owner.snapshot(f.group.id);
      const refusal = new Error('source-turn-expired');
      const effect = vi.fn();
      await expect(
        f.owner.update(
          {
            channelId: f.group.id,
            patch: field === 'muted' ? { muted: true } : { nickname: 'New' },
          },
          () => {
            throw refusal;
          },
          effect,
        ),
      ).rejects.toBe(refusal);
      expect(effect).not.toHaveBeenCalled();
      expect(f.owner.snapshot(f.group.id)).toEqual(before);
    },
  );

  it('rejects cross-target tokens and stale nickname overwrites', async () => {
    const f = await fixture();
    const group = f.owner.snapshot(f.group.id);
    await expect(
      f.owner.update({
        channelId: f.dm.id,
        expectedState: group.stateFingerprint,
        patch: { muted: true },
      }),
    ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
    f.core.channels.setHumanNickname(f.group.id, 'Human changed');
    await expect(
      f.owner.update({
        channelId: f.group.id,
        expectedState: group.stateFingerprint,
        patch: { nickname: 'Old approval' },
      }),
    ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
    expect(f.core.channels.humanNickname(f.group.id)).toBe('Human changed');
  });

  it('normalizes own nickname, clears to inherit, and retains Bot/Group names', async () => {
    const f = await fixture();
    f.core.channels.setHumanDefaultName('Global Human');
    const before = f.owner.snapshot(f.dm.id);
    const updated = await f.owner.update({
      channelId: f.dm.id,
      expectedState: before.stateFingerprint,
      patch: { nickname: '  Local Human  ' },
    });
    expect(updated.nickname).toBe('Local Human');
    expect(f.core.channels.humanIdentity().displayName).toBe('Global Human');
    expect(f.core.registry.get('ada')?.displayName).toBe('ada');
    expect(f.core.channels.get(f.dm.id)?.name).toBe('Ada');
    expect(
      await f.owner.update({
        channelId: f.dm.id,
        expectedState: updated.stateFingerprint,
        patch: { nickname: null },
      }),
    ).toMatchObject({ nickname: null });
    expect(f.core.channels.listHumanMembers(f.dm.id)[0]?.displayName).toBe('Global Human');
  });

  it('rejects malformed, multi-field and non-single-line changes without touching state', async () => {
    const f = await fixture();
    const before = f.owner.snapshot(f.dm.id);
    for (const patch of [
      {},
      { muted: true, hidden: true },
      { nickname: 'x'.repeat(129) },
      { nickname: 'a\nb' },
      { nickname: 'a\u0000b' },
    ])
      await expect(f.owner.update({ channelId: f.dm.id, patch })).rejects.toMatchObject({
        code: 'invalid-input',
      });
    expect(f.owner.snapshot(f.dm.id)).toEqual(before);
  });

  it('checks live Human membership after queuing and inside nickname write', async () => {
    const f = await fixture();
    const write = f.owner.update({ channelId: f.group.id, patch: { hidden: true } });
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_human_members SET left_at=? WHERE channel_id=? AND human_id='local-human'",
        )
        .run(new Date().toISOString(), f.group.id),
    );
    await expect(write).rejects.toMatchObject({ code: 'channel-access-denied' });
    expect(f.core.roster.snapshot().hidden).toEqual([]);
    expect(() => f.owner.snapshot(f.group.id)).toThrow(
      expect.objectContaining({ code: 'channel-access-denied' }),
    );
    await expect(
      f.owner.update({ channelId: f.group.id, patch: { nickname: 'Not allowed' } }),
    ).rejects.toMatchObject({ code: 'channel-access-denied' });
  });

  it('refuses deleted Channels and Bot-to-Bot DMs', async () => {
    const f = await fixture();
    const botDm = f.core.channels.getOrCreateBotDm('ada', 'bob', 'Private')!;
    expect(() => f.owner.snapshot(botDm.id)).toThrow(
      expect.objectContaining({ code: 'unsupported-channel' }),
    );
    const write = f.owner.update({ channelId: f.group.id, patch: { pinned: true } });
    f.core.channels.deleteGroup(f.group.id);
    await expect(write).rejects.toMatchObject({ code: 'unknown-channel' });
  });

  it('binds Channel and DM Bot incarnations but permits paused Bots and irrelevant title changes', async () => {
    const f = await fixture();
    const original = f.owner.snapshot(f.dm.id);
    f.core.registry.setPaused('ada', true);
    f.core.channels.rename(f.dm.id, 'Renamed');
    expect(f.owner.snapshot(f.dm.id).stateFingerprint).toBe(original.stateFingerprint);
    const get = f.core.registry.get.bind(f.core.registry);
    vi.spyOn(f.core.registry, 'get').mockImplementation((slug) => {
      const bot = get(slug);
      return bot && slug === 'ada' ? { ...bot, createdAt: '2099-01-01T00:00:00.000Z' } : bot;
    });
    await expect(
      f.owner.update({
        channelId: f.dm.id,
        expectedState: original.stateFingerprint,
        patch: { muted: true },
      }),
    ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
    const group = f.owner.snapshot(f.group.id);
    const getChannel = f.core.channels.get.bind(f.core.channels);
    vi.spyOn(f.core.channels, 'get').mockImplementation((id) => {
      const channel = getChannel(id);
      return channel && id === f.group.id
        ? { ...channel, createdAt: '2099-01-01T00:00:00.000Z' }
        : channel;
    });
    await expect(
      f.owner.update({
        channelId: f.group.id,
        expectedState: group.stateFingerprint,
        patch: { pinned: true },
      }),
    ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
  });

  it('persists across reopen and is idempotent after current readback', async () => {
    const f = await fixture();
    await f.owner.update({ channelId: f.dm.id, patch: { muted: true } });
    await f.owner.update({ channelId: f.dm.id, patch: { nickname: 'Persist' } });
    const before = f.owner.snapshot(f.dm.id);
    await f.close();
    const reopened = await fixture(f.home);
    expect(reopened.owner.snapshot(f.dm.id)).toEqual(before);
    expect(
      await reopened.owner.update({
        channelId: f.dm.id,
        expectedState: before.stateFingerprint,
        patch: { muted: true },
      }),
    ).toEqual(before);
  });

  it('exposes canonical reads and guarded writes through Human RPC preserving old response fields', async () => {
    const f = await fixture();
    const rpc = registerBridge(new Context(), f.methods);
    const before = rpc.channelPreferences(f.group.id);
    expect(await rpc.channelPinSet(f.group.id, true, before.stateFingerprint)).toMatchObject({
      pinned: true,
    });
    await expect(
      rpc.channelHiddenSet(f.group.id, true, before.stateFingerprint),
    ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
    expect(await rpc.channelHiddenSet(f.group.id, true)).toMatchObject({ hidden: true });
    expect(await rpc.channelMuteSet(f.group.id, true)).toMatchObject({
      muted: [f.group.id],
      preferences: { muted: true },
    });
    expect(rpc.channelHumanNameSet(f.group.id, 'Me')).toMatchObject({
      channel: { humanNickname: 'Me' },
      preferences: { nickname: 'Me' },
    });
    expect(rpc.channelPreferences(f.group.id)).toMatchObject({
      pinned: true,
      hidden: true,
      muted: true,
      nickname: 'Me',
    });
  });
  it.each(['muted', 'nickname'] as const)(
    'permits a durable beforeEffect transaction before the %s write',
    async (field) => {
      const f = await fixture();
      const before = f.owner.snapshot(f.group.id);
      const effect = vi.fn(() => {
        f.core.channels.setHumanDefaultName('Durable effect marker');
      });
      const patch = field === 'muted' ? { muted: true } : { nickname: 'Me' };
      await expect(
        f.owner.update(
          { channelId: f.group.id, expectedState: before.stateFingerprint, patch },
          undefined,
          effect,
        ),
      ).resolves.toMatchObject(patch);
      expect(effect).toHaveBeenCalledTimes(1);
      expect(f.core.channels.humanIdentity().displayName).toBe('Durable effect marker');
      expect(f.core.operationalDatabase.mode).toBe('ready');
    },
  );

  it.each(['muted', 'nickname'] as const)(
    'rechecks %s CAS inside the write after beforeEffect',
    async (field) => {
      const f = await fixture();
      const before = f.owner.snapshot(f.group.id);
      await expect(
        f.owner.update(
          {
            channelId: f.group.id,
            expectedState: before.stateFingerprint,
            patch: field === 'muted' ? { muted: true } : { nickname: 'Old' },
          },
          undefined,
          () => {
            f.core.channels.setHumanNickname(f.group.id, 'Changed meanwhile');
          },
        ),
      ).rejects.toMatchObject({ code: 'stale-channel-preferences' });
      expect(f.owner.snapshot(f.group.id)).toMatchObject({
        nickname: 'Changed meanwhile',
        muted: false,
      });
    },
  );
  it.each(['muted', 'nickname'] as const)(
    'refuses %s after Human access changes during effect tracking',
    async (field) => {
      const f = await fixture();
      const before = f.owner.snapshot(f.group.id);
      await expect(
        f.owner.update(
          {
            channelId: f.group.id,
            expectedState: before.stateFingerprint,
            patch: field === 'muted' ? { muted: true } : { nickname: 'Me' },
          },
          undefined,
          () => {
            f.database.transaction((db) =>
              db
                .prepare(
                  "UPDATE channel_human_members SET left_at=? WHERE channel_id=? AND human_id='local-human'",
                )
                .run(new Date().toISOString(), f.group.id),
            );
          },
        ),
      ).rejects.toMatchObject({ code: 'channel-access-denied' });
      expect(f.core.roster.snapshot().muted).toEqual([]);
      expect(
        f.database.read((db) =>
          db
            .prepare('SELECT nickname FROM channel_human_nicknames WHERE channel_id=?')
            .all(f.group.id),
        ),
      ).toEqual([]);
    },
  );
});

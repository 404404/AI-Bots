import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTobChannelPreferencesOperations } from '../src/tob/cli-channel-preferences.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const root = createTempRoot('tob-prefs-');
  const core = createCore({ dshHome: root });
  await core.roster.attach(createFakeRosterDomain().facility);
  cleanup.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });
  expect(core.registry.create({ slug: 'writer', displayName: 'Writer' }).ok).toBe(true);
  const dm = core.channels.getOrCreateDm('writer', 'Writer');
  if (!dm) throw new Error('Expected Human DM');
  const group = core.channels.createGroup({ name: 'Project', members: ['writer'] });
  const prepare = createTobChannelPreferencesOperations(core.channelPreferences);
  const snapshot = (id = group.id) => core.channelPreferences.snapshot(id);
  const input = (patch: Record<string, unknown>, id = group.id) => ({
    channelId: id,
    expectedState: snapshot(id).stateFingerprint,
    ...patch,
  });
  return { core, dm, group, prepare, snapshot, input };
}
async function broker(f: Awaited<ReturnType<typeof fixture>>, approve: () => Promise<void>) {
  const effect = vi.fn();
  const transport = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize() {},
    approve,
    beforeWrite: effect,
    prepareOperation: f.prepare,
    readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
    writeSetting: async () => {
      throw new Error('Unexpected global setting');
    },
  });
  cleanup.push(() => transport.close());
  const invoke = async (command: string, args: Record<string, unknown>) => {
    const response = await fetch(transport.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + transport.token, 'content-type': 'application/json' },
      body: JSON.stringify({ command, args }),
    });
    return response.json();
  };
  return { invoke, effect };
}

describe('Tob personal Channel preferences', () => {
  it('reads DM and Group state without approval, including hidden Channels', async () => {
    const f = await fixture();
    await f.core.channelPreferences.update({ channelId: f.dm.id, patch: { hidden: true } });
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    expect(await b.invoke('channel-preferences', { channelId: f.dm.id })).toMatchObject({
      ok: true,
      value: { hidden: true },
    });
    expect(await b.invoke('channel-preferences', { channelId: f.group.id })).toMatchObject({
      ok: true,
      value: { hidden: false },
    });
    expect(approve).not.toHaveBeenCalled();
    expect(b.effect).not.toHaveBeenCalled();
  });
  it('reviews immutable old and new values and reads back all four settings in DM and Group', async () => {
    const f = await fixture();
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    for (const id of [f.group.id, f.dm.id]) {
      for (const [command, patch] of [
        ['channel-mute', { muted: true }],
        ['channel-pin', { pinned: true }],
        ['channel-hide', { hidden: true }],
        ['channel-human-name-set', { nickname: 'Project lead' }],
      ] as const) {
        const input = f.input(patch, id);
        const prepared = (await f.prepare(command, input))!;
        expect(prepared.proposal).toMatchObject({ target: id, patch: { changes: patch } });
        expect(Object.isFrozen(prepared.proposal!.patch)).toBe(true);
        expect(await b.invoke(command, input)).toMatchObject({ ok: true, value: patch });
      }
      expect(f.snapshot(id)).toMatchObject({
        muted: true,
        pinned: true,
        hidden: true,
        nickname: 'Project lead',
      });
      expect(await b.invoke('channel-hide', f.input({ hidden: false }, id))).toMatchObject({
        ok: true,
        value: { hidden: false, muted: true, pinned: true },
      });
      expect(
        await b.invoke('channel-human-name-set', f.input({ nickname: null }, id)),
      ).toMatchObject({ ok: true, value: { nickname: null } });
    }
    expect(approve).toHaveBeenCalledTimes(12);
    expect(b.effect).toHaveBeenCalledTimes(12);
  });
  it('preserves state on denied approval and refuses stale Human edits before starting the effect', async () => {
    const f = await fixture();
    const denied = await broker(f, async () => {
      throw new TobError('approval-denied');
    });
    expect(await denied.invoke('channel-mute', f.input({ muted: true }))).toMatchObject({
      ok: false,
      error: { code: 'approval-denied' },
    });
    expect(f.snapshot().muted).toBe(false);
    expect(denied.effect).not.toHaveBeenCalled();
    const stale = await broker(f, async () => {
      await f.core.channelPreferences.update({ channelId: f.group.id, patch: { pinned: true } });
    });
    expect(await stale.invoke('channel-mute', f.input({ muted: true }))).toMatchObject({
      ok: false,
      error: { code: 'stale-channel-preferences' },
    });
    expect(f.snapshot()).toMatchObject({ pinned: true, muted: false });
    expect(stale.effect).not.toHaveBeenCalled();
  });
  it('rechecks source authority at queued write and preserves unrelated Channel preferences', async () => {
    const f = await fixture();
    const input = f.input({ pinned: true });
    const prepared = (await f.prepare('channel-pin', input))!;
    await f.core.channelPreferences.update({ channelId: f.dm.id, patch: { hidden: true } });
    const before = vi.fn();
    await expect(
      prepared.run(() => {
        throw new TobError('human-dm-required');
      }, before),
    ).rejects.toThrow('human-dm-required');
    expect(before).not.toHaveBeenCalled();
    await prepared.run(() => {}, before);
    expect(f.snapshot()).toMatchObject({ pinned: true });
    expect(f.snapshot(f.dm.id)).toMatchObject({ hidden: true, pinned: false });
  });
  it('rejects absent fingerprints, extra target fields and invalid nickname payloads', async () => {
    const f = await fixture();
    for (const input of [
      { channelId: f.group.id, muted: true },
      f.input({ muted: true, humanId: 'another' }),
      f.input({ muted: 'true' }),
    ])
      expect(() => f.prepare('channel-mute', input)).toThrow('invalid-input');
    for (const nickname of ['', 'x\ny', 'x'.repeat(129), true, undefined])
      expect(() => f.prepare('channel-human-name-set', f.input({ nickname }))).toThrow(
        'invalid-input',
      );
    expect(f.prepare('not-a-command', {})).toBeUndefined();
  });
});

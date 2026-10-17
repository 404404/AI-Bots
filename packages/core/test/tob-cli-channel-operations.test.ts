import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTobChannelOperations } from '../src/tob/cli-channel-operations.js';
import { startTobCliBroker } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
function fixture() {
  const root = createTempRoot('tob-channel-cli-');
  let autoAccept = false;
  const core = createCore({ dshHome: root, autoAcceptGroupInvitations: () => autoAccept });
  cleanup.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
    rmSync(root, { recursive: true, force: true });
  });
  for (const slug of ['research', 'writer'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const prepare = createTobChannelOperations({
    management: core.channelManagement,
    channels: core.channels,
    registry: core.registry,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  const run = async (
    command: string,
    args: Record<string, unknown>,
    guard = () => {},
    before = () => {},
  ) => {
    const prepared = await prepare(command, args);
    if (!prepared) throw new Error('Unexpected missing operation');
    return prepared.run(guard, before);
  };
  return {
    core,
    prepare,
    run,
    setAutoAccept(value: boolean) {
      autoAccept = value;
    },
  };
}
const createArgs = () => ({
  name: 'Project',
  members: ['research'],
  operationKey: 'create-project-01',
});
function inviteArgs(f: ReturnType<typeof fixture>, channelId: string) {
  return {
    channelId,
    botSlug: 'writer',
    expectedChannel: f.core.channelManagement.snapshot(channelId).channelFingerprint,
    operationKey: 'invite-writer-01',
  };
}
async function broker(f: ReturnType<typeof fixture>, approve: () => Promise<void>) {
  const effect = vi.fn();
  const transport = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize() {},
    approve,
    beforeWrite: effect,
    prepareOperation: f.prepare,
    readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
    writeSetting: async () => {
      throw new Error('Unexpected setting mutation');
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

describe('scoped Channel operations through the canonical owner', () => {
  it('rejects denied or revoked source authority before creating a Group or receipt', async () => {
    const f = fixture();
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const prepared = (await f.prepare('group-create', createArgs()))!;
    const effect = vi.fn();
    expect(() =>
      prepared.run(() => {
        throw new TobError('human-dm-required');
      }, effect),
    ).toThrow('human-dm-required');
    const b = await broker(f, async () => {
      throw new TobError('approval-denied');
    });
    expect(await b.invoke('group-create', createArgs())).toMatchObject({
      ok: false,
      error: { code: 'approval-denied' },
    });
    expect(effect).not.toHaveBeenCalled();
    expect(b.effect).not.toHaveBeenCalled();
    expect(f.core.channels.list()).toHaveLength(0);
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
  });
  it('reviews explicit initial members, creates once and replays the same receipt without another approval', async () => {
    const f = fixture();
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    const input = createArgs();
    const prepared = (await f.prepare('group-create', input))!;
    expect(prepared.proposal).toMatchObject({
      patch: { initialMembership: 'join-directly', members: [{ slug: 'research' }] },
    });
    const created = await b.invoke('group-create', input);
    expect(created).toMatchObject({
      ok: true,
      value: { channel: { members: ['research'] }, receipt: { status: 'completed' } },
    });
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(await b.invoke('group-create', input)).toEqual(created);
    expect(approve).toHaveBeenCalledOnce();
    expect(b.effect).toHaveBeenCalledOnce();
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
    expect(f.core.channels.list()).toHaveLength(1);
  });
  it('preserves pending invitations, canonical acceptance, and no duplicate invite on response-loss retry', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const input = inviteArgs(f, group.id);
    const prepared = (await f.prepare('group-invite', input))!;
    expect(prepared.proposal).toMatchObject({
      previousValue: { invitationPolicy: { autoAccept: false } },
      patch: { invite: { slug: 'writer' } },
    });
    const invite = f.core.channelManagement.invite.bind(f.core.channelManagement);
    vi.spyOn(f.core.channelManagement, 'invite').mockImplementationOnce((...args) => {
      invite(...args);
      throw new Error('private lost response diagnostic');
    });
    const approve = vi.fn(async () => {});
    const b = await broker(f, approve);
    expect(await b.invoke('group-invite', input)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    });
    const replay = await b.invoke('group-invite', input);
    expect(replay).toMatchObject({
      ok: true,
      value: {
        channel: { members: ['research'] },
        invitation: { status: 'pending' },
        receipt: { status: 'completed' },
      },
    });
    expect(approve).toHaveBeenCalledOnce();
    expect(b.effect).toHaveBeenCalledOnce();
    const invitation = f.core.channels.get(group.id)!.invitations![0]!;
    expect(f.core.channels.get(group.id)!.invitations).toHaveLength(1);
    f.core.channels.respondToGroupInvite({
      invitationId: invitation.id,
      targetBotSlug: 'writer',
      targetBotCreatedAt: f.core.registry.get('writer')!.createdAt,
      accept: true,
    });
    expect(await f.run('channel', { channelId: group.id })).toMatchObject({
      channel: { members: ['research', 'writer'], invitations: [{ status: 'accepted' }] },
    });
  });
  it('rechecks Channel state, invitation policy and Bot identity after review', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const initial = inviteArgs(f, group.id);
    const changedPolicy = (await f.prepare('group-invite', initial))!;
    f.setAutoAccept(true);
    const effect = vi.fn();
    expect(() => changedPolicy.run(() => {}, effect)).toThrow('stale-channel');
    f.setAutoAccept(false);
    const changedBot = (await f.prepare('group-invite', initial))!;
    f.core.registry.update('writer', { displayName: 'Renamed after review' });
    expect(() => changedBot.run(() => {}, effect)).toThrow('stale-profile');
    const changedGroup = (await f.prepare('group-invite', initial))!;
    f.core.channels.rename(group.id, 'Renamed group');
    expect(() => changedGroup.run(() => {}, effect)).toThrow('stale-channel');
    expect(effect).not.toHaveBeenCalled();
    expect(f.core.channels.get(group.id)?.invitations ?? []).toHaveLength(0);
  });
  it('does not invalidate reviewed management for unrelated messages and reports automatic acceptance honestly', async () => {
    const f = fixture();
    f.setAutoAccept(true);
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    const input = inviteArgs(f, group.id);
    const prepared = (await f.prepare('group-invite', input))!;
    expect(prepared.proposal).toMatchObject({ patch: { invitationPolicy: { autoAccept: true } } });
    input.botSlug = 'research';
    await f.core.channels.appendMessage(group.id, {
      id: 'unrelated-human-message',
      at: '2099-01-01T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Unrelated discussion, not a management instruction.',
    });
    expect(f.core.channelManagement.snapshot(group.id).channelFingerprint).toBe(
      input.expectedChannel,
    );
    const effect = vi.fn();
    expect(await prepared.run(() => {}, effect)).toMatchObject({
      channel: { members: ['research', 'writer'] },
      invitation: { status: 'accepted', respondedBy: 'profile-policy' },
    });
    expect(effect).toHaveBeenCalledOnce();
  });

  it('refuses protected, archived, removed or injected targets before any effect', async () => {
    const f = fixture();
    const home = await f.core.tob.ensure();
    await expect(
      f.run('group-create', { ...createArgs(), members: [home.botSlug] }),
    ).rejects.toMatchObject({ code: 'protected-bot' });
    f.core.registry.setPaused('writer', true);
    await expect(
      f.run('group-create', { ...createArgs(), members: ['writer'] }),
    ).rejects.toMatchObject({ code: 'archived-bot' });
    await expect(
      f.run('group-create', { ...createArgs(), members: ['missing'] }),
    ).rejects.toMatchObject({ code: 'unknown-bot' });
    await expect(
      f.run('group-create', { ...createArgs(), ownerBotSlug: 'research' }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(f.core.channels.list().filter((channel) => channel.type === 'group')).toHaveLength(0);
  });
  it('returns bounded metadata without messages, images or private Bot DMs', async () => {
    const f = fixture();
    const group = f.core.channels.createGroup({ name: 'Project', members: ['research'] });
    f.core.channels.getOrCreateDm('research');
    const privateDm = f.core.channels.getOrCreateBotDm('research', 'writer', 'private');
    const page = (await f.run('channels', { limit: 1 })) as {
      channels: Array<{ id: string }>;
      nextCursor?: string;
    };
    expect(page.channels).toHaveLength(1);
    expect(page.nextCursor).toBe(page.channels[0]!.id);
    const next = (await f.run('channels', { limit: 1, cursor: page.nextCursor })) as {
      channels: Array<{ id: string }>;
    };
    expect(next.channels).toHaveLength(1);
    expect([...page.channels, ...next.channels].map((channel) => channel.id)).not.toContain(
      privateDm?.id,
    );
    expect(JSON.stringify(page)).not.toContain('latestMessage');
    const detail = await f.run('channel', { channelId: group.id });
    expect(detail).toMatchObject({
      channelFingerprint: f.core.channelManagement.snapshot(group.id).channelFingerprint,
    });
  });
});

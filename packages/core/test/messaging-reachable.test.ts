import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(platform: 'feishu' | 'discord' | 'slack' = 'feishu') {
  const fingerprint = 'a'.repeat(64);
  const posts: string[] = [];
  const transport: DshImOutboundService = {
    contractVersion: 1,
    reachableConversationVersion: 1,
    listBots: async () => [{ botId: 'qa', channel: platform }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'qa',
      channel: platform,
      connected: true,
      account: { fingerprint },
      capabilities: ['proactive-text-checked', 'reachable-conversations-checked'],
    }),
    sendChecked: async () => {
      throw new Error('No saved target is allowed');
    },
    listReachableConversations: async () => ({
      version: 1,
      conversations: [{ id: 'oc_new', kind: 'group', name: 'New QA group' }],
      hasMore: false,
    }),
    postConversationChecked: async (_app, conversationId, text, options) => {
      expect(options.beforeSend()).toBe(true);
      posts.push(text);
      return { sent: true, receipt: { version: 1, messageId: 'om_first', conversationId } };
    },
  };
  const home = createTempRoot('reachable-');
  const core = createCore({ dshHome: home });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const provider = createDshImProvider(transport, platform)!;
  core.externalMessaging.register(provider);
  const binding = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: 'qa',
    fingerprint,
  });
  return { core, binding, transport, posts, home };
}

it('the default quota is a rolling sixty posts per Binding and expires after an hour', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const began = new Date('2026-10-13T00:00:00.000Z');
  vi.setSystemTime(began);
  const { core, binding, posts } = await fixture();
  for (let index = 0; index < 60; index++) {
    expect(
      (
        await core.externalMessaging.postConversation(
          'ada',
          binding.id,
          'oc_new',
          `quota-post-${index}`,
          `Report ${index}`,
        )
      ).state,
    ).toBe('provider-accepted');
  }
  const denied = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'quota-denied',
    'Never',
  );
  expect(denied).toMatchObject({ state: 'failed', reason: 'post-rate-limited' });
  expect(posts).toHaveLength(60);
  vi.setSystemTime(new Date(began.getTime() + 3600001));
  expect(
    (
      await core.externalMessaging.postConversation(
        'ada',
        binding.id,
        'oc_new',
        'quota-expired',
        'Next hour',
      )
    ).state,
  ).toBe('provider-accepted');
  expect(posts).toHaveLength(61);
});

it('a pending native attempt reserves the last quota slot before another request can send', async () => {
  const { core, binding, transport, posts } = await fixture();
  await core.externalMessaging.setPostLimit('ada', binding.id, binding.revision, 1);
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  transport.postConversationChecked = async (_app, conversationId, text, options) => {
    enter();
    await gate;
    expect(options.beforeSend()).toBe(true);
    posts.push(text);
    return { sent: true, receipt: { version: 1, messageId: 'om_pending', conversationId } };
  };
  const first = core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'concurrent-first',
    'First',
  );
  await entered;
  try {
    expect(
      await core.externalMessaging.postConversation(
        'ada',
        binding.id,
        'oc_new',
        'concurrent-second',
        'Never',
      ),
    ).toMatchObject({ state: 'failed', reason: 'post-rate-limited' });
    expect(posts).toEqual([]);
  } finally {
    release();
  }
  expect((await first).state).toBe('provider-accepted');
  expect(posts).toEqual(['First']);
});

it('muting a conversation controls reception and still permits an explicit proactive post', async () => {
  const { core, binding, posts } = await fixture();
  await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'before-mute',
    'First',
  );
  const grant = (await core.externalMessaging.snapshot('ada')).grants[0]!;
  await core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  expect(
    (
      await core.externalMessaging.postConversation(
        'ada',
        binding.id,
        'oc_new',
        'after-mute',
        'Explicit report',
      )
    ).state,
  ).toBe('provider-accepted');
  expect((await core.externalMessaging.snapshot('ada')).grants[0]?.muted).toBe(true);
  expect(posts).toEqual(['First', 'Explicit report']);
});

it.each(['feishu', 'discord', 'slack'] as const)(
  '%s bound app posts to a reachable group without saved targets or an inbound Source Event',
  async (platform) => {
    const { core, binding, transport, posts } = await fixture(platform);
    const page = await core.externalMessaging.reachable('ada', binding.id);
    expect(page.conversations).toEqual([{ id: 'oc_new', kind: 'group', name: 'New QA group' }]);
    const result = await core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'first-request',
      'First report',
    );
    expect(result.state).toBe('provider-accepted');
    expect(result.sourceEventId).toBeUndefined();
    expect(result.receipt?.messageId).toBe('om_first');
    const snapshot = await core.externalMessaging.snapshot('ada');
    expect(snapshot.grants).toHaveLength(1);
    expect(snapshot.grants[0]?.origin).toBe('implicit');
    expect(snapshot.grants[0]?.receiveScope?.conversationId).toBe('oc_new');
    await core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'first-request',
      'First report',
    );
    expect(posts).toEqual(['First report']);
    await core.externalMessaging.setPostLimit('ada', binding.id, binding.revision, 1);
    const denied = await core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'limited-request',
      'Second report',
    );
    expect(denied.state).toBe('failed');
    expect(denied.reason).toBe('post-rate-limited');
    expect(posts).toEqual(['First report']);
    const updated = (await core.externalMessaging.snapshot('ada')).identities!.find(
      (value) => value.id === binding.id,
    )!;
    await core.externalMessaging.setPostLimit('ada', binding.id, updated.revision, null);
    expect(
      (
        await core.externalMessaging.postConversation(
          'ada',
          binding.id,
          'oc_new',
          'unlimited-request',
          'Third report',
        )
      ).state,
    ).toBe('provider-accepted');
    expect(posts).toEqual(['First report', 'Third report']);
    transport.postConversationChecked = async () => {
      throw Object.assign(new Error('Private provider read error'), {
        code: 'send-preflight-unavailable',
      });
    };
    const preflight = await core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'preflight-request',
      'Read must finish before sending',
    );
    expect(preflight.state).toBe('failed');
    expect(preflight.reason).toBe('send-preflight-unavailable');
  },
);

it.each(['block', 'unbind'] as const)(
  'a %s during native preflight fences the unstarted post as grant-revoked',
  async (kind) => {
    const { core, binding, transport, posts } = await fixture();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.postConversationChecked = async (_app, conversationId, text, options) => {
      enter();
      await gate;
      if (options.beforeSend() !== true)
        throw Object.assign(new Error('Native final fence refused'), {
          code: 'send-permission-denied',
        });
      posts.push(text);
      return { sent: true, receipt: { version: 1, messageId: 'om_late', conversationId } };
    };
    const pending = core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'revoked-request',
      'Must not send',
    );
    await entered;
    if (kind === 'block') {
      const grant = (await core.externalMessaging.snapshot('ada')).grants[0]!;
      await core.externalMessaging.conversation('ada', {
        kind: 'block',
        grantId: grant.id,
        expectedRevision: grant.revision,
      });
    } else {
      await core.externalMessaging.identity('ada', {
        kind: 'unbind',
        id: binding.id,
        expectedRevision: binding.revision,
      });
    }
    release();
    const result = await pending;
    expect(result.state).toBe('grant-revoked');
    expect(result.reason).toBe('grant-revoked');
    expect(posts).toEqual([]);
  },
);

it('a reachable group already represented by a saved entry uses native conversation posting without a duplicate entry', async () => {
  const { core, binding, transport, posts } = await fixture();
  transport.listTargets = async () => [
    { targetId: 'saved', kind: 'group', name: 'Saved QA group', route: { chatId: 'oc_new' } },
  ];
  const targets = await core.externalMessaging.targets('dsh-im/feishu', 'qa');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'qa',
    targetRef: 'saved',
    fingerprint: binding.fingerprint,
    targetDigest: targets[0]!.digest,
  });
  const result = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'existing-request',
    'Same native group',
  );
  expect(result.state).toBe('provider-accepted');
  expect(result.grantId).toBe(grant.id);
  expect((await core.externalMessaging.snapshot('ada')).grants).toHaveLength(1);
  expect(posts).toEqual(['Same native group']);
});

it('an unknown native post keeps its stable request identity across restart and is never replayed', async () => {
  const { core, binding, transport, home } = await fixture();
  let effects = 0;
  transport.postConversationChecked = async (_app, _conversationId, _text, options) => {
    expect(options.beforeSend()).toBe(true);
    effects++;
    return {
      sent: true,
      receipt: { version: 1, messageId: 'om_unqualified', conversationId: 'oc_other' },
    };
  };
  const first = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'unknown-request',
    'Do not replay',
  );
  expect(first.state).toBe('unknown-outcome');
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.splice(cores.indexOf(core), 1);
  const resumed = createCore({ dshHome: home });
  cores.push(resumed);
  resumed.externalMessaging.register(createDshImProvider(transport)!);
  const duplicate = await resumed.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'unknown-request',
    'Do not replay',
  );
  expect(duplicate.id).toBe(first.id);
  expect(duplicate.state).toBe('unknown-outcome');
  expect(effects).toBe(1);
});

it('an older Provider explains unavailable reachability and preserves checked saved-target posting', async () => {
  const { core, binding, transport, posts } = await fixture();
  delete transport.reachableConversationVersion;
  transport.receiptVersion = 1;
  transport.describeBot = async () => ({
    version: 1,
    botId: 'qa',
    channel: 'feishu',
    connected: true,
    account: { fingerprint: binding.fingerprint },
    capabilities: ['proactive-text-checked', 'proactive-receipt-checked'],
  });
  transport.listTargets = async () => [
    { targetId: 'saved', kind: 'group', route: { chatId: 'oc_new' } },
  ];
  transport.sendChecked = async (_app, target, text) => {
    expect(target).toBe('saved');
    posts.push(text);
    return {
      sent: true,
      receipt: { version: 1, messageId: 'om_legacy', conversationId: 'oc_new' },
    };
  };
  core.externalMessaging.register(createDshImProvider(transport)!);
  await expect(core.externalMessaging.reachable('ada', binding.id)).rejects.toMatchObject({
    code: 'capability-unavailable',
  });
  const targets = await core.externalMessaging.targets('dsh-im/feishu', 'qa');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'qa',
    targetRef: 'saved',
    fingerprint: binding.fingerprint,
    targetDigest: targets[0]!.digest,
  });
  const result = await core.externalMessaging.post(
    'ada',
    grant.id,
    'legacy-request',
    'Saved fallback',
  );
  expect(result.state).toBe('provider-accepted');
  expect(posts).toEqual(['Saved fallback']);
});

it('adding native group discovery preserves checked posting to an existing restricted saved group', async () => {
  const { core, binding, transport, posts } = await fixture();
  transport.receiptVersion = 1;
  transport.describeBot = async () => ({
    version: 1,
    botId: 'qa',
    channel: 'feishu',
    connected: true,
    account: { fingerprint: binding.fingerprint },
    capabilities: [
      'proactive-text-checked',
      'proactive-receipt-checked',
      'reachable-conversations-checked',
    ],
  });
  transport.listReachableConversations = async () => ({
    version: 1,
    conversations: [],
    hasMore: false,
  });
  transport.listTargets = async () => [
    { targetId: 'saved', kind: 'group', route: { chatId: 'oc_restricted' } },
  ];
  let nativeEffects = 0;
  transport.postConversationChecked = async () => {
    nativeEffects++;
    throw Object.assign(new Error('Restricted native group'), { code: 'target-rejected' });
  };
  transport.sendChecked = async (_app, target, text) => {
    expect(target).toBe('saved');
    posts.push(text);
    return {
      sent: true,
      receipt: { version: 1, messageId: 'om_saved', conversationId: 'oc_restricted' },
    };
  };
  core.externalMessaging.register(createDshImProvider(transport)!);
  const targets = await core.externalMessaging.targets('dsh-im/feishu', 'qa');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'qa',
    targetRef: 'saved',
    fingerprint: binding.fingerprint,
    targetDigest: targets[0]!.digest,
  });
  const result = await core.externalMessaging.post(
    'ada',
    grant.id,
    'saved-with-new-provider',
    'Existing saved report',
  );
  expect(result.state).toBe('provider-accepted');
  expect(result.receipt?.messageId).toBe('om_saved');
  expect(posts).toEqual(['Existing saved report']);
  expect(nativeEffects).toBe(0);
});

it.each(['service-version', 'account-capability'] as const)(
  'a received-group block fences its separate saved Grant through %s',
  async (fenceContract) => {
    const { core, binding, transport } = await fixture();
    await core.externalMessaging.postConversation(
      'ada',
      binding.id,
      'oc_new',
      'block-setup-request',
      'First report',
    );
    const received = (await core.externalMessaging.snapshot('ada')).grants[0]!;
    if (fenceContract === 'service-version') transport.postFenceVersion = 1;
    transport.receiptVersion = 1;
    transport.describeBot = async () => ({
      version: 1,
      botId: 'qa',
      channel: 'feishu',
      connected: true,
      account: { fingerprint: binding.fingerprint },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'reachable-conversations-checked',
        ...(fenceContract === 'account-capability' ? ['proactive-fence-checked'] : []),
      ],
    });
    transport.listTargets = async () => [
      { targetId: 'saved', kind: 'group', route: { chatId: 'oc_new' } },
    ];
    core.externalMessaging.register(createDshImProvider(transport)!);
    const targets = await core.externalMessaging.targets('dsh-im/feishu', 'qa');
    const saved = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      accountRef: 'qa',
      targetRef: 'saved',
      fingerprint: binding.fingerprint,
      targetDigest: targets[0]!.digest,
    });
    expect(saved.id).not.toBe(received.id);
    let effects = 0;
    transport.sendChecked = async (_app, _target, _text, options) => {
      await core.externalMessaging.conversation('ada', {
        kind: 'block',
        grantId: received.id,
        expectedRevision: received.revision,
      });
      if (options.beforeSend?.() !== true)
        throw Object.assign(new Error('Native final fence refused'), {
          code: 'send-permission-denied',
        });
      effects++;
      return {
        sent: true,
        receipt: { version: 1, messageId: 'om_forbidden', conversationId: 'oc_new' },
      };
    };
    const result = await core.externalMessaging.post(
      'ada',
      saved.id,
      'blocked-saved',
      'Must not send',
    );
    expect(result.state).toBe('grant-revoked');
    expect(result.reason).toBe('grant-revoked');
    expect(effects).toBe(0);
  },
);

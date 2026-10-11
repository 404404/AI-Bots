import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createChannelStore } from '../src/channels/store.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { registerBridge } from '../src/bridge/rpc.js';
import type { BridgeMethods } from '../src/bridge/methods.js';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const declaration = {
  account: 'synthetic',
  purpose: 'Check the controlled service',
  fields: [
    { id: 'api_key', label: 'API key', required: true },
    { id: 'api_secret', label: 'API secret', required: true },
    { id: 'private_url', label: 'Private URL', required: false },
  ],
};
const values = {
  api_key: 'SYNTHETIC KEY + / canary',
  api_secret: '  SYNTHETIC secret\nkeep whitespace  ',
  private_url: 'http://127.0.0.1/private?canary=synthetic',
};

async function fixture(qualified = true, requestTimeoutMs?: number) {
  const root = createTempRoot('bh-private-input-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  disposers.push(() => fiber.dispose());
  await fiber.await();
  const credentials = ctx.credentials;
  const registry = createTestRegistry({ rootDir: root });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  registry.create({ slug: 'bea', displayName: 'Bea' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  channels.getOrCreateDm('ada', 'Ada');
  channels.getOrCreateDm('bea', 'Bea');
  const ownership = createTestOwnership({
    'ada-session': { botSlug: 'ada', rootRole: 'orchestrator' },
    'bea-session': { botSlug: 'bea', rootRole: 'orchestrator' },
  });
  const agent = { session: { id: 'ada-session' } } as Agent;
  const bea = { session: { id: 'bea-session' } } as Agent;
  let live = true;
  const deps = {
    channels,
    ownership,
    registry,
    credentials: () => credentials,
    isLive: (candidate: Agent) => live && (candidate === agent || candidate === bea),
    qualified: async () => qualified,
    log: vi.fn(),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
  };
  const owner = new PrivateInputs(deps);
  return {
    owner,
    agent,
    bea,
    channels,
    credentials,
    ctx,
    replacement: () => new PrivateInputs(deps),
    close: async () => {
      await owner.close();
      registryDatabase(root).close();
    },
    stop: () => {
      live = false;
    },
  };
}

describe('private input native authority and reference contract', () => {
  it('saves all confidential fields atomically, returns references only, and refuses cross-Bot/account or fabricated actor use', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(await f.owner.submit(false, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await f.owner.submit(true, { channelId: 'dm-bea', messageId, values })).toBe(false);
    expect(
      await f.owner.submit(true, { channelId: 'dm-ada', messageId, values, actor: 'Owner' }),
    ).toBe(false);
    expect(
      await f.owner.submit(true, {
        channelId: 'dm-ada',
        messageId,
        values: { ...values, injected: 'unexpected' },
      }),
    ).toBe(false);
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(true);
    const result = await wait;
    expect(result.status).toBe('configured');
    const visible = JSON.stringify({ result, messages: f.channels.readMessages('dm-ada') });
    for (const value of Object.values(values)) expect(visible).not.toContain(value);
    expect(
      await f.owner.consume(f.agent, 'synthetic', result.references, async (resolved) => resolved),
    ).toEqual(values);
    const consume = vi.fn(async () => 'never');
    await expect(f.owner.consume(f.bea, 'synthetic', result.references, consume)).rejects.toThrow(
      /grant is unavailable/,
    );
    await expect(
      f.owner.consume(f.agent, 'other-account', result.references, consume),
    ).rejects.toThrow(/grant is unavailable/);
    await expect(
      f.owner.consume(
        { session: { id: 'ada-session' } } as Agent,
        'synthetic',
        result.references,
        consume,
      ),
    ).rejects.toThrow(/unavailable/);
    expect(consume).not.toHaveBeenCalled();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await f.credentials.listRecords()).toHaveLength(1);
    await f.close();
  });

  it('refuses unsupported consumption before collecting values and rejects a stopped request', async () => {
    const unsupported = await fixture(false);
    await expect(
      unsupported.owner.ask(unsupported.agent, declaration, new AbortController().signal),
    ).rejects.toThrow(/unavailable/);
    expect(unsupported.channels.readMessages('dm-ada')).toHaveLength(0);
    await unsupported.close();
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    f.stop();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect((await wait).status).toBe('expired');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await f.close();
  });

  it('checks the actual Remote invocation peer rather than a Client-supplied Owner', async () => {
    const f = await fixture();
    const operator = {};
    f.ctx.provide('connection', { operator });
    const remote = registerBridge(f.ctx, {} as BridgeMethods, f.owner);
    expect(() => remote.privateInputStatus('dm-ada', 'missing')).toThrow(/authenticated Owner/);
    const forged = Object.create(remote) as typeof remote;
    Object.defineProperty(forged, 'ctx', { value: f.ctx.extend({ invocation: { peer: {} } }) });
    expect(() => forged.privateInputStatus('dm-ada', 'missing')).toThrow(/authenticated Owner/);
    await f.close();
  });

  it('settles concurrent cards independently and accepts only one of duplicate Owner submissions', async () => {
    const f = await fixture();
    try {
      const a = f.owner.ask(f.agent, declaration, new AbortController().signal);
      const b = f.owner.ask(
        f.bea,
        { ...declaration, account: 'other' },
        new AbortController().signal,
      );
      await vi.waitFor(() => expect(f.channels.readMessages('dm-bea')).toHaveLength(1));
      const aId = f.channels.readMessages('dm-ada')[0]!.id;
      const bId = f.channels.readMessages('dm-bea')[0]!.id;
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: bId, values })).toBe(
        false,
      );
      const accepted = await Promise.all([
        f.owner.submit(true, { channelId: 'dm-ada', messageId: aId, values }),
        f.owner.submit(true, { channelId: 'dm-ada', messageId: aId, values }),
      ]);
      expect(accepted.sort()).toEqual([false, true]);
      expect((await a).status).toBe('configured');
      expect(f.owner.activeMessageIds()).toEqual([bId]);
      expect(await f.owner.cancel(true, 'dm-bea', bId)).toBe(true);
      expect((await b).status).toBe('cancelled');
      expect(f.owner.activeMessageIds()).toEqual([]);
      expect(await f.credentials.listRecords()).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it.each(['cancel', 'abort', 'stop'] as const)(
    'prevents a late grant when %s wins during credential write',
    async (action) => {
      const f = await fixture();
      const controller = new AbortController();
      const wait = f.owner.ask(f.agent, declaration, controller.signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      let release!: () => void;
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const modify = f.credentials.modifyRecord.bind(f.credentials);
      vi.spyOn(f.credentials, 'modifyRecord').mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return modify(...args);
      });
      const submit = f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
      await entry;
      const cancel = action === 'cancel' ? f.owner.cancel(true, 'dm-ada', messageId) : undefined;
      if (action === 'abort') controller.abort();
      if (action === 'stop') f.stop();
      release();
      expect(await submit).toBe(false);
      if (cancel !== undefined) expect(await cancel).toBe(true);
      const state = action === 'cancel' ? 'cancelled' : 'expired';
      expect((await wait).status).toBe(state);
      expect(f.owner.status('dm-ada', messageId)).toBe(state);
      expect(
        f.channels.readMessages('dm-ada').filter((m) => m.privateInputResolution),
      ).toHaveLength(1);
      expect(await f.credentials.listRecords()).toHaveLength(0);
      await f.close();
    },
  );

  it('expires a committed card at its Host deadline without an Owner poll', async () => {
    const f = await fixture(true, 200);
    try {
      const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const card = f.channels.readMessages('dm-ada')[0]!;
      expect(card.privateInputRequest?.expiresAt).toBeDefined();
      expect((await wait).status).toBe('expired');
      expect(f.owner.status('dm-ada', card.id)).toBe('expired');
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: card.id, values })).toBe(
        false,
      );
      expect(await f.credentials.listRecords()).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it('refuses a grant when cancellation wins at the queued Channel commit boundary', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const submission = f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
    await entry;
    const cancel = f.owner.cancel(true, 'dm-ada', messageId);
    release();
    expect(await submission).toBe(false);
    expect(await cancel).toBe(true);
    expect((await wait).status).toBe('cancelled');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    expect(f.channels.readMessages('dm-ada').filter((m) => m.privateInputResolution)).toHaveLength(
      1,
    );
    await f.close();
  });

  it('drains request persistence on Host disposal before expiring the waiter', async () => {
    const f = await fixture();
    await f.owner.recover();
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await entry;
    let closed = false;
    const close = f.owner.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await close;
    expect((await wait).status).toBe('expired');
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(f.owner.status('dm-ada', messageId)).toBe('expired');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await f.close();
  });

  it('drains startup reconciliation before disposal returns', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const replacement = f.replacement();
    const recovery = replacement.recover();
    await entry;
    let closed = false;
    const close = replacement.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await Promise.all([close, recovery]);
    expect(closed).toBe(true);
    expect(f.channels.readMessages('dm-ada')).toHaveLength(2);
    await f.close();
    expect((await wait).status).toBe('expired');
  });

  it('never uses an orphan grant after a partial write failure and removes it during recovery', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    const modify = f.credentials.modifyRecord.bind(f.credentials);
    vi.spyOn(f.credentials, 'modifyRecord').mockImplementationOnce(async (...args) => {
      await modify(...args);
      throw new Error(values.api_secret);
    });
    const deletion = vi
      .spyOn(f.credentials, 'deleteRecord')
      .mockRejectedValue(new Error(values.api_key));
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await wait).toMatchObject({ status: 'expired', references: {} });
    const records = await f.credentials.listRecords();
    expect(records).toHaveLength(1);
    const grantId = records[0]!.key.split('grant-')[1]!;
    const references = Object.fromEntries(
      Object.keys(values).map((field) => [field, `private:${grantId}:${field}`]),
    );
    const run = vi.fn(async () => true);
    await expect(f.owner.consume(f.agent, 'synthetic', references, run)).rejects.toThrow(
      /grant is unavailable/,
    );
    expect(run).not.toHaveBeenCalled();
    const visible = JSON.stringify(f.channels.readMessages('dm-ada'));
    for (const value of Object.values(values)) expect(visible).not.toContain(value);
    deletion.mockRestore();
    const replacement = f.replacement();
    await replacement.recover();
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await replacement.close();
    await f.close();
  });

  it('reconciles lost live cards durably and retains configured references on replacement', async () => {
    const f = await fixture();
    const first = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const configuredId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(
      await f.owner.submit(true, { channelId: 'dm-ada', messageId: configuredId, values }),
    ).toBe(true);
    const configured = await first;
    const lost = f.owner.ask(f.bea, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-bea')).toHaveLength(1));
    const lostId = f.channels.readMessages('dm-bea')[0]!.id;
    const replacement = f.replacement();
    try {
      await replacement.recover();
      expect(replacement.status('dm-bea', lostId)).toBe('expired');
      expect(
        f.channels.message('dm-bea', 'private-resolution-' + lostId)?.privateInputResolution?.state,
      ).toBe('expired');
      expect(
        await replacement.submit(true, { channelId: 'dm-bea', messageId: lostId, values }),
      ).toBe(false);
      expect(
        await replacement.consume(
          f.agent,
          'synthetic',
          configured.references,
          async (resolved) => resolved,
        ),
      ).toEqual(values);
      expect(await f.credentials.listRecords()).toHaveLength(1);
    } finally {
      await replacement.close();
      await f.close();
      await lost;
    }
  });
});

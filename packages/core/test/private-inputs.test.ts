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

async function fixture(qualified = true) {
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
  const owner = new PrivateInputs({
    channels,
    ownership,
    registry,
    credentials: () => credentials,
    isLive: (candidate) => live && (candidate === agent || candidate === bea),
    qualified: async () => qualified,
    log: vi.fn(),
  });
  return {
    owner,
    agent,
    bea,
    channels,
    credentials,
    ctx,
    close: () => {
      owner.close();
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
    f.close();
  });

  it('refuses unsupported consumption before collecting values and rejects a stopped request', async () => {
    const unsupported = await fixture(false);
    await expect(
      unsupported.owner.ask(unsupported.agent, declaration, new AbortController().signal),
    ).rejects.toThrow(/unavailable/);
    expect(unsupported.channels.readMessages('dm-ada')).toHaveLength(0);
    unsupported.close();
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    f.stop();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect((await wait).status).toBe('cancelled');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    f.close();
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
    f.close();
  });
});

import { describe, expect, it } from 'vitest';
import {
  CloudClient,
  callbackCode,
  parseCloudQr,
  configurationChanges,
  type CloudRuntime,
} from '../src/cloud/client';
import { MOBILE_REDIRECT_URI, publicInstance } from '../src/cloud/instance-contract';
import { cloudNativeIntent } from '../src/cloud/native-intent';
const config = publicInstance({
  instanceId: 'tob-test-uat',
  environment: 'uat',
  server: 'https://tob.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'example-staging.authkit.app',
  mobileRedirectUri: MOBILE_REDIRECT_URI,
});
const token = 'header.' + btoa(JSON.stringify({ exp: 4000000000 })) + '.signature';
function fixture() {
  let storage: string | null = null;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const state = {
    drift: false,
    offline: false,
    failWrite: false,
    refreshError: 0,
    wrongState: false,
    cancelled: false,
    tokenNumber: 0,
    browserUrl: '',
    user: 'user_test',
    instanceRole: 'admin',
    onboardingError: false,
  };
  const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const rt: CloudRuntime = {
    read: async () => storage,
    write: async (value) => {
      if (state.failWrite) throw Error('private platform error');
      storage = value;
    },
    now: () => 1000000,
    random: () => 'random-verifier-or-state-43-characters-00000000',
    challenge: async () => 's256-challenge',
    authorize: async (url) => {
      state.browserUrl = url;
      return state.cancelled
        ? null
        : MOBILE_REDIRECT_URI +
            '?code=authorization-code&state=' +
            (state.wrongState ? 'wrong' : new URL(url).searchParams.get('state'));
    },
    request: async (url, init) => {
      calls.push({ url, init });
      if (state.offline) throw Error('network');
      if (url.endsWith('/.well-known/open-cloud-groups'))
        return response({
          ...config,
          auth: { ...config.auth, mobileRedirectUris: state.drift ? [] : [MOBILE_REDIRECT_URI] },
        });
      if (url === config.auth.tokenEndpoint) {
        if (
          new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token' &&
          state.refreshError
        )
          return response(
            { error: state.refreshError === 400 ? 'invalid_grant' : 'temporarily_unavailable' },
            state.refreshError,
          );
        return response({
          access_token: token,
          refresh_token: 'secret-refresh-' + ++state.tokenNumber,
        });
      }
      if (url.endsWith('/api/onboarding'))
        return state.onboardingError
          ? response({ error: { code: 'IDENTITY_UNAVAILABLE' } }, 503)
          : response({ organizationId: 'org_default' });
      if (url.endsWith('/api/me'))
        return response({
          userId: state.user,
          instanceId: config.instanceId,
          instanceRole: state.instanceRole,
        });
      if (url.endsWith('/api/auth/logout')) return response({ remoteRevoked: true });
      throw Error('unexpected request');
    },
  };
  const client = new CloudClient(rt);
  return { client, rt, calls, state, stored: () => storage };
}
async function loggedIn() {
  const f = fixture();
  await f.client.importConfig(JSON.stringify(config));
  await f.client.login(config.instanceId);
  return f;
}
describe('mobile cloud session boundary', () => {
  it('imports, performs public PKCE, persists rotation, verifies identity, restores and logs out', async () => {
    const f = await loggedIn();
    const auth = new URL(f.state.browserUrl);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('redirect_uri')).toBe(MOBILE_REDIRECT_URI);
    const exchange = f.calls.find((c) => c.url === config.auth.tokenEndpoint)!;
    expect(new URLSearchParams(String(exchange.init?.body)).get('code_verifier')).toBe(
      f.rt.random(),
    );
    expect(f.client.getSnapshot().rows[0]?.identity?.instanceRole).toBe('admin');
    await f.client.refresh(config.instanceId);
    expect(f.stored()).toContain('secret-refresh-2');
    const restored = new CloudClient(f.rt);
    await restored.load();
    expect(restored.getSnapshot().rows[0]?.identity).toBeUndefined();
    await restored.whoami(config.instanceId);
    expect(await restored.logout(config.instanceId)).toEqual({
      localLoggedOut: true,
      remoteRevoked: true,
    });
    expect(f.stored()).not.toContain('secret-refresh');
    expect(JSON.stringify(restored.getSnapshot())).not.toContain(token);
    expect(
      f.calls.every((c) => c.init?.redirect === 'error' && c.init.credentials === 'omit'),
    ).toBe(true);
  });
  it.each(['wrongState', 'cancelled'] as const)('does not exchange tokens for %s', async (key) => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    f.state[key] = true;
    await expect(f.client.login(config.instanceId)).rejects.toThrow();
    expect(f.calls.some((c) => c.url === config.auth.tokenEndpoint)).toBe(false);
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(false);
  });
  it('refuses configuration drift before credentials and still removes only the local session on logout', async () => {
    const f = await loggedIn();
    f.state.drift = true;
    f.calls.length = 0;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('INSTANCE_CONFIG_CHANGED');
    expect(f.calls.every((c) => c.url.endsWith('/.well-known/open-cloud-groups'))).toBe(true);
    expect(await f.client.logout(config.instanceId)).toEqual({
      localLoggedOut: true,
      remoteRevoked: false,
    });
    expect(f.stored()).not.toContain(token);
  });
  it('keeps rotated credentials after transient errors, clears revoked credentials, never grants cached identity on mismatch', async () => {
    const f = await loggedIn();
    f.state.refreshError = 503;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('AUTH_RETRY_REQUIRED');
    expect(f.stored()).toContain('secret-refresh-1');
    f.state.refreshError = 0;
    f.state.user = 'user_other';
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('IDENTITY_RESPONSE_MISMATCH');
    expect(f.client.getSnapshot().rows[0]?.identity).toBeUndefined();
    expect(f.stored()).toContain('secret-refresh-2');
    f.state.refreshError = 400;
    await expect(f.client.refresh(config.instanceId)).rejects.toThrow('LOGIN_REQUIRED');
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(false);
  });
  it('reports storage failure without claiming logout and does not disclose raw errors', async () => {
    const f = await loggedIn();
    f.state.failWrite = true;
    await expect(f.client.logout(config.instanceId)).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(true);
    expect(f.client.getSnapshot().error).toBe('STORAGE_UNAVAILABLE');
  });
  it('serializes browser transactions and refuses concurrent refresh/logout', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    let release: (v: string | null) => void = () => {};
    f.rt.authorize = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const login = f.client.login(config.instanceId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(f.client.logout(config.instanceId)).rejects.toThrow('SESSION_BUSY');
    release(null);
    await expect(login).rejects.toThrow('LOGIN_CANCELLED');
  });
  it('does not fetch arbitrary QR URLs and strips cold callback secrets from navigation', () => {
    expect(() => parseCloudQr('https://untrusted.test/config.json')).toThrow(
      'INVALID_INSTANCE_CONFIG',
    );
    expect(() => parseCloudQr(JSON.stringify({ ...config, secret: 'unexpected' }))).toThrow();
    expect(() => callbackCode(MOBILE_REDIRECT_URI + '?code=x&state=s&state=s', 's')).toThrow();
    expect(cloudNativeIntent(MOBILE_REDIRECT_URI + '?code=secret&state=private')).toBe(
      '/cloud-services',
    );
    expect(cloudNativeIntent('deepseekbot://pair?p=host')).toBe('deepseekbot://pair?p=host');
  });
  it('bounds an untrusted discovery body even without content-length', async () => {
    const f = fixture();
    f.rt.request = async () => new Response(' '.repeat(65537));
    await expect(f.client.importConfig(JSON.stringify(config))).rejects.toThrow('INVALID_RESPONSE');
  });
  it('requires confirmation for critical replacement, preserves unchanged sessions and other instances', async () => {
    const f = await loggedIn();
    await f.client.importConfig(JSON.stringify(config));
    expect(f.client.getSnapshot().rows[0]?.hasSession).toBe(true);
    const other = { ...config, instanceId: 'other-uat', server: 'https://other.example.test' };
    const vault = JSON.parse(f.stored()!);
    vault.entries.push({
      config: other,
      session: { accessToken: token, refreshToken: 'other-private-refresh' },
    });
    await f.rt.write(JSON.stringify(vault));
    const restored = new CloudClient(f.rt);
    await restored.load();
    const next = { ...config, auth: { ...config.auth, authkitDomain: 'new-staging.authkit.app' } };
    expect(configurationChanges(config, next)).toEqual([
      {
        field: 'authkitDomain',
        previous: config.auth.authkitDomain,
        next: next.auth.authkitDomain,
      },
    ]);
    await expect(restored.importConfig(JSON.stringify(next))).rejects.toThrow(
      'CONFIG_REPLACEMENT_REQUIRED',
    );
    const original = f.rt.request;
    f.rt.request = async (url, init) =>
      url === config.server + '/.well-known/open-cloud-groups'
        ? new Response(JSON.stringify(next))
        : original(url, init);
    await restored.importConfig(JSON.stringify(next), true);
    expect(
      restored.getSnapshot().rows.find((row) => row.config.instanceId === config.instanceId)
        ?.hasSession,
    ).toBe(false);
    expect(
      restored.getSnapshot().rows.find((row) => row.config.instanceId === other.instanceId)
        ?.hasSession,
    ).toBe(true);
    expect(f.stored()).toContain('other-private-refresh');
  });
  it('rejects expired transactions before token exchange', async () => {
    const f = fixture();
    await f.client.importConfig(JSON.stringify(config));
    let time = 1;
    f.rt.now = () => time;
    f.rt.authorize = async (url) => {
      time += 600001;
      return MOBILE_REDIRECT_URI + '?code=private&state=' + new URL(url).searchParams.get('state');
    };
    await expect(f.client.login(config.instanceId)).rejects.toThrow('LOGIN_EXPIRED');
    expect(f.calls.some((c) => c.url === config.auth.tokenEndpoint)).toBe(false);
  });
});

describe('cloud organizations', () => {
  function organizationsFixture() {
    const f = fixture();
    const original = f.rt.request;
    const state = {
      selected: '',
      role: 'owner',
      version: 1,
      description: '',
      loseCreate: false,
      denied: false,
      mismatch: false,
    };
    const operations: string[] = [];
    f.rt.request = async (url, init) => {
      if (url === config.auth.tokenEndpoint) {
        const id = new URLSearchParams(String(init?.body)).get('organization_id');
        if (id) state.selected = id;
      }
      if (!url.includes('/api/organizations')) return original(url, init);
      if (state.denied)
        return Response.json({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } }, { status: 403 });
      const org = {
        organizationId: state.mismatch ? 'org_wrong' : 'org_a',
        name: 'Mobile project',
        description: state.description,
        version: state.version,
        role: state.role,
      };
      if (url.endsWith('/access'))
        return Response.json({ organizationId: 'org_a', role: state.role });
      if (init?.method === 'POST') {
        operations.push(new Headers(init.headers).get('Idempotency-Key')!);
        if (state.loseCreate) {
          state.loseCreate = false;
          throw new Error('response lost');
        }
        return Response.json({ created: true, organizationId: 'org_a' });
      }
      if (url.endsWith('/org_a')) {
        if (state.selected !== 'org_a')
          return Response.json({ error: { code: 'ORGANIZATION_TOKEN_REQUIRED' } }, { status: 403 });
        if (init?.method === 'PATCH') {
          if (state.role !== 'owner')
            return Response.json(
              { error: { code: 'ORGANIZATION_OWNER_REQUIRED' } },
              { status: 403 },
            );
          const body = JSON.parse(String(init.body));
          if (body.version !== state.version)
            return Response.json(
              { error: { code: 'ORGANIZATION_VERSION_CONFLICT' } },
              { status: 409 },
            );
          state.description = body.description;
          state.version++;
          org.description = state.description;
          org.version = state.version;
        }
        return Response.json(org);
      }
      return Response.json({ organizations: [org], nextCursor: null });
    };
    return { ...f, state, operations };
  }
  it('creates, selects through WorkOS refresh, updates, and revalidates the same organization after restart', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    expect(await client.createOrganization(config.instanceId, 'Mobile project')).toBe('org_a');
    expect((await client.listOrganizations(config.instanceId)).organizations[0]?.role).toBe(
      'owner',
    );
    await client.useOrganization(config.instanceId, 'org_a');
    expect(f.state.selected).toBe('org_a');
    await client.updateOrganization(config.instanceId, 'Shared note', 1);
    await expect(client.updateOrganization(config.instanceId, 'Stale', 1)).rejects.toMatchObject({
      code: 'ORGANIZATION_VERSION_CONFLICT',
    });
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    expect(restarted.getSnapshot().rows[0]?.organization).toBeUndefined();
    await restarted.whoami(config.instanceId);
    expect(restarted.getSnapshot().rows[0]?.organization).toMatchObject({
      organizationId: 'org_a',
      description: 'Shared note',
      version: 2,
    });
    await restarted.logout(config.instanceId);
    expect(restarted.getSnapshot().rows[0]?.organization).toBeUndefined();
  });
  it('retains the original creation operation across response loss, restart and unchanged import', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    f.state.loseCreate = true;
    await expect(
      client.createOrganization(config.instanceId, 'Mobile project'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    await restarted.importConfig(JSON.stringify(config));
    expect(restarted.getSnapshot().rows[0]?.pendingCreate?.name).toBe('Mobile project');
    await expect(restarted.createOrganization(config.instanceId, 'Other')).rejects.toMatchObject({
      code: 'PENDING_ORGANIZATION_CREATE',
    });
    await restarted.createOrganization(config.instanceId, 'Mobile project');
    expect(f.operations).toHaveLength(2);
    expect(f.operations[0]).toBe(f.operations[1]);
    expect(restarted.getSnapshot().rows[0]?.pendingCreate).toBeUndefined();
  });
  it('replays a lost channel creation and message response after restart with the same durable operation', async () => {
    const f = organizationsFixture();
    const baseRequest = f.rt.request;
    const channel = {
      channelId: 'ch_' + 'a'.repeat(64),
      organizationId: 'org_a',
      name: 'general',
      creatorId: 'user_test',
      creatorType: 'human',
      createdAt: '2026-10-18T00:00:00Z',
    };
    const operations: string[] = [];
    let lose = true;
    let storedMessage: Record<string, unknown> | undefined;
    f.rt.request = async (url, init) => {
      if (!url.includes('/channels')) return baseRequest(url, init);
      if (init?.method === 'POST') {
        const operation = new Headers(init.headers).get('Idempotency-Key')!;
        operations.push(operation);
        const body = JSON.parse(String(init.body));
        if (body.text)
          storedMessage = {
            sequence: 1,
            authorId: 'user_test',
            authorType: 'human',
            operationId: operation,
            text: body.text,
            createdAt: '2026-10-18T00:00:00Z',
          };
        if (lose) {
          lose = false;
          throw new Error('lost response');
        }
        return Response.json(body.text ? { message: storedMessage, replayed: true } : channel);
      }
      if (url.includes('/messages'))
        return Response.json({
          messages: storedMessage ? [storedMessage] : [],
          nextCursor: storedMessage ? 1 : 0,
          hasMore: false,
        });
      return Response.json({ channels: [channel], nextCursor: null });
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(client.createChannel(config.instanceId, 'org_a', 'general')).rejects.toMatchObject(
      { code: 'NETWORK_UNAVAILABLE' },
    );
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction?.value).toBe('general');
    await expect(
      client.createChannel(config.instanceId, 'org_a', 'different'),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    await client.createChannel(config.instanceId, 'org_a', 'general');
    expect(operations[0]).toBe(operations[1]);
    expect((await client.listChannels(config.instanceId, 'org_a')).channels[0]?.channelId).toBe(
      channel.channelId,
    );
    lose = true;
    await expect(
      client.sendMessage(config.instanceId, 'org_a', channel.channelId, 'Durable text'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendMessage(config.instanceId, 'org_a', 'ch_' + 'b'.repeat(64), 'Durable text'),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    expect(
      (await client.sendMessage(config.instanceId, 'org_a', channel.channelId, 'Durable text'))
        .sequence,
    ).toBe(1);
    expect(operations[2]).toBe(operations[3]);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    expect(
      (await client.readMessages(config.instanceId, 'org_a', channel.channelId)).messages,
    ).toHaveLength(1);
    await expect(
      client.readMessages(config.instanceId, 'org_other', channel.channelId),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_TOKEN_REQUIRED' });
  });
  it('keeps pending channel work private to the signed-in identity and clears it on logout', async () => {
    const f = organizationsFixture();
    const old = f.rt.request;
    f.rt.request = async (url, init) =>
      url.includes('/channels') ? Promise.reject(new Error('offline')) : old(url, init);
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(client.createChannel(config.instanceId, 'org_a', 'general')).rejects.toMatchObject(
      { code: 'NETWORK_UNAVAILABLE' },
    );
    expect(client.getSnapshot().rows[0]?.pendingChannelAction?.userId).toBe('user_test');
    await client.logout(config.instanceId);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    expect(f.stored()).not.toContain('channel.create');
  });
  it('persists invitation issuance before I/O, retries the same operation after restart and rejects another scope', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    const operations: string[] = [];
    let lose = true;
    const invitation = {
      invitationId: 'invitation_test',
      organizationId: 'org_a',
      email: 'b@example.test',
      role: 'member',
      state: 'pending',
      expiresAt: '2030-01-01T00:00:00Z',
      token: 'provider-secret',
    };
    f.rt.request = async (url, init) => {
      if (url.endsWith('/invitations')) {
        if (init?.method === 'POST') {
          operations.push(new Headers(init.headers).get('Idempotency-Key')!);
          expect(f.stored()).toContain('pendingInvitation');
          if (lose) {
            lose = false;
            throw Error('response lost');
          }
          return Response.json(invitation);
        }
        return Response.json({ invitations: [invitation], nextCursor: null });
      }
      return original(url, init);
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'other@example.test'),
    ).rejects.toMatchObject({ code: 'PENDING_INVITATION' });
    const sent = await client.sendInvitation(config.instanceId, 'org_a', 'b@example.test');
    expect(sent.invitationId).toBe('invitation_test');
    expect(sent).not.toHaveProperty('token');
    expect(operations[0]).toBe(operations[1]);
    expect(operations).toHaveLength(2);
    expect(client.getSnapshot().rows[0]?.pendingInvitation).toBeUndefined();
    const page = await client.listInvitations(config.instanceId, 'org_a');
    expect(page.invitations[0]).not.toHaveProperty('token');
    await expect(client.listInvitations(config.instanceId, 'org_other')).rejects.toMatchObject({
      code: 'ORGANIZATION_TOKEN_REQUIRED',
    });
    lose = true;
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    await client.logout(config.instanceId);
    expect(f.stored()).not.toContain('pendingInvitation');
  });
  it('recipient can read inbox/accept before organization selection and malformed acceptance never reports success', async () => {
    const f = fixture(),
      original = f.rt.request;
    let accepted = false,
      wrongId = false,
      denied = false;
    f.rt.request = async (url, init) => {
      if (url.includes('/api/invitations')) {
        if (denied)
          return Response.json({ error: { code: 'INVITATION_ACCESS_DENIED' } }, { status: 403 });
        const row = {
          invitationId: wrongId ? 'invitation_other' : 'invitation_test',
          organizationId: 'org_a',
          organizationName: 'Shared project',
          email: 'b@example.test',
          role: 'member',
          state: accepted ? 'accepted' : 'pending',
          expiresAt: '2030-01-01T00:00:00Z',
        };
        if (init?.method === 'POST') {
          accepted = true;
          return Response.json({ ...row, state: 'accepted', accepted: true });
        }
        return Response.json({ invitations: [row], nextCursor: null });
      }
      return original(url, init);
    };
    await f.client.importConfig(JSON.stringify(config));
    await f.client.login(config.instanceId);
    expect(
      (await f.client.listInvitations(config.instanceId)).invitations[0]?.organizationName,
    ).toBe('Shared project');
    expect(await f.client.acceptInvitation(config.instanceId, 'invitation_test')).toMatchObject({
      state: 'accepted',
      role: 'member',
    });
    expect(f.client.getSnapshot().rows[0]?.organization).toBeUndefined();
    wrongId = true;
    await expect(
      f.client.acceptInvitation(config.instanceId, 'invitation_test'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    denied = true;
    await expect(
      f.client.acceptInvitation(config.instanceId, 'invitation_test'),
    ).rejects.toMatchObject({ code: 'INVITATION_ACCESS_DENIED' });
  });
  it('keeps direct channel grants independent of organization selection and retries guest writes after restart', async () => {
    const f = fixture(),
      original = f.rt.request;
    const channelId = 'ch_' + 'b'.repeat(64),
      invitationId = 'ci_' + 'c'.repeat(64);
    const invitation = {
      invitationId,
      channelId,
      channelName: 'External project',
      organizationId: 'org_external',
      email: 'b@example.test',
      role: 'guest',
      state: 'pending',
      expiresAt: '2030-01-01T00:00:00Z',
    };
    const channel = {
      channelId,
      organizationId: 'org_external',
      name: 'External project',
      creatorId: 'user_a',
      creatorType: 'human',
      createdAt: '2026-10-18T00:00:00Z',
      access: 'guest',
    };
    const operations: string[] = [];
    let lose = true,
      denied = false,
      wrongScope = false;
    f.rt.request = async (url, init) => {
      if (url.includes('/api/channel-invitations'))
        return Response.json(
          init?.method === 'POST'
            ? { ...invitation, accepted: true, state: 'accepted' }
            : { invitations: [invitation], nextCursor: null },
        );
      if (url.includes('/api/guest-channels')) {
        if (denied)
          return Response.json({ error: { code: 'CHANNEL_ACCESS_DENIED' } }, { status: 403 });
        if (url.includes('/messages')) {
          if (init?.method === 'POST') {
            const operation = new Headers(init.headers).get('Idempotency-Key')!;
            operations.push(operation);
            expect(f.stored()).toContain('guest.send');
            if (lose) {
              lose = false;
              throw Error('response lost');
            }
            return Response.json({
              message: {
                sequence: 8,
                authorId: 'user_test',
                authorType: 'human',
                operationId: operation,
                text: 'Guest reply',
                createdAt: '2026-10-18T00:00:00Z',
              },
            });
          }
          return Response.json({ messages: [], nextCursor: 7, hasMore: false });
        }
        return Response.json({
          channels: [{ ...channel, access: wrongScope ? 'member' : 'guest' }],
          nextCursor: invitationId,
        });
      }
      return original(url, init);
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    expect(
      (await client.listInvitations(config.instanceId, undefined, undefined, true)).invitations[0]
        ?.role,
    ).toBe('guest');
    await client.acceptInvitation(config.instanceId, invitationId, true);
    expect(client.getSnapshot().rows[0]?.organization).toBeUndefined();
    expect((await client.listChannels(config.instanceId, '', undefined, true)).nextCursor).toBe(
      invitationId,
    );
    expect((await client.readMessages(config.instanceId, '', channelId, 0, true)).nextCursor).toBe(
      7,
    );
    await expect(client.acceptInvitation(config.instanceId, invitationId)).rejects.toMatchObject({
      code: 'INVALID_INVITATION',
    });
    await expect(
      client.sendMessage(config.instanceId, 'org_external', channelId, 'Guest reply', true),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendMessage(
        config.instanceId,
        'org_external',
        'ch_' + 'd'.repeat(64),
        'Guest reply',
        true,
      ),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    expect(
      (await client.sendMessage(config.instanceId, 'org_external', channelId, 'Guest reply', true))
        .sequence,
    ).toBe(8);
    expect(operations[0]).toBe(operations[1]);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    wrongScope = true;
    await expect(client.listChannels(config.instanceId, '', undefined, true)).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
    denied = true;
    await expect(
      client.readMessages(config.instanceId, '', channelId, 0, true),
    ).rejects.toMatchObject({ code: 'CHANNEL_ACCESS_DENIED' });
    expect(
      f.calls.some((c) => new URLSearchParams(String(c.init?.body)).has('organization_id')),
    ).toBe(false);
  });
  it('binds pending channel invitations to their channel and preserves the key across restart', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    const channelId = 'ch_' + 'a'.repeat(64),
      invitationId = 'ci_' + 'b'.repeat(64);
    const operations: string[] = [];
    let lose = true;
    f.rt.request = async (url, init) => {
      if (!url.includes('/guest-invitations')) return original(url, init);
      const row = {
        invitationId,
        channelId,
        channelName: 'Guest project',
        organizationId: 'org_a',
        email: 'b@example.test',
        role: 'guest',
        state: url.endsWith('/revoke') ? 'revoked' : 'pending',
        expiresAt: '2030-01-01T00:00:00Z',
      };
      if (url.endsWith('/revoke')) return Response.json(row);
      if (init?.method === 'POST') {
        operations.push(new Headers(init.headers).get('Idempotency-Key')!);
        if (lose) {
          lose = false;
          throw Error('response lost');
        }
        return Response.json(row);
      }
      return Response.json({ invitations: [row], nextCursor: null });
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test', channelId),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'PENDING_INVITATION' });
    expect(
      (await client.sendInvitation(config.instanceId, 'org_a', 'b@example.test', channelId)).role,
    ).toBe('guest');
    expect(operations[0]).toBe(operations[1]);
    expect(
      (await client.listInvitations(config.instanceId, 'org_a', undefined, channelId))
        .invitations[0]?.channelId,
    ).toBe(channelId);
    expect(
      (await client.revokeInvitation(config.instanceId, 'org_a', invitationId, channelId)).state,
    ).toBe('revoked');
  });
  it('never treats stale owner UI or a mismatched selection response as organization authorization', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    f.state.role = 'member';
    await expect(client.updateOrganization(config.instanceId, 'Denied', 1)).rejects.toMatchObject({
      code: 'ORGANIZATION_OWNER_REQUIRED',
    });
    expect(f.state.description).toBe('');
    await client.whoami(config.instanceId);
    expect(client.getSnapshot().rows[0]?.organization?.role).toBe('member');
    f.state.denied = true;
    await expect(client.useOrganization(config.instanceId, 'org_a')).rejects.toMatchObject({
      code: 'ORGANIZATION_ACCESS_DENIED',
    });
    expect(client.getSnapshot().rows[0]?.organization).toBeUndefined();
    f.state.denied = false;
    f.state.mismatch = true;
    await expect(client.useOrganization(config.instanceId, 'org_a')).rejects.toMatchObject({
      code: 'ORGANIZATION_TOKEN_MISMATCH',
    });
  });
});

it('ordinary user onboarding retains a retryable session and does not display administrator authority', async () => {
  const f = fixture();
  f.state.instanceRole = 'user';
  f.state.onboardingError = true;
  await f.client.importConfig(JSON.stringify(config));
  await expect(f.client.login(config.instanceId)).rejects.toThrow('ONBOARDING_INCOMPLETE');
  expect(f.stored()).toContain('secret-refresh');
  f.state.onboardingError = false;
  expect(await f.client.whoami(config.instanceId)).toMatchObject({ instanceRole: 'user' });
  expect(f.calls.filter((c) => c.url.endsWith('/api/onboarding'))).toHaveLength(2);
  expect(
    f.calls
      .filter((c) => c.url.endsWith('/api/onboarding'))
      .every((c) => c.init?.method === 'POST'),
  ).toBe(true);
});

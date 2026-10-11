import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { mountPrivateInputs } from '../src/credentials/mount.js';
import type { BotHarnessCore } from '../src/plugin.js';

async function fixture(enabled: boolean, keys: string[] = []) {
  const ctx = new Context();
  let guard!: (call: { name: string; agent?: Agent }) => string | undefined;
  ctx.provide('tools', {
    register: vi.fn(),
    guard: (callback: typeof guard) => {
      guard = callback;
      return () => undefined;
    },
  });
  ctx.provide('credentials', { listRecords: async () => keys.map((key) => ({ key })) } as never);
  const contribute = vi.fn<BotHarnessCore['contributeBotAgentSetup']>(
    (_callback) => () => undefined,
  );
  const core = {
    ownership: {
      resolve: (id: string) =>
        id === 'owned'
          ? { botSlug: 'ada', rootRole: 'orchestrator' }
          : id === 'assignment'
            ? { botSlug: 'ada', rootRole: 'assignment' }
            : undefined,
    },
    contributeBotAgentSetup: contribute,
  } as unknown as BotHarnessCore;
  mountPrivateInputs(ctx, core, enabled);
  await vi.waitFor(() =>
    expect(guard({ name: 'read' })).toEqual(
      enabled || keys.length > 0 ? expect.any(String) : undefined,
    ),
  );
  return { ctx, guard, contribute };
}

describe('private Profile capability boundary', () => {
  it('qualifies Bot Schedule management only for owned Orchestrators', async () => {
    const f = await fixture(true);
    const agent = { session: { id: 'owned' } } as Agent;
    const assignment = { session: { id: 'assignment' } } as Agent;
    for (const name of [
      'bot_schedule_list',
      'bot_schedule_create',
      'bot_schedule_update',
      'bot_schedule_delete',
    ]) {
      expect(f.guard({ name, agent })).toBeUndefined();
      expect(f.guard({ name })).toContain('not qualified');
      expect(f.guard({ name, agent: assignment })).toContain('not qualified');
    }
    expect(f.guard({ name: 'schedule_create', agent })).toContain('not qualified');
    await f.ctx.fiber.dispose();
  });
  it('preserves ordinary Host tools before opt-in but refuses downgrade with stored grants', async () => {
    const ordinary = await fixture(false);
    expect(ordinary.guard({ name: 'mcp_example' })).toBeUndefined();
    expect(ordinary.guard({ name: 'bash' })).toBeUndefined();
    expect(ordinary.contribute).not.toHaveBeenCalled();
    await ordinary.ctx.fiber.dispose();
    const locked = await fixture(false, ['botharness-private/grant-synthetic']);
    expect(locked.guard({ name: 'bash' })).toContain('protected Profile');
    expect(locked.guard({ name: 'read' })).toContain('not qualified');
    await locked.ctx.fiber.dispose();
  });

  it('applies the Host boundary to native Sessions and other Bots even with broad approval', async () => {
    const f = await fixture(true);
    const agent = { session: { id: 'owned' } } as Agent;
    expect(f.guard({ name: 'read', agent })).toContain('not qualified');
    expect(f.guard({ name: 'mcp_example', agent })).toContain('not qualified');
    expect(f.guard({ name: 'channel_send', agent })).toBeUndefined();
    expect(f.guard({ name: 'channel_send' })).toContain('not qualified');
    expect(f.guard({ name: 'bash' })).toBeUndefined();
    await f.ctx.fiber.dispose();
  });

  it('compiles the dynamic field declaration with the pinned native schema DSL', async () => {
    const f = await fixture(true);
    const agentCtx = new Context();
    const tools: ToolDefinition[] = [];
    agentCtx.provide('tools', {
      register: (tool: ToolDefinition) => {
        tools.push(tool);
        return () => undefined;
      },
    } as never);
    const setup = f.contribute.mock.calls[0]![0] as unknown as (
      ctx: Context,
      agent: Agent,
      info: { rootRole: string },
    ) => void;
    setup(agentCtx, {} as Agent, { rootRole: 'orchestrator' });
    const request = tools.find((tool) => tool.name === 'ask_secret')!;
    expect(request.parameters).toMatchObject({
      properties: {
        fields: { items: { required: ['id', 'label', 'required'], additionalProperties: false } },
      },
    });
    await agentCtx.fiber.dispose();
    await f.ctx.fiber.dispose();
  });
});

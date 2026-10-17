import { describe, expect, it, vi } from 'vitest';
import { parseAgentManagement, TOB_AGENT_COMMAND_USAGE } from '../src/bots/cli-agent-management.js';

const fingerprint = 'a'.repeat(64);
function parser() {
  const readStdin = vi.fn(async () => 'private-input');
  const io = { env: {}, stdout: vi.fn(), stderr: vi.fn(), readStdin };
  return {
    readStdin,
    parse: (command: string, rest: string[] = [], values: Record<string, unknown> = {}) =>
      parseAgentManagement(command, rest, values, io),
  };
}
describe('scoped Channel CLI dispatch', () => {
  it('normalizes bounded metadata and observed Group detail without reading private input', async () => {
    const p = parser();
    expect(await p.parse('channels', [], { limit: '2', cursor: 'group-1' })).toEqual({
      command: 'channels',
      args: { limit: 2, cursor: 'group-1' },
      write: false,
    });
    expect(await p.parse('channel', ['group-1'])).toEqual({
      command: 'channel',
      args: { channelId: 'group-1' },
      write: false,
    });
    expect(p.readStdin).not.toHaveBeenCalled();
  });
  it('keeps explicit initial membership separate from subsequent invitations', async () => {
    const p = parser();
    expect(
      await p.parse('group-create', ['Project'], {
        'operation-key': 'create-operation-1',
        member: ['one', 'two'],
      }),
    ).toEqual({
      command: 'group-create',
      args: { name: 'Project', members: ['one', 'two'], operationKey: 'create-operation-1' },
      write: true,
    });
    expect(
      await p.parse('group-create', ['Empty'], { 'operation-key': 'create-operation-2' }),
    ).toMatchObject({ args: { members: [] } });
    expect(
      await p.parse('group-invite', ['group-1'], {
        bot: 'three',
        'operation-key': 'invite-operation-1',
        'expected-channel': fingerprint,
      }),
    ).toEqual({
      command: 'group-invite',
      args: {
        channelId: 'group-1',
        botSlug: 'three',
        operationKey: 'invite-operation-1',
        expectedChannel: fingerprint,
      },
      write: true,
    });
    expect(TOB_AGENT_COMMAND_USAGE['group-create']).toContain('join directly');
    expect(TOB_AGENT_COMMAND_USAGE['group-invite']).toContain('acceptance policy');
    expect(p.readStdin).not.toHaveBeenCalled();
  });
  it.each(['host', 'token', 'home', 'owner', 'system-role', 'accept', 'confirm'])(
    'rejects --%s rather than falling through to Human transport',
    async (flag) => {
      const p = parser();
      await expect(
        p.parse('group-invite', ['group-1'], {
          bot: 'three',
          'operation-key': 'invite-operation-1',
          'expected-channel': fingerprint,
          [flag]: 'private-value',
        }),
      ).rejects.toMatchObject({ code: 'agent-scope-denied' });
      expect(p.readStdin).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['group-create', ['Group'], {}],
    ['group-create', ['Group'], { 'operation-key': 'short' }],
    ['group-create', ['Group'], { 'operation-key': 'operation-1', member: ['same', 'same'] }],
    ['group-create', ['Group'], { 'operation-key': 'operation-1', member: 'not-array' }],
    ['group-invite', ['group-1'], { bot: 'one', 'operation-key': 'operation-1' }],
    [
      'group-invite',
      ['group-1'],
      { bot: 'one', 'operation-key': 'operation-1', 'expected-channel': 'not-a-fingerprint' },
    ],
    ['channels', [], { limit: '0' }],
    ['channels', [], { limit: '101' }],
    ['channels', [], { limit: '2.5' }],
    ['channel', [], {}],
    ['channel', ['one', 'two'], {}],
  ] as const)('refuses malformed %s arguments', async (command, rest, values) => {
    await expect(parser().parse(command, [...rest], values)).rejects.toMatchObject({
      code: 'usage',
    });
  });
});

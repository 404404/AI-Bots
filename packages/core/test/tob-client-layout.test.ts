import { expect, it } from 'vitest';
import { ClientControlService } from '../src/client-control/service.js';
import { createTobClientLayoutOperations } from '../src/tob/cli-client-layout.js';
import { parseClientPreferences } from '../src/bots/cli-client-preferences.js';
import type { BotCreateCliIo } from '../src/bots/bot-create-cli.js';

it('reviews the exact live Client layout then rechecks current before dispatch', async () => {
  const service = new ClientControlService();
  const a = { clientId: 'client-aaa', generation: 'generation-aaa' };
  const b = { clientId: 'client-bbb', generation: 'generation-bbb' };
  service.register(a, 'web'); service.register(b, 'web');
  let current = a;
  try {
    const prepare = createTobClientLayoutOperations(service, () => current);
    const pending = prepare('client-layout-set', { current: true, scope: 'browser-origin', expectedState: 'a'.repeat(64), patch: { type: 'gap', gap: 8 } });
    const command = service.poll(a).commands[0]!;
    expect(service.poll(b).commands).toEqual([]);
    service.complete(a, command.id, { ok: true, value: { stateFingerprint: 'a'.repeat(64), value: { gap: 4 } } });
    const operation = (await pending)!;
    expect(operation.proposal).toMatchObject({ target: 'client-aaa/generation-aaa', patch: { changes: { type: 'gap', gap: 8 } } });
    current = b;
    expect(() => operation.run(() => {})).toThrow('current-client-unavailable');
  } finally { service.dispose(); }
});
it('requires exact target/generation and one stdin edit in Human and Tob CLI', async () => {
  const io = { readStdin: async () => '{"type":"gap","gap":8}' } as BotCreateCliIo;
  await expect(parseClientPreferences('client-layout', [], {}, io)).rejects.toThrow('Choose exactly one');
  const parsed = await parseClientPreferences('client-layout-set', ['current'], { scope: 'browser-origin', 'expected-state': 'a'.repeat(64), 'patch-stdin': true }, io, true);
  expect(parsed).toMatchObject({ command: 'client-layout-set', write: true, args: { current: true, patch: { type: 'gap', gap: 8 } } });
});

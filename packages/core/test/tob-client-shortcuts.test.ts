import { expect, it } from 'vitest';
import { ClientControlService } from '../src/client-control/service.js';
import { createTobClientShortcutOperations } from '../src/tob/cli-client-shortcuts.js';
import { validateShortcutEdit } from '../src/client-control/shortcuts.js';
import { parseClientPreferences } from '../src/bots/cli-client-preferences.js';
import type { BotCreateCliIo } from '../src/bots/bot-create-cli.js';

it('rejects reset-all and malformed physical binding edits', () => {
  expect(() => validateShortcutEdit({ type: 'reset-all', id: 'x', profile: 'web:macos' })).toThrow(
    'invalid-shortcut-edit',
  );
  expect(() =>
    validateShortcutEdit({
      type: 'set',
      id: 'x',
      profile: 'web:macos',
      binding: { code: 'KeyJ', modifiers: ['alt', 'alt'] },
    }),
  ).toThrow('invalid-shortcut-edit');
});
it('routes the explicit profile/fingerprint through scoped CLI and rechecks target at dispatch', async () => {
  const service = new ClientControlService();
  const target = { clientId: 'client-aaa', generation: 'generation-aaa' };
  const proof = 'proof-aaaaaaaaaaaaaaaa';
  service.register(target, 'web', proof);
  const patch = { profile: 'web:macos', id: 'botharness.navigation.help', type: 'disable' };
  try {
    const io = { readStdin: async () => JSON.stringify(patch) } as BotCreateCliIo;
    const parsed = (await parseClientPreferences(
      'client-shortcuts-set',
      ['current'],
      { scope: 'client-profile', 'expected-state': 'b'.repeat(64), 'patch-stdin': true },
      io,
      true,
    ))!;
    const prepare = createTobClientShortcutOperations(service, () => target);
    const pending = prepare(parsed.command, parsed.args);
    service.complete(target, service.poll(target).commands[0]!.id, {
      ok: true,
      value: { stateFingerprint: 'b'.repeat(64), value: { profile: patch.profile } },
    });
    const operation = (await pending)!;
    expect(operation.proposal).toMatchObject({ patch: { profile: 'web:macos', changes: patch } });
    service.register({ ...target, generation: 'generation-new' }, 'web', proof);
    expect(() => operation.run(() => {})).toThrow('client-target-replaced');
  } finally {
    service.dispose();
  }
});

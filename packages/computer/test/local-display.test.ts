import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { NO_DISPLAY_MESSAGE, ensureLocalDisplay } from '../src/tool/local-display.js';

const hasXvfb = (() => {
  try {
    execFileSync('sh', ['-c', 'command -v Xvfb && command -v openbox && command -v dbus-daemon'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
})();

describe('Linux Local Computer display', () => {
  it('uses the session display when DSH runs on a desktop', async () => {
    const display = await ensureLocalDisplay({ source: { DISPLAY: ':0', PATH: '' } });
    expect(display).toMatchObject({ display: ':0', managed: false });
    await display.stop();
  });

  it('refuses with install guidance when there is no display and no Xvfb', async () => {
    await expect(ensureLocalDisplay({ source: { PATH: '/nonexistent' } })).rejects.toThrow(
      NO_DISPLAY_MESSAGE,
    );
  });

  it.skipIf(process.platform !== 'linux' || !hasXvfb)(
    'starts a private Xvfb on a server and stops it',
    async () => {
      const onEvent = vi.fn();
      const display = await ensureLocalDisplay({
        source: { PATH: process.env['PATH'] },
        onEvent,
      });
      expect(display.managed).toBe(true);
      expect(display.display).toMatch(/^:\d+$/);
      expect(existsSync(`/tmp/.X11-unix/X${display.display.slice(1)}`)).toBe(true);
      expect(display.alive()).toBe(true);
      await display.stop();
      expect(display.alive()).toBe(false);
      expect(display.env['DBUS_SESSION_BUS_ADDRESS']).toMatch(/^unix:/);
      expect(onEvent.mock.calls.map(([detail]) => String(detail).split(' ')[0])).toEqual([
        'phase=display',
        'phase=display-stopped',
      ]);
    },
    15000,
  );
});

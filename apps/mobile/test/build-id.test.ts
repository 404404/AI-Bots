import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { buildLabel, readBuildStamp } from '../src/host/build-id';

describe('build id', () => {
  it('reads the SHA and time that app.config.ts stamps into extra.build', () => {
    expect(readBuildStamp({ build: { sha: 'd9bbfbdfe', time: '2026-10-15T09:30:00.000Z' } })).toEqual({
      sha: 'd9bbfbdfe',
      time: '2026-10-15T09:30:00.000Z',
    });
  });

  it('falls back to dev when the build carries no stamp', () => {
    expect(readBuildStamp(undefined)).toEqual({ sha: 'dev' });
    expect(readBuildStamp({ build: { sha: '' } })).toEqual({ sha: 'dev' });
    expect(buildLabel({ sha: 'dev' })).toBe('dev');
  });

  it('shows the SHA with the local build time', () => {
    const time = new Date(2026, 9, 15, 18, 5).toISOString();
    expect(buildLabel({ sha: 'd9bbfbdfe', time })).toBe('d9bbfbdfe · 2026-10-15 18:05');
    expect(buildLabel({ sha: 'd9bbfbdfe', time: 'not a date' })).toBe('d9bbfbdfe');
  });
});

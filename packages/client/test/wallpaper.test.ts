import { describe, it, expect, vi } from 'vitest';
import { Wallpaper } from '../src/client/wallpaper.js';
import {
  DEFAULT_CROP,
  WallpaperError,
  wallpaperPlacement,
  type WallpaperRecord,
  type WallpaperStore,
} from '../src/client/wallpaper-store.js';
import { createWallpaperControl } from '../src/client/wallpaper-control.js';
function fixture() {
  let saved: WallpaperRecord | undefined;
  let refuse = false;
  const store: WallpaperStore = {
    read: async () => saved,
    replace: async (value, expected) => {
      if (refuse) throw new WallpaperError('wallpaper-storage-unavailable');
      if ((saved?.revision ?? 'empty') !== expected)
        throw new WallpaperError('wallpaper-revision-conflict');
      saved = value;
    },
    close: vi.fn(),
  };
  const releases: string[] = [];
  let n = 0;
  const decode = vi.fn(async (blob: Blob) => {
    if ((await blob.text()) === 'invalid') throw new WallpaperError('wallpaper-decode-failed');
    const url = `blob:fixture-${++n}`;
    return {
      blob,
      url,
      width: 1200,
      height: 800,
      release: () => {
        releases.push(url);
      },
    };
  });
  const owner = new Wallpaper(store, decode);
  return {
    owner,
    store,
    decode,
    releases,
    fail: () => {
      refuse = true;
    },
    saved: () => saved,
  };
}
describe('local wallpaper owner', () => {
  it('persists original bytes and crop together, restores a fresh owner and removes the only asset', async () => {
    const f = fixture();
    await f.owner.refresh();
    const input = new Blob(['original pixels']);
    const crop = { x: 0.7, y: 0.2, zoom: 1.5 };
    await f.owner.save(input, crop, 'empty');
    expect(await f.saved()!.blob.text()).toBe('original pixels');
    const restored = new Wallpaper(f.store, f.decode);
    await restored.refresh();
    expect(restored.describe()).toEqual(f.owner.describe());
    const revision = restored.getSnapshot().revision;
    await restored.crop({ ...crop, zoom: 2 }, revision);
    expect(await f.saved()!.blob.text()).toBe('original pixels');
    expect(f.saved()!.crop.zoom).toBe(2);
    await restored.remove(restored.getSnapshot().revision);
    expect(f.saved()).toBeUndefined();
    expect(restored.getSnapshot().current).toBeUndefined();
    f.owner.dispose();
    restored.dispose();
  });
  it('retains the accepted bytes, crop and live URL when decoding, saving or revision checks fail', async () => {
    const f = fixture();
    await f.owner.save(new Blob(['first']), DEFAULT_CROP, 'empty');
    const saved = f.saved();
    const current = f.owner.getSnapshot().current;
    await expect(
      f.owner.save(new Blob(['invalid']), DEFAULT_CROP, saved!.revision),
    ).rejects.toMatchObject({ code: 'wallpaper-decode-failed' });
    await expect(f.owner.save(new Blob(['second']), DEFAULT_CROP, 'stale')).rejects.toMatchObject({
      code: 'wallpaper-revision-conflict',
    });
    f.fail();
    await expect(
      f.owner.save(new Blob(['third']), DEFAULT_CROP, saved!.revision),
    ).rejects.toMatchObject({ code: 'wallpaper-storage-unavailable' });
    await expect(f.owner.crop({ x: 0, y: 0, zoom: 2 }, saved!.revision)).rejects.toMatchObject({
      code: 'wallpaper-storage-unavailable',
    });
    expect(f.saved()).toBe(saved);
    expect(f.owner.getSnapshot().current).toEqual(current);
    expect(f.releases).not.toContain(current!.url);
    expect(f.releases).toHaveLength(3);
    f.owner.dispose();
    expect(f.releases).toContain(current!.url);
  });
  it('refuses expired imports and invalid crops before replacing the current asset', async () => {
    const f = fixture();
    await expect(f.owner.save(new Blob(['x']), DEFAULT_CROP, 'empty', 0)).rejects.toMatchObject({
      code: 'appearance-request-stale',
    });
    await expect(
      f.owner.save(new Blob(['x']), { x: -1, y: 0.5, zoom: 1 }, 'empty'),
    ).rejects.toMatchObject({ code: 'wallpaper-crop-invalid' });
    expect(f.saved()).toBeUndefined();
    f.owner.dispose();
  });
  it('bounds and orders directed import chunks without touching persistence until commit', async () => {
    const f = fixture();
    const control = createWallpaperControl(f.owner);
    const deadline = Date.now() + 10000;
    const begin = await control.execute({ action: 'begin', size: 6 }, 'empty', deadline);
    const id = 'uploadId' in begin ? begin.uploadId : undefined;
    await expect(
      control.execute(
        { action: 'append', uploadId: id, offset: 1, data: btoa('first!') },
        'empty',
        deadline,
      ),
    ).rejects.toMatchObject({ code: 'wallpaper-chunk-invalid' });
    await control.execute(
      { action: 'append', uploadId: id, offset: 0, data: btoa('first!') },
      'empty',
      deadline,
    );
    expect(f.saved()).toBeUndefined();
    await control.execute({ action: 'commit', uploadId: id }, 'empty', deadline);
    expect(await f.saved()!.blob.text()).toBe('first!');
    await expect(
      control.execute({ action: 'commit', uploadId: id }, 'empty', deadline),
    ).rejects.toMatchObject({ code: 'wallpaper-upload-stale' });
    control.dispose();
    f.owner.dispose();
  });
  it.each([
    [1800, 600],
    [600, 1800],
    [800, 800],
  ])('covers %s by %s without stretching or exposing blank edges', (w, h) => {
    for (const crop of [DEFAULT_CROP, { x: 0, y: 1, zoom: 1 }, { x: 0.7, y: 0.2, zoom: 3 }]) {
      const p = wallpaperPlacement(1200, 800, w, h, crop);
      expect(p.width / p.height).toBeCloseTo(1.5);
      expect(p.left).toBeLessThanOrEqual(0);
      expect(p.top).toBeLessThanOrEqual(0);
      expect(p.left + p.width).toBeGreaterThanOrEqual(w);
      expect(p.top + p.height).toBeGreaterThanOrEqual(h);
    }
  });
});

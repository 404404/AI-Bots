import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { SettingsSection } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  DEFAULT_CROP,
  decodeWallpaper,
  type Wallpaper,
  type WallpaperPreview,
} from './wallpaper.js';
import { wallpaperPlacement, type WallpaperCrop } from './wallpaper-store.js';

export function WallpaperSettings({ owner, t }: { owner: Wallpaper; t: BotHarnessTranslate }) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const [preview, setPreview] = useState<WallpaperPreview>();
  const [crop, setCrop] = useState<WallpaperCrop>(DEFAULT_CROP);
  const [expected, setExpected] = useState('empty');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const resource = useRef<WallpaperPreview>();
  const live = useRef(false);
  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; crop: WallpaperCrop }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current++;
      resource.current?.release();
      resource.current = undefined;
    };
  }, [owner]);
  const cancel = () => {
    generation.current++;
    resource.current?.release();
    resource.current = undefined;
    setPreview(undefined);
    setError(false);
  };
  const prepare = async (load: () => Promise<WallpaperPreview>, crop: WallpaperCrop) => {
    const run = ++generation.current;
    setBusy(true);
    setError(false);
    const expected = owner.getSnapshot().revision;
    try {
      const next = await load();
      if (!live.current || run !== generation.current) {
        next.release();
        return;
      }
      resource.current?.release();
      resource.current = next;
      setPreview(next);
      setCrop(crop);
      setExpected(expected);
    } catch {
      if (live.current && run === generation.current) setError(true);
    } finally {
      if (live.current && run === generation.current) setBusy(false);
    }
  };
  const previewMount = useMountedResource<HTMLDivElement>(
    (node) => {
      frame.current = node;
      const image = node.querySelector('img')!;
      const paint = () => {
        if (!preview) return;
        const box = node.getBoundingClientRect();
        const placement = wallpaperPlacement(
          preview.width,
          preview.height,
          box.width,
          box.height,
          crop,
        );
        for (const [key, value] of Object.entries(placement))
          image.style.setProperty(key, `${value}px`);
      };
      const resize = new ResizeObserver(paint);
      resize.observe(node);
      paint();
      return () => {
        resize.disconnect();
        frame.current = null;
      };
    },
    [preview, crop],
  );
  return (
    <div ref={mount}>
      <SettingsSection title={t('wallpaper.title')}>
        <Note>{t('wallpaper.local')}</Note>
        {(error || snapshot.error) && <Note tone="danger">{t('wallpaper.failed')}</Note>}
        <label>
          {t('wallpaper.upload')}{' '}
          <input
            type="file"
            accept="image/*"
            aria-label={t('wallpaper.upload')}
            disabled={busy || !snapshot.ready}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void prepare(() => decodeWallpaper(file), DEFAULT_CROP);
            }}
          />
        </label>
        {snapshot.current && !preview && (
          <div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void prepare(() => owner.previewCurrent(), snapshot.current!.crop)}
            >
              {t('wallpaper.recrop')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void owner
                  .remove(snapshot.revision)
                  .catch(() => {})
                  .finally(() => {
                    if (live.current) setBusy(false);
                  });
              }}
            >
              {t('wallpaper.remove')}
            </Button>
          </div>
        )}
        {preview && (
          <div>
            <Note>{t('wallpaper.cropHelp')}</Note>
            <div
              ref={previewMount}
              data-wallpaper-preview=""
              role="img"
              aria-label={t('wallpaper.preview')}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio:
                  typeof window === 'undefined'
                    ? '1.6'
                    : String(window.innerWidth / window.innerHeight),
                overflow: 'hidden',
                touchAction: 'none',
                cursor: 'move',
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || busy) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, crop };
              }}
              onPointerMove={(event) => {
                if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId))
                  return;
                const box = event.currentTarget.getBoundingClientRect();
                const size = wallpaperPlacement(
                  preview.width,
                  preview.height,
                  box.width,
                  box.height,
                  drag.current.crop,
                );
                setCrop({
                  ...crop,
                  x: Math.max(
                    0,
                    Math.min(
                      1,
                      drag.current.crop.x - (event.clientX - drag.current.x) / size.width,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      1,
                      drag.current.crop.y - (event.clientY - drag.current.y) / size.height,
                    ),
                  ),
                });
              }}
              onPointerUp={() => {
                drag.current = undefined;
              }}
              onLostPointerCapture={() => {
                drag.current = undefined;
              }}
            >
              <img
                src={preview.url}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <label>
              {t('wallpaper.zoom')}{' '}
              <input
                aria-label={t('wallpaper.zoom')}
                type="range"
                min="1"
                max="5"
                step="0.05"
                value={crop.zoom}
                disabled={busy}
                onChange={(e) => setCrop({ ...crop, zoom: Number(e.currentTarget.value) })}
              />
            </label>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(false);
                void owner
                  .save(preview.blob, crop, expected)
                  .then(() => {
                    if (live.current) cancel();
                  })
                  .catch(() => {
                    if (live.current) setError(true);
                  })
                  .finally(() => {
                    if (live.current) setBusy(false);
                  });
              }}
            >
              {t('wallpaper.use')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={cancel}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

import { WallpaperError } from './wallpaper-store.js';
import type { Wallpaper } from './wallpaper.js';
import { createWallpaperControl } from './wallpaper-control.js';
import { Appearance, AppearanceError, object } from './appearance.js';

export function mountAppearanceControl(owner: Appearance, wallpaper?: Wallpaper): () => void {
  const abort = new AbortController();
  const media = wallpaper ? createWallpaperControl(wallpaper) : undefined;
  let registration: { clientId: string; token: string } | undefined;
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch('./api/botharness/appearance-control', {
      method: 'POST',
      credentials: 'same-origin',
      signal: abort.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = object(await response.json());
    if (!response.ok) throw new AppearanceError(String(object(result.error).code));
    return result;
  };
  const run = async () => {
    while (!abort.signal.aborted) {
      try {
        const value = await post({
          action: 'register',
          platform: location.protocol === 'dsh-app:' ? 'desktop' : 'web',
        });
        if (typeof value.clientId !== 'string' || typeof value.token !== 'string')
          throw new Error('Invalid Client registration');
        registration = { clientId: value.clientId, token: value.token };
        while (!abort.signal.aborted) {
          const { command: raw } = await post({ action: 'poll', ...registration });
          if (raw === null) continue;
          const command = object(raw);
          let result: unknown;
          try {
            if (typeof command.expiresAt !== 'number' || Date.now() > command.expiresAt)
              throw new AppearanceError('appearance-request-stale');
            if (command.wallpaper !== undefined) {
              if (!media) throw new WallpaperError('wallpaper-unavailable');
              result = await media.execute(
                command.wallpaper,
                command.expectedRevision,
                command.expiresAt,
              );
            } else {
              owner.refresh();
              if (owner.getSnapshot().error) throw new AppearanceError(owner.getSnapshot().error!);
              if (command.patch !== undefined && typeof command.expectedRevision !== 'string')
                throw new AppearanceError('appearance-revision-required');
              result = {
                targets: owner.targets(),
                snapshot:
                  command.patch === undefined
                    ? owner.getSnapshot()
                    : owner.update(command.patch, command.expectedRevision as string),
              };
            }
          } catch (error) {
            result = {
              error: {
                code:
                  error instanceof AppearanceError || error instanceof WallpaperError
                    ? error.code
                    : 'appearance-client-failed',
              },
            };
          }
          await post({ action: 'reply', ...registration, requestId: command.id, result });
        }
      } catch {
        if (!abort.signal.aborted)
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              abort.signal.removeEventListener('abort', done);
              resolve();
            };
            const timer = setTimeout(done, 3000);
            abort.signal.addEventListener('abort', done, { once: true });
          });
      }
    }
  };
  void run();
  return () => {
    abort.abort();
    media?.dispose();
    if (registration)
      void fetch('./api/botharness/appearance-control', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unregister', ...registration }),
      }).catch(() => {});
  };
}

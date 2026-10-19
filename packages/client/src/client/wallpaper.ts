import {
  DEFAULT_CROP,
  IMAGE_LIMIT,
  VIDEO_LIMIT,
  WallpaperError,
  validCrop,
  type WallpaperCrop,
  type WallpaperRecord,
  type WallpaperStore,
} from './wallpaper-store.js';
import { decodeVideoWallpaper } from './wallpaper-video.js';
export interface WallpaperPlayback {
  state: 'playing' | 'paused' | 'poster' | 'inactive';
  reason?: string;
}
export interface WallpaperPreview {
  kind?: 'image' | 'video';
  poster?: Blob;
  posterUrl?: string;
  fallbackReason?: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  release(): void;
}
export interface WallpaperSnapshot {
  ready: boolean;
  revision: string;
  current?: {
    kind: 'image' | 'video';
    posterUrl?: string;
    fallbackReason?: string;
    size: number;
    width: number;
    height: number;
    crop: WallpaperCrop;
    url: string;
  };
  error?: string;
  playback?: WallpaperPlayback;
}
export async function decodeImageWallpaper(blob: Blob): Promise<WallpaperPreview> {
  if (!blob.size || blob.size > IMAGE_LIMIT) throw new WallpaperError('wallpaper-size-invalid');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = url;
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WallpaperError('wallpaper-decode-failed')), 15000);
      }),
    ]);
    if (!image.naturalWidth || !image.naturalHeight)
      throw new WallpaperError('wallpaper-decode-failed');
    return {
      kind: 'image',
      blob,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new WallpaperError('wallpaper-decode-failed');
  } finally {
    clearTimeout(timer);
    image.src = '';
  }
}
export async function decodeWallpaper(blob: Blob): Promise<WallpaperPreview> {
  if (
    !blob.size ||
    blob.size > VIDEO_LIMIT ||
    (blob.type.startsWith('image/') && blob.size > IMAGE_LIMIT)
  )
    throw new WallpaperError('wallpaper-size-invalid');
  if (blob.size <= IMAGE_LIMIT && !blob.type.startsWith('video/')) {
    try {
      return await decodeImageWallpaper(blob);
    } catch {}
  }
  return decodeVideoWallpaper(blob);
}
export class Wallpaper {
  #snapshot: WallpaperSnapshot = { ready: false, revision: 'empty' };
  #listeners = new Set<() => void>();
  #record: WallpaperRecord | undefined;
  #resource: WallpaperPreview | undefined;
  #serial: Promise<unknown> = Promise.resolve();
  #disposed = false;
  constructor(
    private store: WallpaperStore,
    private decode = decodeWallpaper,
  ) {}
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #emit(snapshot: WallpaperSnapshot) {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
  #run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#serial.then(async () => {
      if (this.#disposed) throw new WallpaperError('wallpaper-owner-disposed');
      try {
        return await operation();
      } catch (error) {
        const code = error instanceof WallpaperError ? error.code : 'wallpaper-storage-unavailable';
        this.#emit({ ...this.#snapshot, ready: true, error: code });
        throw new WallpaperError(code);
      }
    });
    this.#serial = result.catch(() => {});
    return result;
  }
  #accept(record: WallpaperRecord | undefined, resource?: WallpaperPreview) {
    if (this.#disposed) {
      resource?.release();
      return;
    }
    this.#resource?.release();
    this.#record = record;
    this.#resource = resource;
    this.#emit({
      ready: true,
      revision: record?.revision ?? 'empty',
      ...(record?.kind === 'video'
        ? {
            playback: {
              state: resource?.fallbackReason ? ('poster' as const) : ('inactive' as const),
              ...(resource?.fallbackReason ? { reason: resource.fallbackReason } : {}),
            },
          }
        : {}),
      ...(record && resource
        ? {
            current: {
              kind: record.kind,
              size: record.blob.size,
              width: record.width,
              height: record.height,
              crop: record.crop,
              url: resource.url,
              ...(resource.posterUrl ? { posterUrl: resource.posterUrl } : {}),
              ...(resource.fallbackReason ? { fallbackReason: resource.fallbackReason } : {}),
            },
          }
        : {}),
    });
  }
  refresh = () =>
    this.#run(async () => {
      const record = await this.store.read();
      if (
        this.#snapshot.ready &&
        record?.revision === this.#record?.revision &&
        !this.#snapshot.error
      )
        return this.#snapshot;
      let resource: WallpaperPreview | undefined;
      if (record) {
        try {
          resource = await this.decode(record.blob);
        } catch (error) {
          if (record.kind !== 'video' || !record.poster) throw error;
          const poster = await decodeImageWallpaper(record.poster);
          const url = URL.createObjectURL(record.blob);
          resource = {
            ...poster,
            kind: 'video',
            blob: record.blob,
            url,
            poster: record.poster,
            posterUrl: poster.url,
            width: record.width,
            height: record.height,
            fallbackReason:
              error instanceof WallpaperError ? error.code : 'wallpaper-video-decode-failed',
            release: () => {
              poster.release();
              URL.revokeObjectURL(url);
            },
          };
        }
      }
      if (this.#disposed) {
        resource?.release();
        return this.#snapshot;
      }
      this.#accept(record, resource);
      return this.#snapshot;
    });
  save(blob: Blob, crop: WallpaperCrop, expected: string, expiresAt = Infinity) {
    return this.#run(async () => {
      if (!validCrop(crop)) throw new WallpaperError('wallpaper-crop-invalid');
      const resource = await this.decode(blob);
      try {
        if (Date.now() > expiresAt || this.#disposed)
          throw new WallpaperError('appearance-request-stale');
        const record: WallpaperRecord = {
          version: 1,
          revision: crypto.randomUUID(),
          kind: resource.kind ?? 'image',
          ...(resource.poster ? { poster: resource.poster } : {}),
          blob,
          width: resource.width,
          height: resource.height,
          crop: { ...crop },
        };
        await this.store.replace(record, expected);
        this.#accept(record, resource);
        return this.describe();
      } catch (e) {
        resource.release();
        throw e;
      }
    });
  }
  crop(crop: WallpaperCrop, expected: string, expiresAt = Infinity) {
    return this.#run(async () => {
      if (!validCrop(crop)) throw new WallpaperError('wallpaper-crop-invalid');
      const record = await this.store.read();
      if (!record) throw new WallpaperError('wallpaper-missing');
      const next = { ...record, crop: { ...crop }, revision: crypto.randomUUID() };
      const resource = await this.decode(next.blob);
      try {
        if (Date.now() > expiresAt || this.#disposed)
          throw new WallpaperError('appearance-request-stale');
        await this.store.replace(next, expected);
        this.#accept(next, resource);
        return this.describe();
      } catch (error) {
        resource.release();
        throw error;
      }
    });
  }
  remove(expected: string, expiresAt = Infinity) {
    return this.#run(async () => {
      if (Date.now() > expiresAt || this.#disposed)
        throw new WallpaperError('appearance-request-stale');
      await this.store.replace(undefined, expected);
      this.#accept(undefined);
      return this.describe();
    });
  }
  setPlayback(playback: WallpaperPlayback) {
    if (this.#disposed || this.#record?.kind !== 'video') return;
    if (
      this.#snapshot.playback?.state === playback.state &&
      this.#snapshot.playback?.reason === playback.reason
    )
      return;
    this.#emit({ ...this.#snapshot, playback });
  }
  describe() {
    const { current, ...snapshot } = this.#snapshot;
    return {
      ...snapshot,
      ...(current
        ? {
            current: {
              kind: current.kind,
              size: current.size,
              width: current.width,
              height: current.height,
              crop: current.crop,
            },
          }
        : {}),
    };
  }
  previewCurrent() {
    if (!this.#record) throw new WallpaperError('wallpaper-missing');
    return this.decode(this.#record.blob);
  }
  dispose() {
    this.#disposed = true;
    this.#resource?.release();
    this.#listeners.clear();
    this.store.close();
  }
}
export { DEFAULT_CROP };

export const WALLPAPER_DB = 'botharness-wallpaper-v1';
export const IMAGE_LIMIT = 20 * 1024 * 1024;
export const VIDEO_LIMIT = 100 * 1024 * 1024;
export interface WallpaperCrop {
  x: number;
  y: number;
  zoom: number;
}
export interface WallpaperRecord {
  version: 1;
  revision: string;
  kind: 'image' | 'video';
  poster?: Blob;
  blob: Blob;
  width: number;
  height: number;
  crop: WallpaperCrop;
}
export class WallpaperError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const DEFAULT_CROP: WallpaperCrop = { x: 0.5, y: 0.5, zoom: 1 };
export function validCrop(value: unknown): value is WallpaperCrop {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const crop = value as Record<string, unknown>;
  return (
    Object.keys(crop).length === 3 &&
    ['x', 'y', 'zoom'].every(
      (key) => typeof crop[key] === 'number' && Number.isFinite(crop[key]),
    ) &&
    Number(crop.x) >= 0 &&
    Number(crop.x) <= 1 &&
    Number(crop.y) >= 0 &&
    Number(crop.y) <= 1 &&
    Number(crop.zoom) >= 1 &&
    Number(crop.zoom) <= 5
  );
}
export function validWallpaper(value: unknown): value is WallpaperRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as WallpaperRecord;
  return (
    v.version === 1 &&
    typeof v.revision === 'string' &&
    (v.kind === 'image' || v.kind === 'video') &&
    v.blob instanceof Blob &&
    v.blob.size > 0 &&
    v.blob.size <= (v.kind === 'video' ? VIDEO_LIMIT : IMAGE_LIMIT) &&
    (v.kind !== 'video' ||
      (v.poster instanceof Blob && v.poster.size > 0 && v.poster.size <= IMAGE_LIMIT)) &&
    Number.isFinite(v.width) &&
    v.width > 0 &&
    Number.isFinite(v.height) &&
    v.height > 0 &&
    validCrop(v.crop)
  );
}
export interface WallpaperStore {
  read(): Promise<WallpaperRecord | undefined>;
  replace(value: WallpaperRecord | undefined, expected: string): Promise<void>;
  close(): void;
}
export function createWallpaperStore(factory: IDBFactory | undefined): WallpaperStore {
  let opened: Promise<IDBDatabase> | undefined;
  let closed = false;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory || closed) {
        reject(new WallpaperError('wallpaper-storage-unavailable'));
        return;
      }
      const request = factory.open(WALLPAPER_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onerror = () => {
        opened = undefined;
        reject(new WallpaperError('wallpaper-storage-unavailable'));
      };
      let failed = false;
      request.onblocked = () => {
        failed = true;
        reject(new WallpaperError('wallpaper-storage-unavailable'));
      };
      request.onsuccess = () => {
        if (failed || closed) {
          request.result.close();
          opened = undefined;
          reject(new WallpaperError('wallpaper-storage-unavailable'));
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          opened = undefined;
        };
        resolve(request.result);
      };
    }));
  const transact = async (value?: {
    next: WallpaperRecord | undefined;
    expected: string;
  }): Promise<WallpaperRecord | undefined> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let current: WallpaperRecord | undefined;
      let failure: string | undefined;
      const tx = db.transaction('assets', value ? 'readwrite' : 'readonly');
      tx.oncomplete = () => resolve(value ? value.next : current);
      tx.onerror = tx.onabort = () =>
        reject(new WallpaperError(failure ?? 'wallpaper-storage-unavailable'));
      const store = tx.objectStore('assets');
      const request = store.get('current');
      request.onsuccess = () => {
        if (request.result !== undefined && !validWallpaper(request.result)) {
          failure = 'wallpaper-data-invalid';
          tx.abort();
          return;
        }
        current = request.result as WallpaperRecord | undefined;
        if (!value) return;
        if ((current?.revision ?? 'empty') !== value.expected) {
          failure = 'wallpaper-revision-conflict';
          tx.abort();
          return;
        }
        try {
          if (value.next) store.put(value.next, 'current');
          else store.delete('current');
        } catch {
          failure = 'wallpaper-storage-unavailable';
          tx.abort();
        }
      };
    });
  };
  return {
    read: () => transact(),
    replace: async (next, expected) => {
      await transact({ next, expected });
    },
    close: () => {
      closed = true;
      void opened?.then((db) => db.close()).catch(() => {});
      opened = undefined;
    },
  };
}
export function wallpaperPlacement(
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
  crop: WallpaperCrop,
) {
  const scale = Math.max(containerWidth / width, containerHeight / height) * crop.zoom;
  const w = width * scale,
    h = height * scale;
  return {
    width: w,
    height: h,
    left: Math.min(0, Math.max(containerWidth - w, containerWidth / 2 - crop.x * w)),
    top: Math.min(0, Math.max(containerHeight - h, containerHeight / 2 - crop.y * h)),
  };
}

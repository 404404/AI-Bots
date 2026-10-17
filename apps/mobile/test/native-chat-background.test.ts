import { beforeEach, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  root: 'file:///container-a',
  writeFailure: 'none' as 'none' | 'partial' | 'after',
  copyFailure: false,
}));
vi.mock('expo-file-system', () => {
  const join = (...parts: Array<string | { uri: string }>) =>
    parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(...parts);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return disk.files.has(this.uri);
    }
    get size() {
      return disk.files.get(this.uri)?.length ?? 0;
    }
    create() {
      disk.files.set(this.uri, '');
    }
    writeSync(body: string) {
      disk.files.set(this.uri, disk.writeFailure === 'partial' ? body.slice(0, 12) : body);
      if (disk.writeFailure !== 'none') throw Error('injected write failure');
    }
    textSync() {
      return disk.files.get(this.uri)!;
    }
    async text() {
      return this.textSync();
    }
    async copy(target: File) {
      disk.files.set(target.uri, 'normalized JPEG');
      if (disk.copyFailure) throw Error('copy failed');
    }
    delete() {
      disk.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(...parts);
    }
    get exists() {
      return disk.dirs.has(this.uri);
    }
    create() {
      disk.dirs.add(this.uri);
    }
    list() {
      return [...disk.files.keys()]
        .filter(
          (uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/'),
        )
        .map((uri) => new File(uri));
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get document() {
        return disk.root;
      },
    },
  };
});
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize() {},
      release() {},
      renderAsync: async () => ({
        width: 900,
        height: 1600,
        release() {},
        saveAsync: async () => {
          disk.files.set('file:///cache/photo.jpg', 'photo');
          return { uri: 'file:///cache/photo.jpg', width: 900, height: 1600 };
        },
      }),
    }),
  },
}));
import { createChatBackgrounds } from '../src/host/chat-background';
import { backgroundImageUri, nativeBackgroundPorts } from '../src/host/native-chat-background';

beforeEach(() => {
  disk.files.clear();
  disk.dirs.clear();
  disk.root = 'file:///container-a';
  disk.writeFailure = 'none';
  disk.copyFailure = false;
});

it('keeps the last complete native record across an interrupted write and a process restart', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const first = owner.edit();
  await first.pick('picker://photo');
  await first.save();
  const old = owner.resolve();
  const next = owner.edit();
  next.choose({ kind: 'color', color: '#abcdef' });
  disk.writeFailure = 'partial';
  await expect(next.save()).rejects.toThrow();
  expect(owner.resolve()).toEqual(old);
  const restarted = createChatBackgrounds(nativeBackgroundPorts());
  await restarted.ready;
  expect(restarted.resolve()).toEqual(old);
  expect([...disk.files.keys()].filter((key) => key.includes('/images/'))).toHaveLength(1);
  disk.writeFailure = 'none';
  await next.save();
  expect(owner.resolve()).toEqual({ kind: 'color', color: '#abcdef' });
});

it('reconciles a completed write error and rebases owned image references after container relocation', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const edit = owner.edit();
  await edit.pick('picker://photo');
  disk.writeFailure = 'after';
  await edit.save();
  const image = owner.resolve();
  expect(image.kind).toBe('image');
  if (image.kind !== 'image') throw Error('expected imported image');
  for (const [path, body] of [...disk.files]) {
    disk.files.delete(path);
    disk.files.set(path.replace('container-a', 'container-b'), body);
  }
  disk.dirs = new Set([...disk.dirs].map((path) => path.replace('container-a', 'container-b')));
  disk.root = 'file:///container-b';
  const restarted = createChatBackgrounds(nativeBackgroundPorts());
  await restarted.ready;
  expect(restarted.resolve()).toEqual(image);
  expect(disk.files.has(backgroundImageUri(image.id))).toBe(true);
});

it('rejects a failed native image copy and removes its partial owned file', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const edit = owner.edit();
  disk.copyFailure = true;
  await expect(edit.pick('picker://photo')).rejects.toThrow();
  expect(owner.resolve()).toEqual({ kind: 'default' });
  expect([...disk.files.keys()]).toEqual([]);
});

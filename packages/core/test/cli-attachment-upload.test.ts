import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { attachmentUploadInput } from '../src/bots/cli-attachment-upload.js';

describe('bounded local attachment selection', () => {
  it('rejects directories, symlinks, missing files, oversized files and malformed IDs before transport', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'attachment-selection-')));
    try {
      const file = join(root, 'qa.txt');
      const link = join(root, 'link.txt');
      writeFileSync(file, 'synthetic');
      symlinkSync(file, link);
      expect(() => attachmentUploadInput(root, undefined)).toThrow('regular file');
      expect(() => attachmentUploadInput(link, undefined)).toThrow('canonical regular file');
      expect(() => attachmentUploadInput(join(root, 'missing'), undefined)).toThrow('Cannot read');
      expect(() => attachmentUploadInput(file, '../escape')).toThrow('UUID-v4');
      const selected = attachmentUploadInput(file, undefined);
      expect(selected.bytes.toString()).toBe('synthetic');
      expect(selected.name).toBe('qa.txt');
      expect(selected.sha256).toMatch(/^[a-f0-9]{64}$/u);
      truncateSync(file, 25 * 1024 * 1024 + 1);
      expect(() => attachmentUploadInput(file, undefined)).toThrow('25 MiB');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

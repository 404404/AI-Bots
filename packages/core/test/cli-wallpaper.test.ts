import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runWallpaperCommand } from '../src/bots/cli-wallpaper.js';
const io = { env: {}, stdout: () => {}, stderr: () => {} };
describe('directed wallpaper CLI', () => {
  it('requires a Client and revision before reading or connecting', async () => {
    const connect = vi.fn();
    await expect(
      runWallpaperCommand(
        'wallpaper-import',
        [],
        { 'client-id': 'one', file: 'missing' },
        io,
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(runWallpaperCommand('wallpaper-get', [], {}, io, connect)).rejects.toMatchObject({
      code: 'usage',
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('reads CLI-local bytes and sends ordered bounded chunks, returning only the Client acknowledgment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wallpaper-cli-'));
    try {
      const bytes = Buffer.alloc(450000, 7);
      writeFileSync(join(dir, 'image.data'), bytes);
      let offset = 0;
      const received: Buffer[] = [];
      const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => {
        expect(body!.clientId).toBe('one');
        expect(body!.expectedRevision).toBe('empty');
        const op = body!.wallpaper as Record<string, unknown>;
        let reply: unknown = { wallpaper: { revision: 'saved' } };
        if (op.action === 'begin') reply = { uploadId: 'receipt', offset: 0 };
        if (op.action === 'append') {
          expect(op.offset).toBe(offset);
          const part = Buffer.from(String(op.data), 'base64');
          expect(part.length).toBeLessThanOrEqual(192 * 1024);
          received.push(part);
          offset += part.length;
          reply = { offset };
        }
        return { bytes: new TextEncoder().encode(JSON.stringify(reply)) };
      });
      const result = await runWallpaperCommand(
        'wallpaper-import',
        [],
        { 'client-id': 'one', 'expected-revision': 'empty', file: join(dir, 'image.data') },
        io,
        async () => ({ http }),
      );
      expect(Buffer.concat(received)).toEqual(bytes);
      expect(result).toEqual({ wallpaper: { revision: 'saved' } });
      expect(JSON.stringify(http.mock.calls)).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

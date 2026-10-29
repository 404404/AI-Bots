import { createHash } from 'node:crypto';
import { requireValue, text } from './errors.ts';
import { normalizeAvatarBase64 } from './avatar-codec.ts';

type Statement = {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
type AvatarDatabase = { prepare(sql: string): Statement };
export type AvatarStorage = {
  db: AvatarDatabase;
  transaction<T>(fn: () => T): T;
};

export type AvatarMetadata = {
  botId: string;
  revision: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

/** Included in the next standalone schema migration; uses no filesystem references. */
export const avatarSchemaSql = `
CREATE TABLE bot_avatars(
  bot_id TEXT PRIMARY KEY NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  revision TEXT NOT NULL CHECK(length(revision)=64),
  png BLOB NOT NULL CHECK(length(png)>0 AND length(png)<=327680),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 256),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 256),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

type AvatarRow = {
  bot_id: string;
  revision: string;
  png: Uint8Array;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
};

const now = () => new Date().toISOString();

function revision(value: unknown): string {
  requireValue(value === undefined || value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)), 'invalid-avatar-revision', '头像 revision 无效。');
  return value as string;
}

function metadata(row: Omit<AvatarRow, 'png'>): AvatarMetadata {
  return {
    botId: row.bot_id,
    revision: row.revision,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** SQLite BLOB store for the authenticated application layer to call after owner checks. */
export class AvatarStore {
  private readonly storage: AvatarStorage;
  constructor(storage: AvatarStorage) { this.storage = storage; }

  private botId(value: unknown) {
    const id = text(value, 'Bot ID', 64);
    const exists = this.storage.db.prepare('SELECT id FROM bots WHERE id=?').get(id);
    requireValue(exists, 'not-found', 'Bot 不存在。', 404);
    return id;
  }

  getMetadata(botId: unknown): AvatarMetadata | null {
    const id = this.botId(botId);
    const row = this.storage.db.prepare('SELECT bot_id,revision,width,height,created_at,updated_at FROM bot_avatars WHERE bot_id=?').get(id) as Omit<AvatarRow, 'png'> | undefined;
    return row ? metadata(row) : null;
  }

  read(botId: unknown) {
    const id = this.botId(botId);
    const row = this.storage.db.prepare('SELECT bot_id,revision,png,width,height,created_at,updated_at FROM bot_avatars WHERE bot_id=?').get(id) as AvatarRow | undefined;
    if (!row) return null;
    return { ...metadata(row), pngBase64: Buffer.from(row.png).toString('base64') };
  }

  set(botId: unknown, pngBase64: unknown, expectedRevision?: unknown): AvatarMetadata {
    const id = this.botId(botId);
    const expected = revision(expectedRevision);
    // Decode before taking the write lock. A failure cannot disturb the currently stored image.
    const normalized = normalizeAvatarBase64(pngBase64);
    const digest = createHash('sha256').update(normalized.png).digest('hex');
    const at = now();
    return this.storage.transaction(() => {
      const current = this.storage.db.prepare('SELECT bot_id,revision,width,height,created_at,updated_at FROM bot_avatars WHERE bot_id=?').get(id) as Omit<AvatarRow, 'png'> | undefined;
      if (expectedRevision !== undefined && expectedRevision !== null) {
        requireValue(current?.revision === expected, 'avatar-revision-conflict', '头像已更改，请先重新读取。', 409);
      } else if (expectedRevision === null) {
        requireValue(!current, 'avatar-revision-conflict', '头像已存在，请先重新读取。', 409);
      }
      const createdAt = current?.created_at ?? at;
      this.storage.db.prepare(`
        INSERT INTO bot_avatars(bot_id,revision,png,width,height,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(bot_id) DO UPDATE SET revision=excluded.revision,png=excluded.png,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at
      `).run(id, digest, normalized.png, normalized.width, normalized.height, createdAt, at);
      return { botId: id, revision: digest, width: normalized.width, height: normalized.height, createdAt, updatedAt: at };
    });
  }

  delete(botId: unknown, expectedRevision?: unknown): { deleted: boolean } {
    const id = this.botId(botId);
    const expected = revision(expectedRevision);
    return this.storage.transaction(() => {
      const current = this.storage.db.prepare('SELECT revision FROM bot_avatars WHERE bot_id=?').get(id) as { revision: string } | undefined;
      if (expectedRevision !== undefined && expectedRevision !== null)
        requireValue(current?.revision === expected, 'avatar-revision-conflict', '头像已更改，请先重新读取。', 409);
      else if (expectedRevision === null)
        requireValue(!current, 'avatar-revision-conflict', '头像已存在，请先重新读取。', 409);
      if (!current) return { deleted: false };
      this.storage.db.prepare('DELETE FROM bot_avatars WHERE bot_id=?').run(id);
      return { deleted: true };
    });
  }
}

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { requireValue } from './errors.ts';
import { unusedMainSlug } from './bot-identity.ts';

function transaction(db: DatabaseSync, fn: () => void) {
  db.exec('BEGIN IMMEDIATE');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createV1(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE bots(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, persona TEXT NOT NULL, config TEXT NOT NULL, credential TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE conversations(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE runs(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), request_key TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')), error_code TEXT, created_at TEXT NOT NULL, finished_at TEXT, model TEXT, memory TEXT, UNIQUE(conversation_id,request_key));
    CREATE UNIQUE INDEX one_active_run ON runs(conversation_id) WHERE status IN ('queued','running');
    CREATE TABLE messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), run_id TEXT NOT NULL REFERENCES runs(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(run_id,role));
    CREATE TABLE diagnostics(seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL, bot_id TEXT, run_id TEXT, code TEXT, duration_ms INTEGER, route TEXT, upstream_status INTEGER);
    CREATE TABLE auth_sessions(digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE oauth_credentials(bot_id TEXT PRIMARY KEY REFERENCES bots(id), credential TEXT NOT NULL);
  `);
}

/** Apply only known forward migrations. Every version transition commits atomically. */
export function migrate(db: DatabaseSync) {
  let version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  requireValue(Number.isInteger(version) && version >= 0 && version <= 2, 'schema-upgrade-required', '数据库版本不兼容。');
  if (version === 0) {
    transaction(db, () => {
      createV1(db);
      db.exec('PRAGMA user_version=1');
    });
    version = 1;
  }
  if (version === 1) {
    transaction(db, () => {
      db.exec(`
        ALTER TABLE bots ADD COLUMN config_revision INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE runs ADD COLUMN config_snapshot TEXT;
        ALTER TABLE runs ADD COLUMN config_revision INTEGER;
        CREATE TABLE main_bot(singleton INTEGER PRIMARY KEY CHECK(singleton=1), bot_id TEXT NOT NULL REFERENCES bots(id));
      `);
      const id = randomUUID();
      const at = new Date().toISOString();
      const slug = unusedMainSlug(db);
      db.prepare('INSERT INTO bots(id,slug,name,persona,config,created_at,updated_at,config_revision) VALUES(?,?,?,?,?,?,?,1)')
        .run(id, slug, 'Main Bot', 'Your primary Bot for direct work.', '{}', at, at);
      db.prepare('INSERT INTO main_bot(singleton,bot_id) VALUES(1,?)').run(id);
      db.exec('PRAGMA user_version=2');
    });
    version = 2;
  }
  requireValue(version === 2, 'schema-upgrade-required', '数据库版本不兼容。');
  const singleton = db.prepare('SELECT bot_id FROM main_bot WHERE singleton=1').get() as { bot_id?: string } | undefined;
  const rows = Number(db.prepare('SELECT count(*) AS n FROM main_bot').get()?.n);
  requireValue(rows === 1 && typeof singleton?.bot_id === 'string', 'main-bot-state-invalid', '主 Bot 身份记录损坏。', 500);
  requireValue(!!db.prepare('SELECT id FROM bots WHERE id=?').get(singleton.bot_id), 'main-bot-reference-missing', '主 Bot 身份引用的 Bot 不存在。', 500);
}

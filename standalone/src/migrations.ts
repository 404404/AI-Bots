import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { requireValue } from './errors.ts';
import { unusedMainSlug } from './bot-identity.ts';
import { avatarSchemaSql } from './avatars.ts';
import { browserSchemaSql } from './browser-service.ts';

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
  requireValue(Number.isInteger(version) && version >= 0 && version <= 7, 'schema-upgrade-required', '数据库版本不兼容。');
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
  if (version === 2) {
    transaction(db, () => {
      db.exec(`
        ALTER TABLE bots ADD COLUMN model_epoch INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE model_connections(
          id TEXT PRIMARY KEY,
          source_bot_id TEXT NOT NULL REFERENCES bots(id),
          source_model_epoch INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE TABLE connection_grants(
          connection_id TEXT NOT NULL REFERENCES model_connections(id),
          consumer_bot_id TEXT NOT NULL REFERENCES bots(id),
          created_at TEXT NOT NULL,
          revoked_at TEXT,
          PRIMARY KEY(connection_id, consumer_bot_id)
        );
        CREATE TABLE delegation_grants(
          main_bot_id TEXT NOT NULL REFERENCES bots(id),
          worker_bot_id TEXT NOT NULL REFERENCES bots(id),
          connection_id TEXT NOT NULL REFERENCES model_connections(id),
          created_at TEXT NOT NULL,
          revoked_at TEXT,
          PRIMARY KEY(main_bot_id, worker_bot_id)
        );
        CREATE TABLE tasks(
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT UNIQUE NOT NULL,
          root_id TEXT NOT NULL,
          parent_id TEXT REFERENCES tasks(id),
          initiator_bot_id TEXT NOT NULL REFERENCES bots(id),
          executor_bot_id TEXT NOT NULL REFERENCES bots(id),
          request_key TEXT NOT NULL,
          input_hash TEXT NOT NULL,
          input TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
          result TEXT,
          error_code TEXT,
          connection_id TEXT REFERENCES model_connections(id),
          config_revision INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT,
          deadline_at TEXT NOT NULL,
          UNIQUE(parent_id, request_key)
        );
        CREATE INDEX tasks_root_order ON tasks(root_id, seq);
        CREATE TABLE task_tool_calls(
          task_id TEXT NOT NULL REFERENCES tasks(id),
          tool_call_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          arguments_hash TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled')),
          result TEXT,
          error_code TEXT,
          created_at TEXT NOT NULL,
          finished_at TEXT,
          PRIMARY KEY(task_id, tool_call_id)
        );
        ALTER TABLE runs ADD COLUMN task_id TEXT REFERENCES tasks(id);
        ALTER TABLE tasks ADD COLUMN config_snapshot TEXT;
        ALTER TABLE tasks ADD COLUMN memory_snapshot TEXT;
        CREATE UNIQUE INDEX one_root_task_per_operation ON tasks(initiator_bot_id,request_key) WHERE parent_id IS NULL;
        PRAGMA user_version=3;
      `);
    });
    version = 3;
  }
  if (version === 3) {
    transaction(db, () => {
      db.exec(`ALTER TABLE main_bot ADD COLUMN connection_id TEXT REFERENCES model_connections(id);
        ALTER TABLE diagnostics ADD COLUMN task_id TEXT;
        PRAGMA user_version=4`);
    });
    version = 4;
  }
  if (version === 4) {
    transaction(db, () => {
      db.exec(`${avatarSchemaSql}\nPRAGMA user_version=5`);
    });
    version = 5;
  }
  if (version === 5) {
    transaction(db, () => {
      db.exec(`
        CREATE TABLE worker_management_policy(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
          allow_creation INTEGER NOT NULL CHECK(allow_creation IN (0,1)),
          allowed_worker_ids TEXT NOT NULL,
          allowed_connection_ids TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK(revision>=1),
          updated_at TEXT NOT NULL
        );
        INSERT INTO worker_management_policy(singleton,enabled,allow_creation,allowed_worker_ids,allowed_connection_ids,revision,updated_at)
          VALUES(1,0,0,'[]','[]',1,datetime('now'));
        CREATE TABLE worker_management_operations(
          operation_id TEXT PRIMARY KEY,
          root_task_id TEXT REFERENCES tasks(id),
          kind TEXT NOT NULL CHECK(kind IN ('create','update')),
          arguments_hash TEXT NOT NULL,
          bot_id TEXT NOT NULL REFERENCES bots(id),
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE worker_management_scope_targets(
          root_task_id TEXT NOT NULL REFERENCES tasks(id),
          bot_id TEXT NOT NULL REFERENCES bots(id),
          operation_id TEXT NOT NULL REFERENCES worker_management_operations(operation_id),
          created_at TEXT NOT NULL,
          PRIMARY KEY(root_task_id,bot_id)
        );
        PRAGMA user_version=6;
      `);
    });
    version = 6;
  }
  if (version === 6) {
    transaction(db, () => {
      db.exec(`${browserSchemaSql}\nPRAGMA user_version=7`);
    });
    version = 7;
  }
  requireValue(version === 7, 'schema-upgrade-required', '数据库版本不兼容。');
  const singleton = db.prepare('SELECT bot_id FROM main_bot WHERE singleton=1').get() as { bot_id?: string } | undefined;
  const rows = Number(db.prepare('SELECT count(*) AS n FROM main_bot').get()?.n);
  requireValue(rows === 1 && typeof singleton?.bot_id === 'string', 'main-bot-state-invalid', '主 Bot 身份记录损坏。', 500);
  requireValue(!!db.prepare('SELECT id FROM bots WHERE id=?').get(singleton.bot_id), 'main-bot-reference-missing', '主 Bot 身份引用的 Bot 不存在。', 500);
}

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { requireValue } from './errors.ts';
import { unusedMainSlug } from './bot-identity.ts';
import { avatarSchemaSql } from './avatars.ts';
import { browserSchemaSql } from './browser-service.ts';
import { GroupChatSql } from './group-chat.ts';

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
  const freshDatabase = version === 0;
  requireValue(Number.isInteger(version) && version >= 0 && version <= 10, 'schema-upgrade-required', '数据库版本不兼容。');
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
        ALTER TABLE bots ADD COLUMN kind TEXT NOT NULL DEFAULT 'employee' CHECK(kind IN ('employee','system'));
        ALTER TABLE runs ADD COLUMN config_snapshot TEXT;
        ALTER TABLE runs ADD COLUMN config_revision INTEGER;
        CREATE TABLE main_bot(singleton INTEGER PRIMARY KEY CHECK(singleton=1), bot_id TEXT NOT NULL REFERENCES bots(id));
      `);
      const id = randomUUID();
      const at = new Date().toISOString();
      const slug = unusedMainSlug(db);
      db.prepare('INSERT INTO bots(id,slug,name,persona,config,created_at,updated_at,config_revision,kind) VALUES(?,?,?,?,?,?,?,1,?)')
        .run(id, slug, 'Main Bot', 'Internal compatibility identity.', '{}', at, at, freshDatabase ? 'system' : 'employee');
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
  if (version === 7) {
    transaction(db, () => {
      db.exec(`CREATE TABLE private_chat_state(
        bot_id TEXT PRIMARY KEY REFERENCES bots(id),
        conversation_id TEXT REFERENCES conversations(id),
        selection_json TEXT,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version=8`);
    });
    version = 8;
  }
  if (version === 8) {
    transaction(db, () => {
      if (!(db.prepare('PRAGMA table_info(bots)').all() as {name:string}[]).some((column)=>column.name==='kind'))
        db.exec("ALTER TABLE bots ADD COLUMN kind TEXT NOT NULL DEFAULT 'employee' CHECK(kind IN ('employee','system'))");
      db.exec(`
        CREATE TABLE model_account(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          provider TEXT NOT NULL DEFAULT 'openai-codex',
          config_json TEXT NOT NULL DEFAULT '{}',
          credential TEXT,
          oauth_credential TEXT,
          verified_models TEXT NOT NULL DEFAULT '[]',
          verified_epoch INTEGER NOT NULL DEFAULT 1,
          epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch>=1),
          migration_state TEXT NOT NULL CHECK(migration_state IN ('ready','selection-required','not-configured')),
          selected_source_bot_id TEXT REFERENCES bots(id),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE contact_preferences(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          primary_bot_id TEXT REFERENCES bots(id),
          explicitly_selected INTEGER NOT NULL CHECK(explicitly_selected IN (0,1)),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE employee_onboarding(
          bot_id TEXT PRIMARY KEY REFERENCES bots(id),
          welcome_message_id TEXT NOT NULL REFERENCES messages(id),
          role_run_id TEXT REFERENCES runs(id),
          role_status TEXT NOT NULL CHECK(role_status IN ('pending','running','completed','failed')),
          role_error_code TEXT,
          request_key TEXT NOT NULL UNIQUE,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE employee_create_operations(
          operation_key TEXT PRIMARY KEY,
          input_hash TEXT NOT NULL,
          bot_id TEXT NOT NULL REFERENCES bots(id),
          created_at TEXT NOT NULL
        );
        PRAGMA user_version=9;
      `);
      const at = new Date().toISOString();
      const count = Number(db.prepare("SELECT count(*) AS n FROM bots WHERE kind='employee'").get()?.n ?? 0);
      const old = db.prepare(`SELECT o.bot_id,o.credential,b.config FROM oauth_credentials o
        JOIN bots b ON b.id=o.bot_id ORDER BY o.bot_id`).all() as {bot_id:string;credential:string;config:string}[];
      const validCandidates = old.filter((row) => {
        try { const config = JSON.parse(row.config); return config.provider === 'openai-codex' && typeof config.model === 'string' && config.model.length > 0; }
        catch { return false; }
      });
      const compatible = (db.prepare('SELECT id,config,credential FROM bots ORDER BY seq').all() as {id:string;config:string;credential:string|null}[]).filter((row) => {
        try { const config=JSON.parse(row.config); return config.provider !== 'openai-codex' && !!config.model && !!config.baseUrl && (!!row.credential || config.keyless === true); }
        catch { return false; }
      });
      const candidates = [...validCandidates.map((row) => ({bot_id:row.bot_id,credential:row.credential,config:row.config,provider:'openai-codex'})),
        ...compatible.map((row) => ({bot_id:row.id,credential:row.credential,config:row.config,provider:'compatible'}))];
      const state = candidates.length === 1 ? 'ready' : candidates.length > 1 ? 'selection-required' : 'not-configured';
      const adopted = candidates.length === 1 ? candidates[0] : null;
      db.prepare(`INSERT INTO model_account(singleton,provider,config_json,credential,oauth_credential,migration_state,selected_source_bot_id,updated_at)
        VALUES(1,?,?,?,?,?,?,?)`).run(adopted?.provider ?? 'openai-codex', adopted?.config ?? '{}',
          adopted?.provider === 'compatible' ? adopted?.credential ?? null : null,
          adopted?.provider === 'openai-codex' ? adopted?.credential ?? null : null, state, adopted?.bot_id ?? null, at);
      const primary = count === 1 ? (db.prepare("SELECT id FROM bots WHERE kind='employee' ORDER BY seq LIMIT 1").get() as {id:string}).id : null;
      db.prepare(`INSERT INTO contact_preferences(singleton,primary_bot_id,explicitly_selected,updated_at) VALUES(1,?,?,?)`)
        .run(primary, 0, at);
    });
    version = 9;
  }
  if (version === 9) {
    transaction(db, () => { db.exec(`${GroupChatSql}\nPRAGMA user_version=10`); });
    version = 10;
  }
  requireValue(version === 10, 'schema-upgrade-required', '数据库版本不兼容。');
  const singleton = db.prepare('SELECT bot_id FROM main_bot WHERE singleton=1').get() as { bot_id?: string } | undefined;
  const rows = Number(db.prepare('SELECT count(*) AS n FROM main_bot').get()?.n);
  requireValue(rows === 1 && typeof singleton?.bot_id === 'string', 'main-bot-state-invalid', '主 Bot 身份记录损坏。', 500);
  requireValue(!!db.prepare('SELECT id FROM bots WHERE id=?').get(singleton.bot_id), 'main-bot-reference-missing', '主 Bot 身份引用的 Bot 不存在。', 500);
}

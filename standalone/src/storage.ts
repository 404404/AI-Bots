import { DatabaseSync } from 'node:sqlite';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BotError, requireValue } from './errors.ts';

export class Storage {
  root: string;
  db: DatabaseSync;
  lease: DatabaseSync;
  key: Buffer;
  constructor(root: string) {
    process.umask(0o077);
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    requireValue(
      !lstatSync(this.root).isSymbolicLink(),
      'unsafe-data-directory',
      '数据目录不能是符号链接。',
    );
    chmodSync(this.root, 0o700);
    for (const name of ['owner.sqlite', 'bot.sqlite', 'secrets']) {
      const path = join(this.root, name);
      requireValue(
        !existsSync(path) || !lstatSync(path).isSymbolicLink(),
        'unsafe-data-directory',
        '数据文件和私密目录不能是符号链接。',
      );
    }
    this.lease = new DatabaseSync(join(this.root, 'owner.sqlite'));
    try {
      this.lease.exec(
        'PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE;',
      );
    } catch {
      this.lease.close();
      throw new BotError('data-directory-in-use', '数据目录已被其他进程占用。', 409);
    }
    const secretDir = join(this.root, 'secrets');
    mkdirSync(secretDir, { recursive: true, mode: 0o700 });
    chmodSync(secretDir, 0o700);
    const keyFile = join(secretDir, 'master.key');
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
    requireValue(
      !lstatSync(keyFile).isSymbolicLink(),
      'unsafe-key-file',
      '密钥文件不能是符号链接。',
    );
    chmodSync(keyFile, 0o600);
    this.key = readFileSync(keyFile);
    requireValue(this.key.length === 32, 'invalid-key-file', '本机密钥文件无效。');
    this.db = new DatabaseSync(join(this.root, 'bot.sqlite'));
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;',
    );
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
    requireValue(version === 0 || version === 1, 'schema-upgrade-required', '数据库版本不兼容。');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bots(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, persona TEXT NOT NULL, config TEXT NOT NULL, credential TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), request_key TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')), error_code TEXT, created_at TEXT NOT NULL, finished_at TEXT, model TEXT, memory TEXT, UNIQUE(conversation_id,request_key));
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(conversation_id) WHERE status IN ('queued','running');
      CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), run_id TEXT NOT NULL REFERENCES runs(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(run_id,role));
      CREATE TABLE IF NOT EXISTS diagnostics(seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL, bot_id TEXT, run_id TEXT, code TEXT, duration_ms INTEGER, route TEXT, upstream_status INTEGER);
      CREATE TABLE IF NOT EXISTS auth_sessions(digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_credentials(bot_id TEXT PRIMARY KEY REFERENCES bots(id), credential TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
    for (const file of ['owner.sqlite', 'bot.sqlite']) chmodSync(join(this.root, file), 0o600);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  encrypt(value: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
  }
  decrypt(value: string): string {
    const bytes = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
  }
  cursor(scope: string, after: number): string {
    const payload = Buffer.from(JSON.stringify({ v: 1, scope, after })).toString('base64url');
    const mac = createHmac('sha256', this.key).update(payload).digest('base64url');
    return `${payload}.${mac}`;
  }
  after(cursor: unknown, scope: string): number {
    if (cursor === undefined || cursor === null || cursor === '') return 0;
    try {
      if (typeof cursor !== 'string' || cursor.length > 1024) throw new Error();
      const [payload, mac, extra] = cursor.split('.');
      const expected = createHmac('sha256', this.key).update(payload).digest();
      const actual = Buffer.from(mac ?? '', 'base64url');
      if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error();
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (
        data.v !== 1 ||
        data.scope !== scope ||
        !Number.isSafeInteger(data.after) ||
        data.after < 0
      )
        throw new Error();
      return data.after;
    } catch {
      throw new BotError('invalid-cursor', '分页游标无效，请从第一页重新读取。');
    }
  }
  close() {
    this.db.close();
    this.lease.exec('ROLLBACK');
    this.lease.close();
    this.key.fill(0);
  }
}

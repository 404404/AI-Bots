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
import { migrate } from './migrations.ts';

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
    try {
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
      migrate(this.db);
      for (const file of ['owner.sqlite', 'bot.sqlite']) chmodSync(join(this.root, file), 0o600);
    } catch (error) {
      if (this.db) this.db.close();
      (this as { key?: Buffer }).key?.fill(0);
      try {
        this.lease.exec('ROLLBACK');
      } catch {}
      try {
        this.lease.close();
      } catch {}
      throw error;
    }
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

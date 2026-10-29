import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ModelConfig } from './model.ts';
import type { Storage } from './storage.ts';
import { BotError, requireValue } from './errors.ts';

export type ConnectionReference = {
  id: string;
  sourceBotId: string;
  consumerBotId: string;
  modelEpoch: number;
  provider: string;
  model: string;
  status: 'available' | 'revoked' | 'changed' | 'unconfigured';
  createdAt: string;
  revokedAt: string | null;
};

/** Owner-issued references point at an existing connection; credentials remain at the source. */
export class ConnectionResolver {
  storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }

  issue(sourceBotId: string, consumerBotId: string, at: string) {
    const db = this.storage.db;
    const source = db.prepare('SELECT model_epoch FROM bots WHERE id=?').get(sourceBotId) as
      | { model_epoch: number }
      | undefined;
    const consumer = db.prepare('SELECT id FROM bots WHERE id=?').get(consumerBotId);
    requireValue(source && consumer, 'not-found', '连接来源或使用者 Bot 不存在。', 404);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO model_connections(id,source_bot_id,source_model_epoch,created_at) VALUES(?,?,?,?)',
    ).run(id, sourceBotId, source.model_epoch, at);
    db.prepare(
      'INSERT INTO connection_grants(connection_id,consumer_bot_id,created_at) VALUES(?,?,?)',
    ).run(id, consumerBotId, at);
    return id;
  }

  status(id: string, consumerBotId: string): ConnectionReference {
    const row = this.storage.db.prepare(`
      SELECT c.id,c.source_bot_id,c.source_model_epoch,c.created_at,c.revoked_at AS reference_revoked,
        g.revoked_at AS grant_revoked,b.model_epoch,b.config,b.credential,o.credential AS oauth
      FROM model_connections c
      JOIN connection_grants g ON g.connection_id=c.id AND g.consumer_bot_id=?
      JOIN bots b ON b.id=c.source_bot_id
      LEFT JOIN oauth_credentials o ON o.bot_id=b.id WHERE c.id=?
    `).get(consumerBotId, id) as {
      id: string; source_bot_id: string; source_model_epoch: number; created_at: string; reference_revoked: string | null;
      grant_revoked: string | null; model_epoch: number; config: string; credential: string | null; oauth: string | null;
    } | undefined;
    requireValue(row, 'connection-not-found', '模型连接引用不存在或未授予此 Bot。', 404);
    const model = JSON.parse(row.config) as ModelConfig;
    const status: ConnectionReference['status'] = row.reference_revoked || row.grant_revoked
      ? 'revoked'
      : row.model_epoch !== row.source_model_epoch
        ? 'changed'
        : !model.model || (model.provider === 'openai-codex' ? !row.oauth : !row.credential && !model.keyless)
          ? 'unconfigured'
          : 'available';
    return {
      id: row.id,
      sourceBotId: row.source_bot_id,
      consumerBotId,
      modelEpoch: row.source_model_epoch,
      provider: model.provider ?? 'compatible',
      model: model.model ?? '',
      status,
      createdAt: row.created_at,
      revokedAt: row.reference_revoked ?? row.grant_revoked,
    };
  }

  resolve(id: string, consumerBotId: string): { sourceBotId: string; sourceModelEpoch: number; config: ModelConfig; credential: string | null } {
    const status = this.status(id, consumerBotId);
    requireValue(status.status === 'available', `connection-${status.status}`, '共享模型连接已不可用，请所有者重新授权。', 409);
    const row = this.storage.db.prepare(`
      SELECT b.id,b.config,b.credential FROM model_connections c
      JOIN connection_grants g ON g.connection_id=c.id AND g.consumer_bot_id=? AND g.revoked_at IS NULL
      JOIN bots b ON b.id=c.source_bot_id
      WHERE c.id=? AND c.revoked_at IS NULL AND c.source_model_epoch=b.model_epoch
    `).get(consumerBotId, id) as { id: string; config: string; credential: string | null } | undefined;
    requireValue(row, 'connection-changed', '共享模型连接已变化，请所有者重新授权。', 409);
    return { sourceBotId: row.id, sourceModelEpoch: status.modelEpoch, config: JSON.parse(row.config), credential: row.credential };
  }

  catalogPage(consumerBotId: string | undefined, after: { createdAt: string; id: string } | null, limit: number) {
    const filters: string[] = [];
    const values: (string | number)[] = [];
    if (consumerBotId) { filters.push('g.consumer_bot_id=?'); values.push(consumerBotId); }
    if (after) {
      filters.push('(c.created_at>? OR (c.created_at=? AND c.id>?))');
      values.push(after.createdAt, after.createdAt, after.id);
    }
    const rows = this.storage.db.prepare(`
      SELECT c.id,c.created_at,g.consumer_bot_id FROM model_connections c
      JOIN connection_grants g ON g.connection_id=c.id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY c.created_at,c.id LIMIT ?
    `).all(...values, limit) as { id: string; created_at: string; consumer_bot_id: string }[];
    return rows.map((row) => this.status(row.id, row.consumer_bot_id));
  }
}

export function bumpModelEpoch(db: DatabaseSync, botId: string) {
  db.prepare('UPDATE bots SET model_epoch=model_epoch+1 WHERE id=?').run(botId);
}

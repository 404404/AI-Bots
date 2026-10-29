import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { BotError, requireValue } from './errors.ts';

export function unusedMainSlug(db: DatabaseSync): string {
  const base = 'main-bot';
  if (!db.prepare('SELECT id FROM bots WHERE slug=?').get(base)) return base;
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = `${base}-${randomUUID().slice(0, 8)}`;
    if (!db.prepare('SELECT id FROM bots WHERE slug=?').get(candidate)) return candidate;
  }
  throw new BotError('main-bot-slug-unavailable', '无法分配主 Bot 标识。', 500);
}

export function mainBotId(db: DatabaseSync): string {
  const row = db.prepare('SELECT bot_id FROM main_bot WHERE singleton=1').get() as { bot_id?: string } | undefined;
  requireValue(typeof row?.bot_id === 'string', 'main-bot-state-invalid', '主 Bot 身份记录损坏。', 500);
  requireValue(!!db.prepare('SELECT id FROM bots WHERE id=?').get(row.bot_id), 'main-bot-reference-missing', '主 Bot 身份引用的 Bot 不存在。', 500);
  return row.bot_id;
}

export function isMainBot(db: DatabaseSync, botId: string): boolean {
  return mainBotId(db) === botId;
}

export function mainCatalog(db: DatabaseSync, codexReady: (botId: string) => boolean) {
  const mainId = mainBotId(db);
  const bots = db
    .prepare('SELECT * FROM bots ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END, seq')
    .all(mainId) as {
    id: string;
    slug: string;
    name: string;
    persona: string;
    config: string;
    credential: string | null;
    config_revision: number;
  }[];
  const recent = new Map(
    (
      db
        .prepare('SELECT bot_id, status FROM runs WHERE seq IN (SELECT MAX(seq) FROM runs GROUP BY bot_id)')
        .all() as { bot_id: string; status: string }[]
    ).map((row) => [row.bot_id, row.status]),
  );
  return {
    mainBotId: mainId,
    items: bots.map((row) => {
      const model = JSON.parse(row.config);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: row.id === mainId ? 'main' : 'work',
        persona: row.persona,
        configRevision: row.config_revision,
        modelProvider: model.provider ?? (model.baseUrl ? 'compatible' : 'unconfigured'),
        modelConfigured: !!model.model && (model.provider === 'openai-codex' || !!model.baseUrl),
        credentialConfigured:
          model.provider === 'openai-codex' ? codexReady(row.id) : !!row.credential || model.keyless === true,
        canShareOwnConnection: !!model.model && (model.provider === 'openai-codex' || !!model.baseUrl) &&
          (model.provider === 'openai-codex' ? codexReady(row.id) : !!row.credential || model.keyless === true),
        capabilities: ['identity', 'model-settings', 'chat', 'conversation-history', 'saved-file-memory'],
        executionStatus: recent.get(row.id) ?? 'idle',
      };
    }),
  };
}

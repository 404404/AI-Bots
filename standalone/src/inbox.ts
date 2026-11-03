import type { Storage } from './storage.ts';
import { BotError, requireValue, text } from './errors.ts';

type ConversationType = 'private' | 'group';
type Cursor = { pinned: number; activityAt: string; type: ConversationType; id: string };

/** Unified read model over the canonical private and group message tables. */
export class Inbox {
  readonly storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }

  private parseType(value: unknown): ConversationType {
    requireValue(value === 'private' || value === 'group', 'invalid-conversation-type', '会话类型无效。');
    return value;
  }

  private rows(after: Cursor | null, limit: number) {
    const afterSql = after ? `WHERE
      COALESCE(st.pinned,0) < ? OR
      (COALESCE(st.pinned,0)=? AND COALESCE(s.last_at,s.created_at) < ?) OR
      (COALESCE(st.pinned,0)=? AND COALESCE(s.last_at,s.created_at)=? AND s.type > ?) OR
      (COALESCE(st.pinned,0)=? AND COALESCE(s.last_at,s.created_at)=? AND s.type=? AND s.id > ?)` : '';
    const args = after
      ? [after.pinned, after.pinned, after.activityAt, after.pinned, after.activityAt, after.type,
        after.pinned, after.activityAt, after.type, after.id, limit]
      : [limit];
    return this.storage.db.prepare(`
      WITH sessions AS (
        SELECT 'private' AS type,c.id AS id,b.name AS title,c.bot_id AS bot_id,NULL AS group_id,
          c.created_at AS created_at,
          (SELECT m.id FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_id,
          (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_at,
          (SELECT m.content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_content,
          (SELECT CASE m.role WHEN 'assistant' THEN 'bot' ELSE 'user' END FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_sender_type,
          (SELECT CASE m.role WHEN 'assistant' THEN b.name ELSE '你' END FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_sender_name,
          (SELECT m.seq FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_seq
        FROM conversations c JOIN bots b ON b.id=c.bot_id
        UNION ALL
        SELECT 'group',g.id,g.name,NULL,g.id,g.created_at,
          (SELECT m.id FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1),
          (SELECT m.created_at FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1),
          (SELECT m.content FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1),
          (SELECT m.sender_type FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1),
          (SELECT m.sender_name FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1),
          (SELECT m.seq FROM chat_group_messages m WHERE m.group_id=g.id ORDER BY m.seq DESC LIMIT 1)
        FROM chat_groups g
      )
      SELECT s.*,COALESCE(st.pinned,0) AS pinned,COALESCE(st.read_through_seq,0) AS read_through_seq,
        COALESCE(s.last_at,s.created_at) AS activity_at,
        COALESCE(st.read_through_seq,0) AS read_seq,
        CASE s.type WHEN 'private' THEN
          (SELECT count(*) FROM messages m WHERE m.conversation_id=s.id AND m.role='assistant' AND m.seq>COALESCE(st.read_through_seq,0))
        ELSE
          (SELECT count(*) FROM chat_group_messages m WHERE m.group_id=s.id AND m.sender_type='bot' AND m.seq>COALESCE(st.read_through_seq,0))
        END AS unread_count
      FROM sessions s LEFT JOIN inbox_session_state st ON st.conversation_type=s.type AND st.conversation_id=s.id
      ${afterSql}
      ORDER BY COALESCE(st.pinned,0) DESC,COALESCE(s.last_at,s.created_at) DESC,s.type ASC,s.id ASC
      LIMIT ?
    `).all(...args) as Array<Record<string, any>>;
  }

  list(params: { limit?: unknown; cursor?: unknown } = {}) {
    const limit = params.limit === undefined ? 50 : Number(params.limit);
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'invalid-limit', '分页大小应为 1–100。');
    const scope = 'inbox:list:v1';
    const encoded = this.storage.keysetAfter(params.cursor, scope);
    let after: Cursor | null = null;
    if (encoded) {
      try {
        const parsed = JSON.parse(encoded) as Partial<Cursor>;
        requireValue(Number.isInteger(parsed.pinned) && (parsed.pinned === 0 || parsed.pinned === 1) &&
          typeof parsed.activityAt === 'string' && (parsed.type === 'private' || parsed.type === 'group') &&
          typeof parsed.id === 'string', 'invalid-cursor', '收件箱游标无效。');
        after = parsed as Cursor;
      } catch { throw new BotError('invalid-cursor', '收件箱游标无效，请重新读取。'); }
    }
    const page = this.rows(after, limit + 1).map((row) => ({
      type: row.type as ConversationType, id: row.id as string, title: row.title as string,
      botId: row.bot_id as string | null, groupId: row.group_id as string | null,
      createdAt: row.created_at as string, lastId: row.last_id as string | null,
      lastAt: row.last_at as string | null, lastContent: row.last_content as string | null,
      lastSenderType: row.last_sender_type as string | null, lastSenderName: row.last_sender_name as string | null,
      lastSeq: row.last_seq as number | null, activityAt: row.activity_at as string,
      pinned: Number(row.pinned) === 1, readSeq: Number(row.read_seq), unreadCount: Number(row.unread_count),
    }));
    const hasMore = page.length > limit, selected = page.slice(0, limit);
    const items = selected.map((item) => {
      const read = item.readSeq > 0 ? this.messageAt(item.type, item.id, item.readSeq) : null;
      return {
        key: `${item.type}:${item.id}`, type: item.type, id: item.id, title: item.title,
        ...(item.botId ? { botId: item.botId } : {}), ...(item.groupId ? { groupId: item.groupId } : {}),
        participants: item.type === 'private' ? [{ botId: item.botId, name: item.title }] : this.groupParticipants(item.id),
        lastMessage: item.lastId ? { id: item.lastId, createdAt: item.lastAt, content: item.lastContent,
          senderType: item.lastSenderType, senderId: item.lastSenderType === 'bot' ? this.senderId(item.type, item.lastId) : 'user',
          senderName: item.lastSenderName } : null,
        pinned: item.pinned, unreadCount: item.unreadCount,
        unreadCursor: read ? { createdAt: read.created_at, id: read.id } : null,
      };
    });
    const tail = selected.at(-1);
    const nextCursor = hasMore && tail ? this.storage.keysetCursor(scope, JSON.stringify({
      pinned: Number(tail.pinned), activityAt: tail.activityAt, type: tail.type, id: tail.id,
    } satisfies Cursor)) : null;
    const startChats = (this.storage.db.prepare(`SELECT b.id AS bot_id,b.name FROM bots b
      WHERE b.kind='employee' AND NOT EXISTS(SELECT 1 FROM conversations c WHERE c.bot_id=b.id)
      ORDER BY b.name,b.id`).all() as { bot_id: string; name: string }[])
      .map((bot) => ({ botId: bot.bot_id, name: bot.name }));
    return { items, startChats, hasMore, nextCursor };
  }

  private messageAt(type: ConversationType, id: string, seq: number) {
    const table = type === 'private' ? 'messages' : 'chat_group_messages';
    const scopeColumn = type === 'private' ? 'conversation_id' : 'group_id';
    return this.storage.db.prepare(`SELECT id,created_at FROM ${table} WHERE ${scopeColumn}=? AND seq=?`).get(id, seq) as
      { id: string; created_at: string } | undefined ?? null;
  }

  private senderId(type: ConversationType, messageId: string) {
    if (type === 'private') return (this.storage.db.prepare('SELECT bot_id FROM messages WHERE id=?').get(messageId) as { bot_id: string }).bot_id;
    return (this.storage.db.prepare('SELECT sender_id FROM chat_group_messages WHERE id=?').get(messageId) as { sender_id: string }).sender_id;
  }

  private groupParticipants(groupId: string) {
    return this.storage.db.prepare(`SELECT m.bot_id AS botId,b.name FROM chat_group_members m JOIN bots b ON b.id=m.bot_id
      WHERE m.group_id=? AND m.active=1 ORDER BY m.added_at,m.bot_id`).all(groupId) as { botId: string; name: string }[];
  }

  pin(input: { type: unknown; id: unknown; pinned: unknown }) {
    const type = this.parseType(input.type), id = text(input.id, '会话 ID', 64);
    requireValue(typeof input.pinned === 'boolean', 'invalid-pinned-state', '置顶状态无效。');
    this.assertSession(type, id);
    this.storage.db.prepare(`INSERT INTO inbox_session_state(conversation_type,conversation_id,pinned,read_through_seq,updated_at)
      VALUES(?,?,?,0,?) ON CONFLICT(conversation_type,conversation_id) DO UPDATE SET pinned=excluded.pinned,updated_at=excluded.updated_at`)
      .run(type, id, input.pinned ? 1 : 0, new Date().toISOString());
    return { type, id, pinned: input.pinned };
  }

  read(input: { type: unknown; id: unknown; through: unknown }) {
    const type = this.parseType(input.type), id = text(input.id, '会话 ID', 64);
    requireValue(input.through && typeof input.through === 'object' && !Array.isArray(input.through),
      'invalid-read-cursor', '已读位置无效。');
    const through = input.through as Record<string, unknown>;
    const messageId = text(through.id, '消息 ID', 64), createdAt = text(through.createdAt, '消息时间', 40);
    this.assertSession(type, id);
    const table = type === 'private' ? 'messages' : 'chat_group_messages';
    const scopeColumn = type === 'private' ? 'conversation_id' : 'group_id';
    const message = this.storage.db.prepare(`SELECT seq,created_at FROM ${table} WHERE ${scopeColumn}=? AND id=?`).get(id, messageId) as
      { seq: number; created_at: string } | undefined;
    requireValue(message && message.created_at === createdAt, 'invalid-read-cursor', '已读位置不是此会话中的真实消息。', 409);
    this.storage.transaction(() => {
      const prior = this.storage.db.prepare('SELECT read_through_seq FROM inbox_session_state WHERE conversation_type=? AND conversation_id=?').get(type, id) as
        { read_through_seq: number } | undefined;
      requireValue(!prior || message.seq >= prior.read_through_seq, 'read-cursor-regression', '已读位置不能倒退。', 409);
      this.storage.db.prepare(`INSERT INTO inbox_session_state(conversation_type,conversation_id,pinned,read_through_seq,updated_at)
        VALUES(?,?,0,?,?) ON CONFLICT(conversation_type,conversation_id) DO UPDATE SET read_through_seq=excluded.read_through_seq,updated_at=excluded.updated_at`)
        .run(type, id, message.seq, new Date().toISOString());
    });
    return { type, id, unreadCursor: { createdAt: message.created_at, id: messageId } };
  }

  private assertSession(type: ConversationType, id: string) {
    const exists = type === 'private'
      ? this.storage.db.prepare('SELECT id FROM conversations WHERE id=?').get(id)
      : this.storage.db.prepare('SELECT id FROM chat_groups WHERE id=?').get(id);
    requireValue(exists, 'conversation-not-found', '会话不存在。', 404);
  }
}

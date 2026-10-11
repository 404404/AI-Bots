import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { MessagingError } from './provider.js';
import type { BehaviorPermission, BehaviorChoices } from './behavior-policy.js';
export { resolveBehaviorPermissions } from './behavior-policy.js';
export type {
  BehaviorPermission,
  BehaviorChoices,
  EffectiveBehaviorPermission,
} from './behavior-policy.js';

const itemFields = {
  name: z.string().trim().min(1).max(80),
  behavior: z.string().trim().min(1).max(1000),
};
export const behaviorPermissionInputs = [
  z.object({ kind: z.literal('create-behavior-permission'), ...itemFields }).strict(),
  z
    .object({
      kind: z.literal('edit-behavior-permission'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      ...itemFields,
    })
    .strict(),
  z
    .object({
      kind: z.literal('delete-behavior-permission'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
] as const;
const inputSchema = z.discriminatedUnion('kind', behaviorPermissionInputs);
export function behaviorPermissions(db: DatabaseSync, botSlug: string): BehaviorPermission[] {
  return (
    db
      .prepare('SELECT body FROM messaging_behavior_permissions WHERE bot_slug = ? ORDER BY rowid')
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as BehaviorPermission);
}
export function changeBehaviorPermission(
  db: DatabaseSync,
  botSlug: string,
  raw: z.infer<typeof inputSchema>,
): void {
  const input = inputSchema.parse(raw);
  const items = behaviorPermissions(db, botSlug);
  const previous =
    input.kind === 'create-behavior-permission'
      ? undefined
      : items.find((item) => item.id === input.id);
  if (
    input.kind !== 'create-behavior-permission' &&
    (!previous || previous.revision !== input.expectedRevision)
  )
    throw new MessagingError('behavior-permission-stale');
  if (input.kind === 'delete-behavior-permission') {
    const references = (
      db
        .prepare('SELECT body FROM messaging_permission_groups WHERE bot_slug = ?')
        .all(botSlug) as { body: string }[]
    ).map((row) => JSON.parse(row.body) as BehaviorChoices);
    if (
      references.some((group) =>
        [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(input.id),
      )
    )
      throw new MessagingError('behavior-permission-in-use');
    db.prepare('DELETE FROM messaging_behavior_permissions WHERE id = ? AND bot_slug = ?').run(
      input.id,
      botSlug,
    );
    return;
  }
  if (!previous && items.length >= 50) throw new MessagingError('behavior-permission-capacity');
  if (
    items.some(
      (item) =>
        item.id !== previous?.id &&
        item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    )
  )
    throw new MessagingError('behavior-permission-name');
  const at = new Date().toISOString();
  const item: BehaviorPermission = {
    id: previous?.id ?? randomUUID(),
    botSlug,
    name: input.name,
    behavior: input.behavior,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? at,
    updatedAt: at,
  };
  db.prepare(
    'INSERT INTO messaging_behavior_permissions (id, bot_slug, body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body',
  ).run(item.id, botSlug, JSON.stringify(item));
}

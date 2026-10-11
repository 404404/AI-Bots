import type { DatabaseSync } from 'node:sqlite';
import {
  behaviorConfigurationConflicts,
  type BehaviorGroup,
  type BehaviorMember,
  type BehaviorPermission,
} from './behavior-policy.js';
import { MessagingError } from './provider.js';

export function assertBehaviorCompatibility(
  db: DatabaseSync,
  botSlug: string,
  items: BehaviorPermission[],
  proposedGroups?: BehaviorGroup[],
): void {
  const groups =
    proposedGroups ??
    (
      db
        .prepare('SELECT body FROM messaging_permission_groups WHERE bot_slug = ?')
        .all(botSlug) as { body: string }[]
    ).map((row) => JSON.parse(row.body) as BehaviorGroup);
  const members = (
    db
      .prepare(
        "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND purpose = 'conversation' AND status = 'approved'",
      )
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as BehaviorMember);
  if (behaviorConfigurationConflicts(items, groups, members).length)
    throw new MessagingError('behavior-permission-conflict');
}

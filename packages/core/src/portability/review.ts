import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { ProfileBackupError } from './files.js';

export interface ProfileBackupReviewContext {
  readonly sessionId: string;
  readonly sourceEventIds: readonly string[];
  readonly callIds?: readonly string[];
}

const authorityTables = [
  'persona_bots',
  'persona_bot_deletions',
  'persona_bot_memory_ownership',
  'model_presets',
  'workspace_grants',
  'tool_approval_rules',
  'bot_assignment_access',
  'bot_schedules',
  'bot_secret_mcp_enabled',
  'bot_secret_mcp_servers',
  'bot_source_policy_revisions',
  'group_send_review_enabled',
  'channel_human_members',
  'channel_human_nicknames',
  'local_human_names',
  'roster_arrangement',
  'attachment_file_bindings',
  'memory_accepted_commits',
  'memory_accepted_heads',
  'messaging_behavior_permissions',
  'messaging_bindings',
  'messaging_conversation_blocks',
  'messaging_conversation_ingests',
  'messaging_external_roles',
  'messaging_grants',
  'messaging_default_revisions',
  'messaging_group_policy_revisions',
  'messaging_held_conversations',
  'messaging_managed_files',
  'messaging_pairings',
  'messaging_permission_groups',
  'messaging_sender_policies',
  'messaging_source_paths',
  'messaging_thread_policy_revisions',
  'paired_devices',
  'device_pairing_host',
  'push_devices',
  'profile_recovery',
  'profile_recovery_bots',
  'tob_identity',
] as const;

export function profileBackupReviewDatabase(
  database: OperationalDatabaseOwner,
  context?: ProfileBackupReviewContext,
) {
  return attachOperationalModule(database, 'profile-backup').read((db) => {
    const excluded = new Set<string>();
    const exportReviews = new Set<string>();
    let reviewBot: string | undefined;
    if (context) {
      const owner = db
        .prepare('SELECT bot_slug, root_role FROM session_ownership WHERE session_id = ?')
        .get(context.sessionId);
      if (!owner || owner.root_role !== 'orchestrator' || context.sourceEventIds.length === 0)
        throw new ProfileBackupError('invalid-input', 'Review execution context is unavailable');
      reviewBot = String(owner.bot_slug);
      for (const id of context.sourceEventIds) {
        const accepted = db
          .prepare(
            'SELECT source_kind, bot_slug, channel_id FROM source_events WHERE source_event_id = ?',
          )
          .get(id);
        if (
          accepted?.source_kind !== 'human-message' ||
          accepted.bot_slug !== owner.bot_slug ||
          accepted.channel_id !== 'dm-' + owner.bot_slug
        )
          throw new ProfileBackupError(
            'invalid-input',
            'Review source does not belong to the captured Human DM',
          );
        for (const row of db
          .prepare(
            'SELECT e.source_event_id, e.message_id, e.payload_json FROM channel_output_origins o JOIN source_events e ON e.source_event_id = o.source_event_id WHERE o.session_id = ? AND o.request_source_event_id = ? AND e.bot_slug = ?',
          )
          .all(context.sessionId, id, String(owner.bot_slug))) {
          excluded.add(String(row.source_event_id));
          const payload = JSON.parse(String(row.payload_json));
          if (payload.toolApprovalRequest?.toolName === 'deepseekbot profile-backup-export')
            exportReviews.add(String(row.message_id));
        }
      }
    }
    const allSources = db
      .prepare(
        'SELECT source_event_id, source_kind, bot_slug, channel_id, message_id, assignment_session_id, body, created_at, payload_json FROM source_events',
      )
      .all();
    for (const row of allSources) {
      const payload = JSON.parse(String(row.payload_json));
      const review = payload.toolApprovalRequest;
      if (
        context &&
        row.source_kind === 'bot-message' &&
        row.bot_slug === reviewBot &&
        row.channel_id === 'dm-' + reviewBot &&
        review?.sessionId === context.sessionId &&
        review.toolName === 'deepseekbot profile-backup-export' &&
        context.callIds?.includes(review.callId)
      ) {
        excluded.add(String(row.source_event_id));
        exportReviews.add(String(row.message_id));
      }
    }
    const sources = allSources.filter((row) => {
      if (excluded.has(String(row.source_event_id))) return false;
      const payload = JSON.parse(String(row.payload_json));
      if (
        row.source_kind === 'human-message' &&
        row.channel_id === 'dm-' + reviewBot &&
        payload.author?.kind === 'human' &&
        payload.toolApprovalDecision &&
        payload.replyTo === payload.toolApprovalDecision.requestMessageId &&
        exportReviews.has(payload.replyTo)
      ) {
        excluded.add(String(row.source_event_id));
        return false;
      }
      return true;
    });
    const ordered = (rows: Record<string, unknown>[]) =>
      rows.map((row) => JSON.stringify(row)).sort();
    const authorities = authorityTables.map((table) => [
      table,
      ordered(
        db
          .prepare('SELECT * FROM ' + table)
          .all()
          .map((row) => {
            if (table !== 'paired_devices') return row;
            const { last_seen_at: _lastSeen, ...authority } = row;
            return authority;
          }),
      ),
    ]);
    const channels = db
      .prepare('SELECT channel_id, record_json FROM channel_records')
      .all()
      .map((row) => {
        const { updatedAt: _updatedAt, ...record } = JSON.parse(String(row.record_json));
        return { channelId: row.channel_id, record };
      });
    const placements = db
      .prepare('SELECT channel_id, revision, source_event_id, message_id FROM channel_placements')
      .all()
      .filter((row) => !excluded.has(String(row.source_event_id)));
    return {
      authorities,
      sources: ordered(sources),
      channels: ordered(channels),
      placements: ordered(placements),
    };
  });
}

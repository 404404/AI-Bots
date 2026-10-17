import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { ProfileBackupError } from './files.js';

export interface ProfileBackupReviewContext {
  readonly sessionId: string;
  readonly sourceEventIds: readonly string[];
  readonly humanSourceEventIds: readonly string[];
  readonly callIds?: readonly string[];
  readonly exportPlanId?: string;
}

const authorityTables = [
  'avatar_part_library',
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
  'bot_creation_operations',
  'channel_management_operations',
  'bot_schedule_firings',
  '_botharness_schema',
  'persona_bots_import',
  'model_presets_import',
  'roster_arrangement_import',
  'session_ownership',
  'assignments',
  'channel_reactions',
  'group_send_review_drafts',
  'memory_recovery_checkpoints',
  'memory_repair_events',
  'messaging_approval_routes',
  'messaging_failure_alert_settings',
  'messaging_outbox',
  'messaging_purge_facts',
  'messaging_purge_requirement',
] as const;

const derivedTables = [
  'bot_assignment_access_events',
  'bot_onboarding',
  'bot_source_wake_attempts',
  'channel_read_positions',
  'group_wake_policy_audit',
  'human_attention_decisions',
  'human_inbox_dismissals',
  'human_inbox_snoozes',
  'inbox_admissions',
  'inbox_history_fts',
  'inbox_history_fts_config',
  'inbox_history_fts_data',
  'inbox_history_fts_docsize',
  'inbox_history_fts_idx',
  'memory_change_checkpoints',
  'memory_commit_cursors',
  'messaging_approval_deliveries',
  'messaging_failure_alert_deliveries',
  'messaging_outbox_attempts',
  'messaging_pairing_cards',
  'messaging_reception_history',
  'push_sent',
  'usage_daily',
  'usage_legacy_baselines',
  'usage_receipt_state',
  'usage_receipts',
  'usage_retired_roots',
] as const;
const projectedTables = [
  'source_events',
  'channel_records',
  'channel_placements',
  'channel_output_origins',
] as const;
const classifiedTables = new Set<string>([
  ...authorityTables,
  ...derivedTables,
  ...projectedTables,
]);

function ownExportReview(raw: unknown, context: ProfileBackupReviewContext): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const review = raw as Record<string, unknown>;
  if (
    review.sessionId !== context.sessionId ||
    review.toolName !== 'deepseekbot profile-backup-export' ||
    typeof review.input !== 'string' ||
    typeof review.callId !== 'string'
  )
    return false;
  try {
    const input = JSON.parse(review.input);
    const parent = input.parentShellCallId;
    if (
      typeof parent !== 'string' ||
      !context.callIds?.includes(parent) ||
      input.command !== 'profile-backup-export' ||
      input.target !== 'Profile' ||
      input.patch?.export !== true ||
      input.patch?.planId !== context.exportPlanId ||
      input.patch?.destination !== 'protected-host-file'
    )
      return false;
    const prefix = parent + ':cli:';
    return (
      review.callId.startsWith(prefix) &&
      /^[a-f0-9-]{36}$/u.test(review.callId.slice(prefix.length))
    );
  } catch {
    return false;
  }
}

export function profileBackupReviewDatabase(
  database: OperationalDatabaseOwner,
  context?: ProfileBackupReviewContext,
) {
  return attachOperationalModule(database, 'profile-backup').read((db) => {
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
      const name = String(row.name);
      if (!name.startsWith('sqlite_') && !classifiedTables.has(name))
        throw new ProfileBackupError(
          'dependency-incompatible',
          'Backup review schema has an unclassified table',
        );
    }
    const excluded = new Set<string>();
    const exportReviews = new Set<string>();
    let reviewBot: string | undefined;
    if (context) {
      const owner = db
        .prepare('SELECT bot_slug, root_role FROM session_ownership WHERE session_id = ?')
        .get(context.sessionId);
      if (
        !owner ||
        owner.root_role !== 'orchestrator' ||
        context.sourceEventIds.length === 0 ||
        context.humanSourceEventIds.length === 0
      )
        throw new ProfileBackupError('invalid-input', 'Review execution context is unavailable');
      reviewBot = String(owner.bot_slug);
      for (const id of context.humanSourceEventIds) {
        const human = db
          .prepare(
            'SELECT source_kind, bot_slug, channel_id FROM source_events WHERE source_event_id = ?',
          )
          .get(id);
        if (
          !context.sourceEventIds.includes(id) ||
          human?.source_kind !== 'human-message' ||
          human.bot_slug !== owner.bot_slug ||
          human.channel_id !== 'dm-' + owner.bot_slug
        )
          throw new ProfileBackupError(
            'invalid-input',
            'Review requires the captured Human DM input',
          );
      }
      for (const id of context.sourceEventIds) {
        const accepted = db
          .prepare(
            'SELECT source_kind, bot_slug, channel_id FROM source_events WHERE source_event_id = ?',
          )
          .get(id);
        if (!accepted)
          throw new ProfileBackupError('invalid-input', 'Captured review context is unavailable');
        for (const row of db
          .prepare(
            'SELECT e.source_event_id, e.message_id, e.payload_json FROM channel_output_origins o JOIN source_events e ON e.source_event_id = o.source_event_id WHERE o.session_id = ? AND o.request_source_event_id = ? AND e.bot_slug = ?',
          )
          .all(context.sessionId, id, String(owner.bot_slug))) {
          const payload = JSON.parse(String(row.payload_json));
          if (!payload.toolApprovalRequest) excluded.add(String(row.source_event_id));
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
        ownExportReview(review, context)
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
    const origins = db
      .prepare(
        'SELECT source_event_id, session_id, request_source_event_id FROM channel_output_origins',
      )
      .all()
      .filter((row) => !excluded.has(String(row.source_event_id)));
    return {
      authorities,
      origins: ordered(origins),
      sources: ordered(sources),
      channels: ordered(channels),
      placements: ordered(placements),
    };
  });
}

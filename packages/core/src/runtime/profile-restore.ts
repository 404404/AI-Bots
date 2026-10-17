import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { ProfileBackupManifest } from '../portability/package.js';

export function profileWorkspaceDependencies(
  database: OperationalDatabaseOwner,
): ProfileBackupManifest['dependencies'] {
  return attachOperationalModule(database, 'workspace-grants').read((db) =>
    db
      .prepare('SELECT bot_slug, workspace_path FROM workspace_grants WHERE revoked_at IS NULL')
      .all()
      .map((row) => ({
        kind: 'workspace' as const,
        scope: String(row.bot_slug),
        reference: String(row.workspace_path),
        required: false,
        contract: 'workspace-grant/1',
      })),
  );
}

export function suspendRestoredExecution(database: OperationalDatabaseOwner): void {
  const port = attachOperationalModule(database, 'bot-runtime');
  port.transaction((db) => {
    db.exec(`
      UPDATE source_events SET attempt_state = 'needs-repair' WHERE attempt_state IN ('pending', 'running', 'retryable');
      UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'disaster-restore-no-replay'
        WHERE attempt_state IN ('pending', 'running', 'retryable');
      UPDATE assignments SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL;
    `);
  });
  attachOperationalModule(database, 'bot-schedules').transaction((db) =>
    db.exec('UPDATE bot_schedules SET enabled = 0'),
  );
  attachOperationalModule(database, 'workspace-grants').transaction((db) =>
    db
      .prepare('UPDATE workspace_grants SET revoked_at = ? WHERE revoked_at IS NULL')
      .run(new Date().toISOString()),
  );
  attachOperationalModule(database, 'tool-approval-rules').transaction((db) =>
    db
      .prepare('UPDATE tool_approval_rules SET active = 0, revoked_at = ? WHERE revoked_at IS NULL')
      .run(new Date().toISOString()),
  );
  attachOperationalModule(database, 'device-pairing').transaction((db) => {
    db.prepare(
      'UPDATE paired_devices SET revoked_at = COALESCE(revoked_at, ?), secret_hash = lower(hex(randomblob(32))), public_key = NULL',
    ).run(new Date().toISOString());
    db.exec('DELETE FROM device_pairing_host');
  });
  attachOperationalModule(database, 'push').transaction((db) =>
    db.exec('DELETE FROM push_devices; DELETE FROM push_sent;'),
  );
  attachOperationalModule(database, 'secret-mcp').transaction((db) =>
    db.exec('DELETE FROM bot_secret_mcp_enabled; DELETE FROM bot_secret_mcp_servers;'),
  );
  attachOperationalModule(database, 'tob').transaction((db) => db.exec('DELETE FROM tob_identity'));
  attachOperationalModule(database, 'assignment-access').transaction((db) =>
    db.exec("UPDATE bot_assignment_access SET mode = 'workspace-write', revision = revision + 1"),
  );
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError } from './provider.js';

const PAIRING_POLICY_FIELDS = [
  'id',
  'reference',
  'botSlug',
  'bindingId',
  'accountName',
  'actorId',
  'actorName',
  'conversationId',
  'conversationKind',
  'status',
  'capabilities',
  'createdAt',
  'expiresAt',
  'reviewedAt',
  'revision',
  'reviewedBy',
  'reviewerActorId',
  'purpose',
  'roleId',
  'roleRevision',
  'permissionExceptions',
  'effectivePermissions',
];

const TABLES = [
  'messaging_bindings',
  'messaging_grants',
  'messaging_group_policy_revisions',
  'messaging_thread_policy_revisions',
  'messaging_default_revisions',
  'messaging_pairings',
  'messaging_approval_routes',
  'messaging_conversation_blocks',
  'messaging_external_roles',
  'messaging_sender_policies',
  'messaging_permission_groups',
  'messaging_behavior_permissions',
  'messaging_failure_alert_settings',
  'bot_source_policy_revisions',
];

export class MessagingPolicyConflict extends Error {
  constructor() {
    super('stale-policy');
  }
}

export interface MessagingPolicyMutations {
  stamp(botSlug?: string): string;
  run<T>(
    botSlug: string | undefined,
    stamp: string,
    validate: () => void,
    operation: () => Promise<T>,
  ): Promise<T>;
}

export function createMessagingPolicyMutations(port: OperationalDatabaseModulePort): {
  database: OperationalDatabaseModulePort;
  mutations: MessagingPolicyMutations;
} {
  const context = new AsyncLocalStorage<{
    botSlug: string | undefined;
    stamp: string;
    validate: () => void;
    active: boolean;
    failure?: unknown;
  }>();
  const stamp = (botSlug?: string) =>
    port.read((db) => {
      const rows = TABLES.map((table) => {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        const where =
          botSlug === undefined
            ? ''
            : columns.some((column) => column.name === 'bot_slug')
              ? ' WHERE bot_slug = ?'
              : columns.some((column) => column.name === 'grant_id')
                ? ' WHERE grant_id IN (SELECT id FROM messaging_grants WHERE bot_slug = ?)'
                : '';
        const query = db.prepare(`SELECT * FROM ${table}${where}`);
        return [
          table,
          (where ? query.all(botSlug!) : query.all())
            .map((row) => {
              if (table !== 'messaging_pairings') return JSON.stringify(row);
              const body = JSON.parse(String(row.body)) as Record<string, unknown>;
              return JSON.stringify({
                ...row,
                body: Object.fromEntries(
                  PAIRING_POLICY_FIELDS.filter((field) => Object.hasOwn(body, field)).map(
                    (field) => [field, body[field]],
                  ),
                ),
              });
            })
            .sort(),
        ];
      });
      return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    });
  const check = (current: NonNullable<ReturnType<typeof context.getStore>>) => {
    try {
      if (current.failure !== undefined) throw current.failure;
      current.validate();
      if (stamp(current.botSlug) !== current.stamp) throw new MessagingPolicyConflict();
    } catch (error) {
      current.failure = error;
      throw new MessagingError(
        error instanceof MessagingPolicyConflict ? 'stale-policy' : 'policy-authority-changed',
      );
    }
  };
  return {
    database: {
      module: port.module,
      read: (query) => port.read(query),
      transaction(command, topics) {
        const current = context.getStore();
        return port.transaction((db) => {
          if (current?.active) check(current);
          const result = command(db);
          if (current?.active) current.stamp = stamp(current.botSlug);
          return result;
        }, topics);
      },
    },
    mutations: {
      stamp,
      async run(botSlug, expected, validate, operation) {
        const current = {
          botSlug,
          stamp: expected,
          validate,
          active: true,
          failure: undefined as unknown,
        };
        return context.run(current, async () => {
          try {
            check(current);
            const result = await operation();
            if (current.failure !== undefined) throw current.failure;
            return result;
          } catch (error) {
            throw current.failure ?? error;
          } finally {
            current.active = false;
          }
        });
      },
    },
  };
}

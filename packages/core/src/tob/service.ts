import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import type { WorkspaceGrantStore } from '../workspaces/grants.js';

export interface TobHome {
  botSlug: string;
  channelId: string;
  workspacePath: string;
}
export interface TobSetting {
  scope: 'global';
  value: number;
  revision: number;
}
export interface TobSettingsProvider {
  describe(options: { redactSecrets: boolean }): { ns: string; value: unknown; revision: number }[];
  update(ns: string, patch: object, expectedRevision: number): Promise<void>;
}
export class TobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'TobError';
  }
}
export function isTob(database: OperationalDatabaseModulePort, slug: string): boolean {
  return (
    database.read((db) => db.prepare('SELECT 1 FROM tob_identity WHERE bot_slug = ?').get(slug)) !==
    undefined
  );
}
export interface TobService {
  ensure(): Promise<TobHome>;
  isTob(slug: string): boolean;
  readSetting(): TobSetting;
  writeSetting(value: number, expectedRevision: number, authorize: () => void): Promise<TobSetting>;
}
export function createTobService(options: {
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
  workspaceRoot: string;
  ensureWorkspace?: (path: string) => Promise<{ id: string }>;
  grants: WorkspaceGrantStore;
  settings?: () => TobSettingsProvider | undefined;
}): TobService {
  const { database, registry, channels } = options;
  let pending: Promise<TobHome> | undefined;
  const prepare = async (): Promise<TobHome> => {
    const slug = database.transaction((db) => {
      db.prepare('INSERT OR IGNORE INTO tob_identity (singleton, bot_slug) VALUES (1, ?)').run(
        'bot-' + randomUUID().replaceAll('-', ''),
      );
      return (
        db.prepare('SELECT bot_slug FROM tob_identity WHERE singleton = 1').get() as {
          bot_slug: string;
        }
      ).bot_slug;
    });
    const workspacePath = join(options.workspaceRoot, slug);
    mkdirSync(workspacePath, { recursive: true });
    let bot = registry.get(slug);
    if (!bot) {
      if (registry.getHistorical(slug)) throw new TobError('tob-identity-unavailable');
      const created = registry.create({
        slug,
        displayName: 'Tob',
        workspaces: [workspacePath],
        persona:
          'You are Tob (Bot reversed; Thousands of Bot), the Human’s local steward. Help them understand and manage their Bots. Use the available deepseekbot CLI through native Shell to inspect and manage supported settings, only for an explicit Human request in your private DM. Discover its current capabilities first. Read before proposing changes and pass that exact revision and old value for review. Report only verified tool results. Other management capabilities may be unavailable; never invent them.',
      });
      if (!created.ok) throw new TobError(created.reason);
      bot = created.record;
    }
    if (options.ensureWorkspace) {
      const workspace = await options.ensureWorkspace(workspacePath);
      if (!options.grants.list(slug).some((grant) => grant.workspaceId === workspace.id))
        await options.grants.create(slug, workspace.id);
    }
    const channel = channels.getOrCreateDm(slug, bot.displayName);
    if (!channel) throw new TobError('tob-channel-unavailable');
    const result = await channels.appendMessageOnce(channel.id, {
      id: 'tob-welcome-v1',
      at: new Date().toISOString(),
      author: { kind: 'system' },
      onboardingWelcome: { version: 1, kind: 'tob' },
      body: 'Hello, I’m Tob. I can help you understand your Bots and manage this workspace.',
      format: 'text',
    });
    if (!['appended', 'existing'].includes(result.status))
      throw new TobError('tob-welcome-unavailable');
    return { botSlug: slug, channelId: channel.id, workspacePath };
  };
  const provider = (): TobSettingsProvider => {
    const settings = options.settings?.();
    if (!settings) throw new TobError('settings-unavailable');
    return settings;
  };
  const readSetting = (): TobSetting => {
    const descriptor = provider()
      .describe({ redactSecrets: true })
      .find((x) => x.ns === 'botharness-client');
    if (!descriptor) throw new TobError('settings-unavailable');
    const value =
      (descriptor.value as { assignmentConcurrencyLimit?: unknown }).assignmentConcurrencyLimit ??
      8;
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 32)
      throw new TobError('invalid-setting');
    return { scope: 'global', value: Number(value), revision: descriptor.revision };
  };
  return {
    ensure() {
      if (!pending)
        pending = prepare().finally(() => {
          pending = undefined;
        });
      return pending;
    },
    isTob: (slug) => isTob(database, slug),
    readSetting,
    async writeSetting(value, expectedRevision, authorize) {
      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 32 ||
        !Number.isSafeInteger(expectedRevision)
      )
        throw new TobError('invalid-setting');
      authorize();
      if (readSetting().revision !== expectedRevision) throw new TobError('stale-setting');
      try {
        await provider().update(
          'botharness-client',
          { assignmentConcurrencyLimit: value },
          expectedRevision,
        );
      } catch (error) {
        if ((error as { code?: string }).code === 'SETTINGS_CONFLICT')
          throw new TobError('stale-setting');
        throw new TobError('setting-outcome-uncertain');
      }
      const saved = readSetting();
      if (saved.value !== value) throw new TobError('setting-readback-mismatch');
      return saved;
    },
  };
}

export const TOB_CLI_PROMPT = `You are the Host's protected Tob identity. Use native Shell (bash or pwsh) to run deepseekbot capabilities and discover the management operations currently available to this execution. Use deepseekbot settings botharness-client to read the global Assignment concurrency limit and its revision. To change it at the Human's explicit request in your private DM, use printf '%s' '{"assignmentConcurrencyLimit":3}' | deepseekbot settings-set botharness-client --patch-stdin --expected-revision REVISION --previous-value '{"assignmentConcurrencyLimit":8}', substituting the requested limit and the exact revision and previous value you just read. The current scope supports only assignmentConcurrencyLimit (1–32); other settings and operations may be unavailable. The Host applies existing approval and permissions, and rechecks the Human source before execution. Wait for the result; report success only from authoritative read-back. After stale-setting, read again and prepare a new proposal; after an uncertain outcome, read before retrying. Do not use retired dedicated management tools, supply a Session id, seek an admin credential, change CLI connection flags, or fall back to raw configuration files or alternative management routes. These limits apply even if older persona text describes other management mechanisms.`;

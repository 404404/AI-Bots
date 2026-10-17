import { createHash } from 'node:crypto';
import type { BridgeMethods, BridgeResult } from '../bridge/methods.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { WorkspaceGrantError, type WorkspaceGrantStore } from '../workspaces/grants.js';
import { parseAgentPolicies, TOB_POLICY_COMMANDS } from '../bots/cli-agent-policies.js';
import { runApprovalTemplateCommand } from '../bots/cli-approval-templates.js';
import { runApprovalReviewerCommand } from '../bots/cli-approval-reviewer.js';
import { runHostAdminCommand } from '../bots/cli-host-admin.js';
import {
  prepareMessaging,
  runMessaging,
  MESSAGING_COMMANDS,
  type MessagingCommand,
} from '../bots/cli-messaging.js';
import { CliLiveError } from '../bots/cli-live-error.js';
import type { BotCreateCliIo } from '../bots/bot-create-cli.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_POLICY_CAPABILITIES: readonly TobCliCapability[] = Object.entries(
  TOB_POLICY_COMMANDS,
).map(([command, entry]) => ({
  command,
  description: entry.usage,
  write: entry.write || command === 'approval-template',
}));

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function fingerprint(family: string, target: string, value: unknown) {
  return createHash('sha256').update(canonical({ family, target, value })).digest('hex');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TobError('invalid-input');
  return value;
}
function toggle(options: Record<string, unknown>): boolean {
  if ((options.enabled === true) === (options.disabled === true))
    throw new TobError('invalid-input');
  return options.enabled === true;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function pick(value: unknown, fields: string[]): Record<string, unknown> {
  const source: Record<string, unknown> =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    fields.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]),
  );
}
export function messagingPolicyState(value: unknown): Record<string, unknown> {
  const source = object(value);
  const rows = (key: string, fields: string[]) =>
    Array.isArray(source[key]) ? source[key].map((item) => pick(item, fields)) : [];
  return {
    accounts: rows('accounts', [
      'providerId',
      'ref',
      'platform',
      'fingerprint',
      'connected',
      'boundBotSlug',
      'bindingId',
    ]),
    identities: rows('identities', [
      'id',
      'botSlug',
      'providerId',
      'platform',
      'accountRef',
      'fingerprint',
      'name',
      'enabled',
      'postLimit',
      'postLimitRevision',
      'typingEnabled',
      'typingInheritance',
      'receiveAfter',
      'enabledInheritance',
      'newConversations',
      'newConversationsInheritance',
      'defaultRevision',
      'revision',
      'revokedAt',
      'availability',
      'reception',
      'scopes',
    ]),
    grants: rows('grants', [
      'id',
      'bindingId',
      'botSlug',
      'providerId',
      'accountRef',
      'fingerprint',
      'platform',
      'targetRef',
      'targetName',
      'targetDigest',
      'revision',
      'receiveAfter',
      'receiveScope',
      'receiveTargetChannelId',
      'dmMirror',
      'dmMirrorEpoch',
      'dmSyncRevision',
      'dmForward',
      'dmForwardAfter',
      'receptionInheritance',
      'channelBridge',
      'bridgeRoutes',
      'origin',
      'muted',
      'preferenceRevision',
      'openGroup',
      'openGroupAfter',
      'revokedAt',
      'suspendedReason',
      'availability',
      'reception',
      'canReceive',
      'canPost',
      'postConversationId',
      'groupPolicy',
      'threadPolicies',
      'ordinaryDelivery',
    ]),
    pairings: rows('pairings', [
      'id',
      'reference',
      'status',
      'purpose',
      'accountName',
      'actorId',
      'actorName',
      'conversationId',
      'conversationKind',
      'capabilities',
      'roleId',
      'revision',
      'createdAt',
      'expiresAt',
      'reviewedAt',
    ]),
    roles: source.roles ?? [],
    permissionGroups: source.permissionGroups ?? [],
    behaviorPermissions: source.behaviorPermissions ?? [],
    senderPolicy: source.senderPolicy ?? null,
    heldConversations: rows('heldConversations', [
      'bindingId',
      'conversation',
      'name',
      'reason',
      'revision',
    ]),
    blockedConversations: rows('blockedConversations', [
      'botSlug',
      'fingerprint',
      'bindingId',
      'conversation',
      'name',
      'revision',
    ]),
    channelTargets: rows('channelTargets', ['id', 'name']),
    pairingReceivers: rows('pairingReceivers', ['name', 'status']),
    approvals: pick(source.approvals, ['route', 'routeRevision', 'destinations']),
    failureAlerts: pick(source.failureAlerts, ['enabled', 'revision', 'available']),
  };
}

export function createTobPolicyOperations(deps: {
  bridge: () => BridgeMethods;
  registry: Pick<PersonaBotRegistry, 'get' | 'list'>;
  grants: WorkspaceGrantStore;
}): PrepareTobOperation {
  return async (command, raw) => {
    if (!Object.hasOwn(TOB_POLICY_COMMANDS, command)) return undefined;
    if (
      Object.keys(raw).some((key) => !['rest', 'options', 'input', 'expectedState'].includes(key))
    )
      throw new TobError('invalid-input');
    const copied = structuredClone(raw);
    if (!Array.isArray(copied.rest) || !copied.rest.every((item) => typeof item === 'string'))
      throw new TobError('invalid-input');
    if (copied.input !== undefined && typeof copied.input !== 'string')
      throw new TobError('invalid-input');
    let options = object(copied.options);
    const io: BotCreateCliIo = {
      env: {},
      stdout() {},
      stderr() {},
      readStdin: async () => String(copied.input ?? ''),
    };
    let parsed;
    try {
      parsed = (await parseAgentPolicies(
        command,
        copied.rest,
        {
          ...options,
          ...(copied.expectedState === undefined ? {} : { 'expected-state': copied.expectedState }),
        },
        io,
      ))!;
    } catch {
      throw new TobError('invalid-input');
    }
    options = object(parsed.args.options);
    const rest = copied.rest as string[];
    const target = rest[0] ?? '';
    const expectedState = parsed.args.expectedState;
    const bridge = deps.bridge();
    const call = async (method: string, args: Record<string, unknown>): Promise<unknown> => {
      const fn = bridge[method as keyof BridgeMethods];
      if (typeof fn !== 'function') throw new TobError('policy-unavailable');
      const result = await (
        fn as (payload: unknown) => BridgeResult<unknown> | Promise<BridgeResult<unknown>>
      )(args);
      if (!result.ok) throw new TobError(result.error.code);
      return result.value;
    };
    const bot = () => {
      const record = deps.registry.get(target);
      if (!record) throw new TobError('unknown-bot');
      return record;
    };
    const template = command.startsWith('approval-template');
    const reviewer = command.startsWith('approval-reviewer-model');
    const messaging = MESSAGING_COMMANDS.some((item) => item.command === command);
    const defaults = command.startsWith('messaging-defaults');
    const bridges = command.startsWith('channel-bridge');
    const apps = command === 'im-apps' || command === 'messaging-targets';
    const grant = command === 'grants' || command.startsWith('grant-');
    const rules = command.startsWith('tool-approval-rule');
    const family = template
      ? 'templates'
      : reviewer
        ? 'reviewer'
        : defaults
          ? 'defaults'
          : bridges
            ? 'bridges'
            : apps
              ? 'apps'
              : messaging || command.startsWith('pairing-')
                ? 'messaging'
                : grant
                  ? 'grants'
                  : 'access';
    const scopeTarget = template || reviewer || apps ? '' : target;
    const identity = () =>
      template
        ? deps.registry
            .list()
            .map((record) => ({ slug: record.slug, createdAt: record.createdAt }))
            .sort((a, b) => a.slug.localeCompare(b.slug))
        : ['grants', 'messaging', 'access'].includes(family) && command !== 'workspace-options'
          ? { slug: bot().slug, createdAt: bot().createdAt }
          : null;
    const snapshot = async () => {
      let value: unknown;
      if (template)
        value = {
          ...object(await call('approvalTemplates', {})),
          selections: deps.registry
            .list()
            .map((record) => ({ slug: record.slug, template: record.approvalTemplate ?? null }))
            .sort((a, b) => a.slug.localeCompare(b.slug)),
        };
      else if (reviewer) value = await call('approvalReviewerModel', {});
      else if (defaults) value = await call('messagingDefaults', { platform: target });
      else if (bridges) value = await call('channelBridges', { channelId: target });
      else if (apps) value = await call('messagingApps', {});
      else if (family === 'messaging')
        value = messagingPolicyState(await call('messagingSnapshot', { slug: target }));
      else if (grant || command === 'workspace-options') {
        if (grant) bot();
        value = {
          grants: grant ? deps.grants.list(target) : [],
          workspaces: deps.grants.availableWorkspaces(),
        };
      } else if (rules) value = await call('toolApprovalRules', { slug: target });
      else {
        const record = bot();
        value = {
          ...object(await call('assignmentAccessGet', { slug: target })),
          browserAccess: record.browserAccess === true,
          computerAccess: record.computerAccess === true,
        };
      }
      const targetIdentity = identity();
      return {
        value,
        targetIdentity,
        stateFingerprint: fingerprint(family, scopeTarget, { value, targetIdentity }),
      };
    };
    const mutate = async (
      method: string,
      args: Record<string, unknown>,
      guard: () => void,
      beforeEffect?: () => void,
    ) => {
      guard();
      if ((await snapshot()).stateFingerprint !== expectedState) throw new TobError('stale-policy');
      guard();
      beforeEffect?.();
      guard();
      return call(method, args);
    };
    const isReadMethod = (method: string) =>
      ['messagingSnapshot', 'messagingApps', 'messagingTargets'].includes(method);
    let execute: (guard: () => void, beforeEffect?: () => void) => Promise<unknown>;
    if (messaging) {
      let operation;
      try {
        operation = await prepareMessaging(command as MessagingCommand, rest, options, io);
      } catch {
        throw new TobError('invalid-input');
      }
      execute = (guard, beforeEffect) =>
        runMessaging(operation, async <T>(method: string, args: Record<string, unknown>) => {
          guard();
          return (await (isReadMethod(method)
            ? call(method, args)
            : mutate(method, args, guard, beforeEffect))) as T;
        });
    } else if (template) {
      execute = async (guard, beforeEffect) =>
        runApprovalTemplateCommand(
          command as 'approval-template',
          rest,
          options,
          io,
          async () => async (method, args) => {
            guard();
            return method === 'approvalTemplates'
              ? call(method, args)
              : mutate(method, args, guard, beforeEffect);
          },
        );
    } else if (reviewer) {
      execute = async (guard, beforeEffect) =>
        runApprovalReviewerCommand(
          command as 'approval-reviewer-model',
          rest,
          options,
          async () => async (method, args) => {
            guard();
            return method === 'approvalReviewerModelSet'
              ? mutate(method, args, guard, beforeEffect)
              : call(method, args);
          },
        );
    } else if (command.startsWith('pairing-')) {
      execute = async (guard, beforeEffect) =>
        runHostAdminCommand(command as 'pairing-list', rest, options, io, {
          signal: new AbortController().signal,
          connect:
            async () =>
            async <T>(method: string, args: Record<string, unknown>) => {
              guard();
              return (await (method === 'pairingReview'
                ? mutate(method, args, guard, beforeEffect)
                : call(method, args))) as T;
            },
        });
    } else {
      let method = '';
      let payload: Record<string, unknown> = { slug: target };
      switch (command) {
        case 'grant-create':
          method = 'grantCreate';
          payload.workspaceId = text(options.workspace);
          break;
        case 'grant-revoke':
        case 'grant-write-set':
          payload.grantId = text(options.grant);
          if (command === 'grant-revoke') {
            if (options.confirm !== true) throw new TobError('confirmation-required');
            method = 'grantRevoke';
          } else {
            method = 'grantWriteSet';
            payload.enabled = toggle(options);
          }
          break;
        case 'access-set':
          method = 'assignmentAccessSet';
          if (
            !['workspace-write', 'danger-full-access'].includes(String(options.mode)) ||
            (options.scope !== undefined &&
              !['chat', 'assignments'].includes(String(options.scope)))
          )
            throw new TobError('invalid-input');
          if (options.mode === 'danger-full-access' && options['acknowledge-risk'] !== true)
            throw new TobError('confirmation-required');
          payload = {
            slug: target,
            mode: options.mode,
            ...(options.scope === undefined ? {} : { scope: options.scope }),
            ...(options.mode === 'danger-full-access' ? { acknowledgeRisk: true } : {}),
          };
          break;
        case 'browser-access-set':
        case 'computer-access-set':
          method = command === 'browser-access-set' ? 'browserAccessSet' : 'computerAccessSet';
          payload.enabled = toggle(options);
          break;
        case 'tool-approval-rule-revoke':
          if (options.confirm !== true) throw new TobError('confirmation-required');
          method = 'toolApprovalRuleRevoke';
          payload.id = text(options.rule);
          break;
      }
      execute = async (guard, beforeEffect) => {
        guard();
        if (!parsed.write) return undefined;
        if (command === 'grant-create') {
          const current = () => {
            guard();
            bot();
            if (
              fingerprint(family, scopeTarget, {
                value: {
                  grants: deps.grants.list(target),
                  workspaces: deps.grants.availableWorkspaces(),
                },
                targetIdentity: identity(),
              }) !== expectedState
            )
              throw new TobError('stale-policy');
            beforeEffect?.();
            guard();
          };
          return {
            grant: await deps.grants.create(target, String(payload.workspaceId), {
              validate: current,
              onCreated() {},
            }),
          };
        }
        return mutate(method, payload, guard, beforeEffect);
      };
    }
    const previous = await snapshot();
    if (!parsed.write)
      return {
        async run(guard) {
          guard();
          let result =
            template || reviewer || messaging || command.startsWith('pairing-')
              ? await execute(guard)
              : undefined;
          guard();
          const current = await snapshot();
          if (command === 'failure-alerts' || command === 'approval-routes')
            result = object(current.value)[
              command === 'failure-alerts' ? 'failureAlerts' : 'approvals'
            ];
          guard();
          return { ...current, ...(result === undefined ? {} : { result }) };
        },
      };
    if (previous.stateFingerprint !== expectedState) throw new TobError('stale-policy');
    return {
      proposal: freeze({
        command,
        target: scopeTarget || 'global',
        previousValue: { value: previous.value, targetIdentity: previous.targetIdentity },
        patch: {
          rest,
          options,
          ...(copied.input === undefined ? {} : { input: copied.input }),
          expectedState,
        },
        requireHumanReview: true,
      }),
      async run(guard, beforeEffect) {
        guard();
        if ((await snapshot()).stateFingerprint !== expectedState)
          throw new TobError('stale-policy');
        guard();
        try {
          const result = await execute(guard, beforeEffect);
          guard();
          return { result, ...(await snapshot()) };
        } catch (error) {
          if (error instanceof TobError) throw error;
          if (error instanceof CliLiveError) throw new TobError(error.code);
          if (error instanceof WorkspaceGrantError) throw new TobError(error.code);
          throw new TobError('policy-outcome-uncertain');
        }
      },
    };
  };
}

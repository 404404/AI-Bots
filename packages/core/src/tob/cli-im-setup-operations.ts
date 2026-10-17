import { createHash, randomUUID } from 'node:crypto';
import type { MessagingAppsView } from '../bridge/methods.js';
import { prepareImAuthorization, runImAuthorization } from '../bots/cli-im-authorization.js';
import { parseAgentImSetup, TOB_IM_SETUP_USAGE } from '../bots/cli-agent-im-setup.js';
import { CliLiveError } from '../bots/cli-live-error.js';
import type { MessagingSetup } from '../messaging/provider.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

const ENDPOINT = 'dsh-im/app-setup';
const STATES = [
  'credentials',
  'creating',
  'pending',
  'scanned',
  'needs_verification',
  'connecting',
  'ready',
  'cancelled',
  'expired',
  'failed',
];
const CODES = new Set([
  'capability-unavailable',
  'setup-expired',
  'setup-limit',
  'setup-account-exists',
  'setup-failed',
  'setup-outcome-uncertain',
  'setup-owner-changed',
  'setup-unknown-receipt',
  'setup-already-pending',
  'agent-context-expired',
  'operation-cancelled',
  'human-dm-required',
  'tob-authority-required',
  'approval-authority-changed',
]);
type Platform = 'feishu' | 'weixin';
type Descriptor = MessagingSetup & { providerId: string };
export interface TobImSetupReceipt {
  receiptId: string;
  platform: Platform;
  state: string;
  expiresAt: number;
  stateFingerprint: string;
  connected?: boolean;
  handoff: 'applications-settings';
}
export interface TobImSetupResume {
  descriptor: Descriptor;
  attemptId: string;
  receipt: TobImSetupReceipt;
}
interface Receipt {
  id: string;
  owner: string;
  descriptor: Descriptor;
  nativeId: string;
  observed: { state: string; expiresAt: number; connected?: boolean };
}
export interface TobImSetupService {
  prepare: PrepareTobOperation;
  list(): Promise<{ receipts: TobImSetupReceipt[] }>;
  resume(receiptId: string): Promise<TobImSetupResume>;
}
export const TOB_IM_SETUP_CAPABILITIES: readonly TobCliCapability[] = Object.entries(
  TOB_IM_SETUP_USAGE,
).map(([command, description]) => ({
  command,
  description,
  write: command === 'im-authorize' || command === 'im-cancel',
}));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('setup-failed');
  return value as Record<string, unknown>;
}
function failure(error: unknown, uncertain = false): never {
  const code = error instanceof TobError || error instanceof CliLiveError ? error.code : '';
  throw new TobError(
    CODES.has(code) ? code : uncertain ? 'setup-outcome-uncertain' : 'setup-failed',
  );
}

export function createTobImSetupOperations(deps: {
  apps(): Promise<MessagingAppsView>;
  owner(): string;
  native(request: Request): Promise<Response>;
  now?: () => number;
}): TobImSetupService {
  const receipts = new Map<string, Receipt>();
  const starting = new Set<string>();
  const now = deps.now ?? Date.now;
  const owned = (id: string) => {
    const receipt = receipts.get(id);
    if (!receipt) throw new TobError('setup-unknown-receipt');
    if (receipt.owner !== deps.owner()) throw new TobError('setup-owner-changed');
    if (receipt.observed.expiresAt <= now()) {
      receipts.delete(id);
      throw new TobError('setup-expired');
    }
    return receipt;
  };
  const view = (receipt: Receipt): TobImSetupReceipt => {
    const value = {
      receiptId: receipt.id,
      platform: receipt.descriptor.platform as Platform,
      ...receipt.observed,
      handoff: 'applications-settings' as const,
    };
    return { ...value, stateFingerprint: hash({ owner: receipt.owner, ...value }) };
  };
  const invoke = async <T>(
    method: string,
    args: Record<string, unknown>,
    guard: () => void,
  ): Promise<T> => {
    if (method !== ENDPOINT) throw new TobError('invalid-input');
    const operation = args.method;
    const payload = object(args.payload);
    if (
      typeof operation !== 'string' ||
      !['setup.start', 'setup.poll', 'setup.cancel'].includes(operation) ||
      Object.keys(args).some((key) => !['method', 'payload'].includes(key)) ||
      Object.keys(payload).length !== 1 ||
      !Object.hasOwn(payload, operation === 'setup.start' ? 'channel' : 'attemptId') ||
      (operation === 'setup.start'
        ? !['feishu', 'weixin'].includes(String(payload.channel))
        : typeof payload.attemptId !== 'string' ||
          !/^[A-Za-z0-9_-]{1,128}$/u.test(payload.attemptId))
    )
      throw new TobError('invalid-input');
    guard();
    const rpcId = randomUUID();
    let response: Response;
    try {
      response = await deps.native(
        new Request('http://localhost/api/' + ENDPOINT, {
          method: 'POST',
          headers: { host: 'localhost', 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId, method: ENDPOINT, payload: args }),
          signal: AbortSignal.timeout(30_000),
        }),
      );
    } catch (error) {
      return failure(error, operation !== 'setup.poll');
    }
    guard();
    if (response.status === 404 || response.status === 403)
      throw new TobError('capability-unavailable');
    let body: Record<string, unknown>;
    try {
      body = object(await response.json());
    } catch {
      throw new TobError(operation === 'setup.poll' ? 'setup-failed' : 'setup-outcome-uncertain');
    }
    guard();
    if (!response.ok || body.type !== 'server-response' || body.rpcId !== rpcId)
      throw new TobError('setup-failed');
    const result = object(body.result);
    if (result.ok !== true) {
      const error = object(result.error);
      throw new TobError(
        typeof error.code === 'string' && CODES.has(error.code) ? error.code : 'setup-failed',
      );
    }
    return result.value as T;
  };
  const project = (raw: unknown, descriptor: Descriptor, nativeId?: string) => {
    const value = object(raw);
    if (
      value.version !== 1 ||
      value.platform !== descriptor.platform ||
      typeof value.attemptId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(value.attemptId) ||
      (nativeId !== undefined && value.attemptId !== nativeId) ||
      typeof value.state !== 'string' ||
      !STATES.includes(value.state) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isFinite(value.expiresAt)
    )
      throw new TobError('setup-failed');
    return {
      nativeId: value.attemptId,
      observed: {
        state: value.state,
        expiresAt: value.expiresAt,
        ...(typeof value.connected === 'boolean' ? { connected: value.connected } : {}),
      },
    };
  };
  const runNative = async (
    command: 'im-authorize' | 'pairing-status' | 'im-cancel',
    target: string,
    guard: () => void,
  ) => {
    let boundaryError: TobError | undefined;
    const operation = await prepareImAuthorization(
      command,
      [target],
      {},
      { env: {}, stdout() {}, stderr() {} },
    );
    try {
      const result = await runImAuthorization(
        operation,
        async <T>(method: string, args: Record<string, unknown>) => {
          try {
            if (method !== 'messagingApps') return await invoke<T>(method, args, guard);
            guard();
            const apps = await deps.apps();
            guard();
            return apps as T;
          } catch (error) {
            if (error instanceof TobError) boundaryError = error;
            throw error;
          }
        },
        AbortSignal.timeout(30_000),
        { returnTerminalState: true },
      );
      return object(result).authorization;
    } catch (error) {
      if (boundaryError) throw boundaryError;
      throw error;
    }
  };
  const current = async (receipt: Receipt, guard: () => void) => {
    owned(receipt.id);
    guard();
    try {
      const raw = await runNative('pairing-status', receipt.nativeId, () => {
        owned(receipt.id);
        guard();
      });
      owned(receipt.id);
      guard();
      receipt.observed = project(raw, receipt.descriptor, receipt.nativeId).observed;
      return view(receipt);
    } catch (error) {
      return failure(error);
    }
  };
  const availability = async (guard: () => void) => {
    guard();
    const apps = await deps.apps();
    guard();
    const providers = apps.setups
      .filter(
        (entry) =>
          entry.version === 1 &&
          ['feishu', 'weixin'].includes(entry.platform) &&
          entry.providerId === `dsh-im/${entry.platform}` &&
          entry.endpoint === ENDPOINT &&
          entry.kind === (entry.platform === 'feishu' ? 'credentials' : 'qr'),
      )
      .map((entry) => ({
        version: 1 as const,
        platform: entry.platform as Platform,
        providerId: entry.providerId,
        endpoint: ENDPOINT as typeof entry.endpoint,
        kind: entry.kind,
      }));
    const value = {
      providers,
      apps: apps.apps
        .map((entry) => ({
          ref: entry.ref,
          providerId: entry.providerId,
          platform: entry.platform,
          connected: entry.connected,
        }))
        .sort((a, b) => a.ref.localeCompare(b.ref)),
    };
    return { ...value, stateFingerprint: hash({ owner: deps.owner(), ...value }) };
  };
  const list = async (guard = () => {}) => {
    guard();
    const result: TobImSetupReceipt[] = [];
    for (const receipt of receipts.values()) {
      if (receipt.observed.expiresAt <= now()) {
        receipts.delete(receipt.id);
        continue;
      }
      if (receipt.owner !== deps.owner()) continue;
      guard();
      result.push(view(receipt));
    }
    guard();
    return { receipts: result };
  };
  const prepare: PrepareTobOperation = async (command, raw) => {
    if (!Object.hasOwn(TOB_IM_SETUP_USAGE, command)) return undefined;
    const args = structuredClone(raw);
    if (Object.keys(args).some((key) => !['target', 'expectedState'].includes(key)))
      throw new TobError('invalid-input');
    let parsed;
    try {
      parsed = parseAgentImSetup(
        command,
        args.target === undefined ? [] : [String(args.target)],
        args.expectedState === undefined ? {} : { 'expected-state': args.expectedState },
      )!;
    } catch {
      throw new TobError('invalid-input');
    }
    if (command === 'im-apps')
      return {
        async run(guard) {
          return { ...(await availability(guard)), ...(await list(guard)) };
        },
      };
    const target = String(parsed.args.target);
    if (command === 'pairing-status') {
      const receipt = owned(target);
      return { run: (guard) => current(receipt, guard) };
    }
    const expected = parsed.args.expectedState;
    if (command === 'im-cancel') {
      const receipt = owned(target);
      const previous = await current(receipt, () => {});
      if (previous.stateFingerprint !== expected) throw new TobError('stale-policy');
      return {
        proposal: Object.freeze({
          command,
          target,
          previousValue: previous,
          patch: { cancelled: true, platform: receipt.descriptor.platform },
          requireHumanReview: true,
        }),
        async run(guard, beforeEffect) {
          const actual = await current(receipt, guard);
          if (actual.stateFingerprint !== expected) throw new TobError('stale-policy');
          owned(target);
          guard();
          beforeEffect?.();
          guard();
          try {
            const result = await runNative('im-cancel', receipt.nativeId, () => {
              owned(target);
              guard();
            });
            owned(target);
            guard();
            receipt.observed = project(result, receipt.descriptor, receipt.nativeId).observed;
            return view(receipt);
          } catch (error) {
            return failure(error, true);
          }
        },
      };
    }
    const previous = await availability(() => {});
    if (previous.stateFingerprint !== expected) throw new TobError('stale-policy');
    const descriptor = previous.providers.find((entry) => entry.platform === target);
    if (!descriptor) throw new TobError('capability-unavailable');
    return {
      proposal: Object.freeze({
        command,
        target,
        previousValue: previous,
        patch: { start: true, platform: target },
        requireHumanReview: true,
      }),
      async run(guard, beforeEffect) {
        if ((await availability(guard)).stateFingerprint !== expected)
          throw new TobError('stale-policy');
        const owner = deps.owner();
        for (const receipt of receipts.values())
          if (receipt.observed.expiresAt <= now()) receipts.delete(receipt.id);
        const key = owner + ':' + target;
        if (
          starting.has(key) ||
          [...receipts.values()].some(
            (receipt) =>
              receipt.owner === owner &&
              receipt.descriptor.platform === target &&
              receipt.observed.expiresAt > now() &&
              !['ready', 'cancelled', 'expired', 'failed'].includes(receipt.observed.state),
          )
        )
          throw new TobError('setup-already-pending');
        if (receipts.size >= 32) throw new TobError('setup-limit');
        starting.add(key);
        try {
          guard();
          beforeEffect?.();
          guard();
          const raw = await runNative('im-authorize', target, guard);
          const created = project(raw, descriptor);
          const receipt: Receipt = { id: randomUUID(), owner, descriptor, ...created };
          receipts.set(receipt.id, receipt);
          guard();
          if (deps.owner() !== owner) throw new TobError('setup-owner-changed');
          return view(receipt);
        } catch (error) {
          return failure(error, true);
        } finally {
          starting.delete(key);
        }
      },
    };
  };
  return {
    prepare,
    list: () => list(),
    async resume(receiptId) {
      const receipt = owned(receiptId);
      const status = await current(receipt, () => {});
      const available = await availability(() => {});
      if (!available.providers.some((entry) => entry.platform === receipt.descriptor.platform))
        throw new TobError('capability-unavailable');
      owned(receiptId);
      return {
        descriptor: { ...receipt.descriptor },
        attemptId: receipt.nativeId,
        receipt: status,
      };
    },
  };
}

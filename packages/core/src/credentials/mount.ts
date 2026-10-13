import { basename } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { BotHarnessCore } from '../plugin.js';
import { PrivateInputs } from './private-inputs.js';
import { ProtectedExecution, SecretHttpRefusal } from './protected-execution.js';
import {
  SecretCommandRefusal,
  runSecretCommand,
  secretCommandArgs,
  secretCommandBaseEnv,
  secretCommandEnvName,
  secretCommandProgram,
} from './secret-command.js';
import type { PrivateInputLog } from './diagnostics.js';
import { LinuxMcp } from './linux-mcp.js';
import { PRIVATE_MCP_TOOL, ProtectedMcp } from './protected-mcp.js';
import { nativeExecutionRoot } from '../workspaces/grant-native-tools.js';
import { isQualifiedMessagingName, messagingToolDenial } from './messaging-tools.js';
import { privateInputWebUrl } from './web-locator.js';
import { credentialStoreDenial, credentialStorePath, denyStoreRead } from './store-guard.js';
import { resolveDshHome } from '../im/config-store.js';

const SAFE_TOOLS = new Set([
  'ask_secret',
  'protected_cli',
  'secret_http',
  'secret_cli',
  'bash',
  'channel_send',
  'channel_read',
  'channel_list',
  'ask_user_question',
  'inbox_ignore',
  'bot_schedule_list',
  'bot_schedule_create',
  'bot_schedule_update',
  'bot_schedule_delete',
]);
export function mountPrivateInputs(
  ctx: Context,
  core: BotHarnessCore,
  enabled: boolean,
  execution = new ProtectedExecution((phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details }),
  ),
  linuxMcp?: LinuxMcp,
  webUrl?: string,
  dshHome = resolveDshHome(),
): PrivateInputs {
  if (webUrl !== undefined)
    privateInputWebUrl(webUrl, 'dm-check', '00000000-0000-0000-0000-000000000000');
  const log: PrivateInputLog = (phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details });
  const privateMcp = new ProtectedMcp(log);
  const mode: 'standard' | 'protected' = enabled ? 'protected' : 'standard';
  ctx.inject(['credentials'], () => {
    queueMicrotask(() => void owner.recover().catch(() => log('recovery-unavailable')));
  });
  const owner = new PrivateInputs({
    channels: core.channels,
    ownership: core.ownership,
    registry: core.registry,
    credentials: () => ctx.get('credentials'),
    isLive: (agent) => ctx.agents.get(agent.id) === agent,
    canRequest: (agent, sourceEventId) =>
      core.runtime.canRequestPrivateInput?.(agent.session.id, sourceEventId) === true,
    askChannel: (sessionId) => core.runtime.askChannel?.(sessionId),
    origin: (agent, sourceEventId) =>
      core.runtime.bindPrivateInputOrigin?.(agent.session.id, sourceEventId),
    replyAuthority: (botSlug, sourceEventId, authority) =>
      core.externalMessaging.privateInputReplyAuthority(botSlug, sourceEventId, authority),
    ...(webUrl === undefined
      ? {}
      : {
          notify: async (
            botSlug: string,
            origin: import('./im-origin.js').PrivateInputOrigin,
            channelId: string,
            messageId: string,
          ) => {
            if (!origin.current()) throw new Error('Private input IM authority changed');
            await core.externalMessaging.privateInputNotice(
              botSlug,
              origin.sourceEventId,
              messageId,
              privateInputWebUrl(webUrl, channelId, messageId),
              {
                signal: origin.signal,
                current: () => origin.current() && owner.status(channelId, messageId) === 'pending',
              },
            );
          },
        }),
    qualified: () => (mode === 'protected' ? execution.qualified() : Promise.resolve(true)),
    log,
    changed: (botSlug, count) => core.states.setPrivateInputCount(botSlug, count),
  });
  if (mode === 'standard')
    ctx.inject(['sandbox'], (child) => {
      const sandbox = child.get('sandbox') as unknown as {
        confine(...args: unknown[]): Promise<{ argv: string[] }>;
      };
      const original = sandbox.confine;
      const store = credentialStorePath(dshHome);
      const reported = new Set<string>();
      sandbox.confine = async function (this: unknown, ...args: unknown[]) {
        const confined = await original.apply(this, args);
        const denied = denyStoreRead(confined, store);
        const runner = basename(confined.argv[0] ?? 'none');
        if (denied === confined && !reported.has(runner)) {
          reported.add(runner);
          ctx.logger.warn(
            'botharness: the Shell sandbox runner %s has no credential store read denial; only the command text guard applies',
            runner,
          );
        }
        return denied;
      };
      child.effect(
        () => () => {
          sandbox.confine = original;
        },
        'botharness: credential store read denial',
      );
    });
  ctx.effect(() => () => owner.close(), 'botharness: private input owner');
  ctx.effect(() => () => execution.close(), 'botharness: protected Execution World');
  ctx.effect(() => () => privateMcp.close(), 'botharness: protected MCP lifetime');
  ctx.tools.guard(({ name, agent, arguments: args }) => {
    if (mode === 'standard')
      return credentialStoreDenial(name, args, dshHome, agent?.session.header.cwd);
    if (
      agent !== undefined &&
      core.ownership.resolve(agent.session.id)?.rootRole === 'orchestrator'
    ) {
      if (name === 'bash') return undefined;
      if (isQualifiedMessagingName(name)) return messagingToolDenial(ctx, agent, name);
      if (name === PRIVATE_MCP_TOOL) return privateMcp.denial(ctx, agent);
      if (name.startsWith('mcp__') && linuxMcp !== undefined)
        return linuxMcp.denial(ctx, agent, name);
    }
    if (
      !SAFE_TOOLS.has(name) ||
      (name.startsWith('bot_schedule_') &&
        (agent === undefined ||
          core.ownership.resolve(agent.session.id)?.rootRole !== 'orchestrator')) ||
      (name !== 'bash' &&
        (agent === undefined || core.ownership.resolve(agent.session.id) === undefined))
    )
      return 'This protected Profile has not qualified that Host capability; use an ordinary Profile for nonsecret Host tools';
    return undefined;
  });
  ctx.on(
    'tools/execute',
    async (call, next) => {
      if (mode === 'standard' || call.name !== 'bash') return next();
      if (
        typeof call.arguments === 'object' &&
        call.arguments !== null &&
        'run_in_background' in call.arguments &&
        call.arguments.run_in_background === true
      )
        throw new Error('Protected commands require a foreground command');
      if (
        call.agent !== undefined &&
        core.ownership.resolve(call.agent.session.id)?.rootRole === 'orchestrator'
      ) {
        nativeExecutionRoot(core, call.agent.session, 'bash', call.arguments);
        return next();
      }
      const args = call.arguments;
      if (
        typeof args !== 'object' ||
        args === null ||
        !('command' in args) ||
        typeof args.command !== 'string' ||
        ('run_in_background' in args && args.run_in_background === true)
      )
        throw new Error('Protected commands require a foreground command');
      const text = await execution.command(args.command, call.signal);
      return {
        isError: false,
        value: {
          kind: 'foreground',
          exitCode: 0,
          signal: null,
          timedOut: false,
          aborted: false,
          timeoutMs: 30_000,
          stdout: { text, truncated: false },
          stderr: { text: '', truncated: true },
        },
        content: [{ type: 'text', text }],
      };
    },
    { global: true },
  );
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole !== 'orchestrator') return;
        if (mode === 'protected') privateMcp.register(agentCtx, agent, owner);
        agentCtx.tools.register(
          defineTool({
            name: 'ask_secret',
            description:
              'Reuse configured private references, or ask the authenticated Owner for private strings in an interactive conversation. Declare account, purpose and dynamic fields. Web and scheduled runs must omit source_event_id; configured accounts can be reused without an IM source or new input. For an accepted IM Source Event the Host sends the Owner an existing Web Chat card link; never collect private values in IM text, attachments, quoted messages or ordinary questions. For a local Channel request the input card appears in the Channel the request came from, a Group or your Human DM; only the Owner can fill it, the values are never shown there, and only you receive the references. In a Group, say first in a sentence what the account is for, and never ask anyone to type a secret into the conversation. Returns opaque references only. Do not send references or private configuration details to IM; report only the authorized nonsecret operation result with bridge_reply to the same source. Private input does not approve execution. Unattended runs cannot open input cards. A failed handoff may already have sent its notice; report missing private configuration and do not retry.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description:
                  'Nonsecret name of the secret the Owner will recognise later, naming the service and credential kind, for example "GitHub personal access token".',
              },
              source_event_id: {
                type: 'string',
                description:
                  'Optional IM-only selector: exact currently accepted IM Source Event, required when several IM requests are active. Omit for Web and scheduled reuse; never pass a Schedule Source Event or historical IM source.',
              },
              purpose: {
                type: 'string',
                required: true,
                description:
                  'Why the secret is needed in this situation: which credential or API key it is, which service it is for and what the Bot will do with it. Shown to the Owner on the card and later in Channel settings.',
              },
              fields: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', required: true },
                    label: { type: 'string', required: true },
                    required: { type: 'boolean', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  '1–8 confidential fields with unique lowercase identifiers, labels and requiredness; no defaults or values.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const { source_event_id: sourceEventId, ...declaration } = args;
              return JSON.stringify(
                await owner.ask(agent, declaration, call.signal, sourceEventId),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'protected_cli',
            description:
              'Run a qualified trusted CLI using opaque private references. Supported consumer: http-status-v1, one GET with endpoint, api_key and api_secret references; returns only numeric HTTP status and request success, never response text. A successful HTTP status does not independently certify remote authentication. No arbitrary command, env, headers, redirects or plaintext fallback. Existing Human execution approval applies.',
            parameters: {
              consumer: { type: 'string', required: true, description: 'http-status-v1' },
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              endpoint: {
                type: 'string',
                required: true,
                description: 'Opaque endpoint reference.',
              },
              api_key: { type: 'string', required: true, description: 'Opaque API key reference.' },
              api_secret: {
                type: 'string',
                required: true,
                description: 'Opaque API secret reference.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              if (args.consumer !== 'http-status-v1')
                throw new Error('Protected CLI consumer is unsupported');
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  { endpoint: args.endpoint, api_key: args.api_key, api_secret: args.api_secret },
                  (values, signal) => execution.authenticatedStatus(values, signal),
                  call.signal,
                ),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'secret_http',
            description:
              'Call an HTTP API with secrets the Owner entered through ask_secret, without ever seeing them. The Host sends the request. The destination is the Owner-supplied endpoint field of that account; you choose only a path under it, the method, and where each secret goes. Write {{field_id}} in a header value, a query value or the body where a secret belongs and the Host substitutes it. Redirects are refused. Returns the HTTP status, content type and up to 32 KB of response text with the secret values masked. Existing Human execution approval applies.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              references: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description:
                  'The opaque references from ask_secret that this request uses, including the one for the endpoint field.',
              },
              endpoint_field: {
                type: 'string',
                description:
                  'Field id that holds the Owner-supplied base URL; defaults to endpoint.',
              },
              method: {
                type: 'string',
                required: true,
                description: 'GET, POST, PUT, PATCH or DELETE.',
              },
              path: {
                type: 'string',
                required: true,
                description:
                  'Path and optional query under the endpoint, starting with /, or an empty string for the endpoint itself.',
              },
              headers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  'Request headers; a value may contain {{field_id}}, for example "Bearer {{api_key}}".',
              },
              query: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description: 'Extra query parameters; a value may contain {{field_id}}.',
              },
              body: {
                type: 'string',
                description: 'Request body text, up to 64 KB; may contain {{field_id}}.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const endpointField = args.endpoint_field ?? 'endpoint';
              const references: Record<string, string> = {};
              for (const reference of args.references) {
                const field = /^private:[0-9a-f-]{36}:([a-z][a-z0-9_]{0,47})$/.exec(reference)?.[1];
                if (field === undefined || references[field] !== undefined)
                  throw new Error('references must be distinct ask_secret references');
                references[field] = reference;
              }
              if (references[endpointField] === undefined)
                throw new Error('references must include the endpoint field');
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  references,
                  async (values, signal) => {
                    const fill = (text: string): string =>
                      text.replace(/\{\{([a-z][a-z0-9_]{0,47})\}\}/g, (_match, field: string) => {
                        const value = field === endpointField ? undefined : values[field];
                        if (value === undefined)
                          throw new SecretHttpRefusal(
                            'A placeholder names a field that was not referenced',
                          );
                        return value;
                      });
                    try {
                      return await execution.authenticatedRequest(
                        {
                          endpoint: values[endpointField]!,
                          path: args.path,
                          method: args.method,
                          headers: (args.headers ?? []).map((entry) => ({
                            name: entry.name,
                            value: fill(entry.value),
                          })),
                          query: (args.query ?? []).map((entry) => ({
                            name: entry.name,
                            value: fill(entry.value),
                          })),
                          ...(args.body === undefined ? {} : { body: fill(args.body) }),
                        },
                        Object.entries(values)
                          .filter(([field]) => field !== endpointField)
                          .map(([, value]) => value),
                        signal,
                      );
                    } catch (error) {
                      if (!(error instanceof SecretHttpRefusal)) throw error;
                      return {
                        consumer: 'http-request-v1',
                        successful: false,
                        refused: error.message,
                      };
                    }
                  },
                  call.signal,
                ),
              );
            },
          }),
        );
        if (mode !== 'standard') return;
        agentCtx.tools.register(
          defineTool({
            name: 'secret_cli',
            description:
              'Run one installed command-line tool with secrets the Owner entered through ask_secret placed in its environment, for a tool that only reads its credential from an environment variable. Prefer secret_http for a plain HTTP API. The Host starts the program directly, without a shell: no pipes, redirects, variables or substitutions. Give the bare program name, its arguments, and the environment variables the tool documents, writing {{field_id}} where a secret belongs. It runs in your working folder inside the same file sandbox as bash, with a clean environment, for at most two minutes. Returns the exit code and up to 32 KB each of stdout and stderr with the secret values masked. Every call needs its own Human approval, which shows the exact program and arguments; a saved approval never covers it. Never ask the tool to print, export or store the credential.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              references: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'The opaque references from ask_secret that this command uses.',
              },
              program: {
                type: 'string',
                required: true,
                description:
                  'Bare name of the installed tool, for example gh. Not a path, shell or interpreter.',
              },
              args: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'Arguments, one per item, passed as written. No secrets here.',
              },
              env: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  'Environment variables for the tool; a value contains {{field_id}}, for example name GH_TOKEN, value {{token}}.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const references: Record<string, string> = {};
              for (const reference of args.references) {
                const field = /^private:[0-9a-f-]{36}:([a-z][a-z0-9_]{0,47})$/.exec(reference)?.[1];
                if (field === undefined || references[field] !== undefined)
                  throw new Error('references must be distinct ask_secret references');
                references[field] = reference;
              }
              const refuse = (reason: string) =>
                JSON.stringify({ consumer: 'command-v1', successful: false, refused: reason });
              const cwd = agent.session.header.cwd;
              const sandbox = ctx.get('sandbox') as unknown as
                | {
                    confine(
                      argv: readonly string[],
                      policy: { mode: 'workspace-write'; workspaceRoot: string },
                      signal?: AbortSignal,
                    ): Promise<{ argv: string[] }>;
                  }
                | undefined;
              if (cwd === undefined || sandbox === undefined)
                return refuse('The Shell sandbox is unavailable, so the command was not started');
              let command: string[];
              let names: string[];
              try {
                command = [secretCommandProgram(args.program), ...secretCommandArgs(args.args)];
                names = args.env.map((entry) => secretCommandEnvName(entry.name));
                if (
                  args.env.length === 0 ||
                  args.env.length > 16 ||
                  new Set(names).size !== names.length ||
                  !args.env.some((entry) => /\{\{[a-z][a-z0-9_]{0,47}\}\}/.test(entry.value))
                )
                  throw new SecretCommandRefusal(
                    'env must hold 1–16 distinct variables and at least one {{field_id}} placeholder',
                  );
                if (command.some((part) => /\{\{[a-z][a-z0-9_]{0,47}\}\}/.test(part)))
                  throw new SecretCommandRefusal(
                    'a secret placeholder is allowed only in env values, never in arguments',
                  );
              } catch (error) {
                if (error instanceof SecretCommandRefusal) return refuse(error.message);
                throw error;
              }
              let confined: { argv: string[] };
              try {
                confined = await sandbox.confine(
                  command,
                  { mode: 'workspace-write', workspaceRoot: cwd },
                  call.signal,
                );
              } catch {
                return refuse('The Shell sandbox is unavailable, so the command was not started');
              }
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  references,
                  async (values, signal) => {
                    try {
                      const env = secretCommandBaseEnv();
                      for (const [index, entry] of args.env.entries())
                        env[names[index]!] = entry.value.replace(
                          /\{\{([a-z][a-z0-9_]{0,47})\}\}/g,
                          (_match, field: string) => {
                            const value = values[field];
                            if (value === undefined)
                              throw new SecretCommandRefusal(
                                'A placeholder names a field that was not referenced',
                              );
                            return value;
                          },
                        );
                      return await runSecretCommand(
                        confined.argv,
                        env,
                        cwd,
                        Object.values(values),
                        signal,
                      );
                    } catch (error) {
                      if (!(error instanceof SecretCommandRefusal)) throw error;
                      return { consumer: 'command-v1', successful: false, refused: error.message };
                    }
                  },
                  call.signal,
                ),
              );
            },
          }),
        );
      }),
    'botharness: private input Tool Consumers',
  );
  return owner;
}

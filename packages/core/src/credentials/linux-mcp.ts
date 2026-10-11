import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { linuxWorkspaceArgs } from './linux-execution.js';
import { PRIVATE_COMMAND_IMAGE, type ProtectedExecution } from './protected-execution.js';

export interface LinuxMcpServer {
  serverName: string;
  command: string;
  args: string[];
  workdir?: string;
}

export class LinuxMcp {
  readonly #qualified = new Map<
    Agent,
    Map<string, { definition: ToolDefinition; workdir: string; root: string }>
  >();
  constructor(
    readonly execution: ProtectedExecution,
    readonly home: string,
    readonly rootFor: (agent: Agent, workdir: string) => string,
  ) {}

  denial(ctx: Context, agent: Agent, name: string): string | undefined {
    const record = this.#qualified.get(agent)?.get(name);
    if (record === undefined || ctx.get('tools')?.get(name, agent) !== record.definition)
      return 'MCP server has not been qualified in this Linux Execution World';
    try {
      if (this.rootFor(agent, record.workdir) !== record.root)
        return 'MCP workspace authorization changed';
      linuxWorkspaceArgs('qualification', record.root, record.workdir, this.home);
      return undefined;
    } catch {
      return 'MCP workspace authorization is unavailable';
    }
  }

  async install(
    ctx: Context,
    agent: Agent,
    servers: readonly LinuxMcpServer[],
  ): Promise<() => Promise<void>> {
    const fibers: Array<ReturnType<Context['plugin']>> = [];
    const cleanups: Array<() => Promise<void>> = [];
    const qualified = new Map<
      string,
      { definition: ToolDefinition; workdir: string; root: string }
    >();
    const dispose = async () => {
      this.#qualified.delete(agent);
      await Promise.allSettled(fibers.map((fiber) => fiber.dispose()));
      await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
    };
    try {
      const tools = ctx.get('tools');
      if (tools === undefined) throw new Error('Native Tool Registry is unavailable');
      if (servers.length > 0 && scopeOf(ctx) === undefined)
        throw new Error('Native Agent Scope is required for Linux MCP');
      if (servers.length > 0 && !(await this.execution.qualified()))
        throw new Error('Linux MCP execution is unavailable');
      for (const server of servers) {
        const workdir = server.workdir ?? agent.session.header.cwd;
        if (workdir === undefined) throw new Error('MCP workspace is unavailable');
        const root = this.rootFor(agent, workdir);
        const label = 'ai.botharness.mcp-owner=' + randomUUID();
        const args = linuxWorkspaceArgs('mcp', root, workdir, this.home);
        args.splice(args.indexOf('--name'), 2);
        args.push('--label', label);
        args.push('--entrypoint', server.command, PRIVATE_COMMAND_IMAGE, ...server.args);
        cleanups.push(this.execution.trackContainerGroup(label));
        const fiber = ctx.plugin(mcpClient, {
          transport: 'stdio',
          serverName: server.serverName,
          command: 'docker',
          args,
          env: {},
          cwd: tmpdir(),
          toolCallTimeoutMs: 30_000,
          failOnStartupError: true,
          reconnect: { enabled: false },
        });
        fibers.push(fiber);
        await fiber.await();
        if (fiber.state !== 2) throw new Error('Linux MCP server failed to activate');
        for (const schema of tools.schemas(agent)) {
          if (!schema.name.startsWith(`mcp__${server.serverName}__`)) continue;
          const definition = tools.get(schema.name, agent);
          if (definition !== undefined) qualified.set(schema.name, { definition, workdir, root });
        }
        this.execution.log('mcp-started', { program: server.serverName });
      }
      this.#qualified.set(agent, qualified);
      return dispose;
    } catch {
      await dispose();
      throw new Error('Linux MCP server could not start');
    }
  }
}

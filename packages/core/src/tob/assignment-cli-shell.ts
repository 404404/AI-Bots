import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ShellExecutor } from '@deepseek-ai/dsh-shell';
import * as bashTools from '@deepseek-ai/dsh-tool-bash';
import * as pwshTools from '@deepseek-ai/dsh-tool-pwsh';
import type { DshAgentPresetHost } from '../runtime/dsh-bot-agent-adapter.js';
import { installTobCliShell, type TobCliShellOptions } from './cli-shell.js';

export function delegatedMemoryToolDenial(name: string): string | undefined {
  return ['bash', 'pwsh', 'report_to_orchestrator'].includes(name)
    ? undefined
    : 'This delegated Memory Assignment permits only literal managed CLI reads through Shell and its normal report; native files, Subagents and other execution tools are unavailable.';
}

export async function installAssignmentCliShell(
  agentCtx: Context,
  agent: Agent,
  presets: DshAgentPresetHost | undefined,
  options: TobCliShellOptions,
): Promise<() => Promise<void>> {
  const shell = (presets?.serviceFor?.(agent, 'shell') ?? agentCtx.get('shell')) as
    | ShellExecutor
    | undefined;
  if (!shell) throw new Error('Assignment CLI Shell Provider is unavailable');
  const schemas = agentCtx.tools.schemas(agent);
  const available = new Set(schemas.map((tool) => tool.name));
  const scoped = agentCtx.isolate('shell');
  const fiber = scoped.plugin({
    name: 'botharness-assignment-cli-shell',
    apply(ctx: Context) {
      installTobCliShell(ctx, shell, options);
    },
  });
  try {
    await fiber.await();
    for (const [name, tools] of [
      ['bash', bashTools],
      ['pwsh', pwshTools],
    ] as const)
      if (available.has(name)) {
        const mounted = fiber.ctx.plugin(tools, {
          enableRunInBackground: false,
          promoteOnTimeout: false,
        });
        await mounted.await();
        if (mounted.state !== 2) throw new Error('Assignment CLI Shell Tool failed to activate');
      }
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
  return () => fiber.dispose();
}

import { randomUUID } from 'node:crypto';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { TobCliWriteProposal } from './cli-broker.js';
import { TobError } from './service.js';

export async function approveTobCliOperation(options: {
  execution: ToolExecution;
  operation: TobCliWriteProposal;
  signal: AbortSignal;
  authorize: () => void;
  approval: ApprovalService | undefined;
  channelApproval: ChannelToolApproval | undefined;
  fullAccess: () => boolean;
}): Promise<() => void> {
  const { execution, operation, signal, channelApproval, approval, authorize } = options;
  const actor = execution.agent;
  authorize();
  if (!actor || signal.aborted) throw new TobError('agent-context-expired');
  if (options.fullAccess())
    return () => {
      authorize();
      if (signal.aborted || !options.fullAccess()) throw new TobError('approval-authority-changed');
    };
  const call = {
    ...execution,
    name: 'deepseekbot settings-set',
    callId: ToolCallId(`${execution.callId}:cli:${randomUUID()}`),
    arguments: Object.freeze({
      parentShellCallId: execution.callId,
      scope: 'global',
      ...operation,
    }),
    signal,
  };
  const untrack = channelApproval?.track(call);
  if (!untrack || !approval || !channelApproval) {
    untrack?.();
    throw new TobError('approval-unavailable');
  }
  try {
    const outcome = await approval.request({
      agent: actor,
      toolName: call.name,
      callId: call.callId,
      reason:
        'Review the actual CLI operation: GLOBAL Assignment concurrency, previousValue, patch and expectedRevision. Running Assignments will not be stopped.',
      signal,
    });
    if (outcome !== 'allowed-once')
      throw new TobError(
        outcome === 'rejected'
          ? 'approval-denied'
          : outcome === 'cancelled'
            ? 'approval-cancelled'
            : 'approval-unavailable',
      );
    const guard = channelApproval.executionGuard(actor, call.callId);
    const check = () => {
      authorize();
      if (signal.aborted || !guard?.(call.name, call.arguments))
        throw new TobError('approval-authority-changed');
    };
    check();
    return check;
  } finally {
    untrack();
  }
}

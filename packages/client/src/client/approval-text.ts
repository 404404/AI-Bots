import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

export function toolApprovalText(
  message: Pick<ChannelMessage, 'toolApprovalRequest' | 'toolApprovalDecision'>,
  t: BotHarnessTranslate,
): string | undefined {
  if (message.toolApprovalRequest !== undefined)
    return t('approval.requestPreview', { tool: message.toolApprovalRequest.toolName });
  const outcome = message.toolApprovalDecision?.outcome;
  if (outcome === undefined) return undefined;
  return t(
    outcome === 'rejected'
      ? 'approval.rejected'
      : outcome === 'allowed-once'
        ? 'approval.approved'
        : 'approval.ruleSaved',
  );
}

export function toolApprovalReplyPreview(
  message: Pick<ChannelMessage, 'toolApprovalDecision'>,
  body: string,
  t: BotHarnessTranslate,
): string {
  return message.toolApprovalDecision === undefined ? body : t('approval.requestTitle');
}

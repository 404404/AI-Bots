import type { Context } from '@deepseek-ai/cordis';
import type { ChannelUserQuestions } from './user-questions.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';

export function mountChannelInteractionOwners(
  ctx: Context,
  owners: {
    questions: Pick<ChannelUserQuestions, 'ask'>;
    approvals: Pick<ChannelToolApproval, 'ask'>;
  },
): void {
  ctx.on(
    'user-questions/request',
    async (request, next) => (await owners.questions.ask(request)) ?? next(),
    { global: true, prepend: true },
  );
  ctx.on(
    'approval/request',
    async (request, next) => (await owners.approvals.ask(request)) ?? next(),
    { global: true, prepend: true },
  );
}

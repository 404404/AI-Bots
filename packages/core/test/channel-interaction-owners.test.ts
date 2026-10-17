import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { scopeTarget } from '@deepseek-ai/dsh-scope';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChannelInteractionOwners } from '../src/channels/interaction-owners.js';
import type { ChannelUserQuestions } from '../src/channels/user-questions.js';
import type { ChannelToolApproval } from '../src/workspaces/tool-approval.js';

const contexts: Context[] = [];
afterEach(async () => {
  while (contexts.length) await contexts.pop()!.fiber.dispose();
});

async function fixture() {
  const ctx = new Context();
  contexts.push(ctx);
  const agent = { id: 'owned', session: { id: 'owned' } } as Agent;
  const other = { id: 'unowned', session: { id: 'unowned' } } as Agent;
  const answer: AskUserQuestionAnswer = { answers: [{ id: 'choice', selected: ['Blue'] }] };
  const remoteApproval = vi.fn(async (): Promise<ApprovalOutcome> => 'rejected');
  const remoteQuestion = vi.fn(async (): Promise<AskUserQuestionAnswer> => ({ answers: [] }));
  ctx.on('approval/request', remoteApproval);
  ctx.on('user-questions/request', remoteQuestion);
  const approval = vi.fn<ChannelToolApproval['ask']>(async (request) =>
    request.agent === agent ? 'allowed-once' : undefined,
  );
  const question = vi.fn<ChannelUserQuestions['ask']>(async (request) =>
    request.agent === agent ? answer : undefined,
  );
  const fiber = await ctx.plugin((child) =>
    mountChannelInteractionOwners(child, {
      approvals: { ask: approval },
      questions: { ask: question },
    }),
  );
  const askApproval = (subject = agent) =>
    ctx.waterfall(
      scopeTarget(subject, subject),
      'approval/request',
      { agent: subject, toolName: 'bash' },
      async (): Promise<ApprovalOutcome> => 'unavailable',
    );
  const askQuestion = (subject = agent) =>
    ctx.waterfall(
      scopeTarget(subject, subject),
      'user-questions/request',
      { agent: subject, questions: [{ id: 'choice', question: 'Which color?' }] },
      async () => ({ answers: [] }),
    );
  return {
    agent,
    other,
    answer,
    fiber,
    approval,
    question,
    remoteApproval,
    remoteQuestion,
    askApproval,
    askQuestion,
  };
}

describe('Channel owners before a pre-existing native Remote answerer', () => {
  it('routes an owned approval before a Remote listener that would wait forever', async () => {
    const state = await fixture();
    state.remoteApproval.mockImplementation(() => new Promise(() => {}));
    const waiting = state.askApproval();
    await Promise.resolve();
    expect(state.approval).toHaveBeenCalledOnce();
    expect(state.remoteApproval).not.toHaveBeenCalled();
    await expect(waiting).resolves.toBe('allowed-once');
  });

  it('routes an owned question before a Remote listener that would wait forever', async () => {
    const state = await fixture();
    state.remoteQuestion.mockImplementation(() => new Promise(() => {}));
    const waiting = state.askQuestion();
    await Promise.resolve();
    expect(state.question).toHaveBeenCalledOnce();
    expect(state.remoteQuestion).not.toHaveBeenCalled();
    await expect(waiting).resolves.toEqual(state.answer);
  });

  it('delegates each unknown request exactly once', async () => {
    const state = await fixture();
    await expect(state.askApproval(state.other)).resolves.toBe('rejected');
    await expect(state.askQuestion(state.other)).resolves.toEqual({ answers: [] });
    expect(state.approval).toHaveBeenCalledOnce();
    expect(state.question).toHaveBeenCalledOnce();
    expect(state.remoteApproval).toHaveBeenCalledOnce();
    expect(state.remoteQuestion).toHaveBeenCalledOnce();
  });

  it.each(['cancelled', 'unavailable'] as const)(
    'keeps an owned %s decision terminal',
    async (outcome) => {
      const state = await fixture();
      state.approval.mockResolvedValue(outcome);
      await expect(state.askApproval()).resolves.toBe(outcome);
      expect(state.remoteApproval).not.toHaveBeenCalled();
    },
  );

  it('does not delegate an owner failure after it may have created a card', async () => {
    const state = await fixture();
    state.question.mockRejectedValue(new Error('question-owner-failed'));
    await expect(state.askQuestion()).rejects.toThrow('question-owner-failed');
    expect(state.remoteQuestion).not.toHaveBeenCalled();
  });

  it('unregisters only the Channel owner when its Fiber is disposed', async () => {
    const state = await fixture();
    await state.fiber.dispose();
    await expect(state.askApproval()).resolves.toBe('rejected');
    await expect(state.askQuestion()).resolves.toEqual({ answers: [] });
    expect(state.approval).not.toHaveBeenCalled();
    expect(state.question).not.toHaveBeenCalled();
    expect(state.remoteApproval).toHaveBeenCalledOnce();
    expect(state.remoteQuestion).toHaveBeenCalledOnce();
  });
});

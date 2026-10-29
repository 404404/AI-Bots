import type { AssistantMessage, Message, UserMessage } from '@earendil-works/pi-ai';
import { completeCodexTurn, type CodexTransport } from './model-runner.ts';
import { delegateTool, TaskEngine } from './task-engine.ts';
import { BotError, requireValue } from './errors.ts';
import type { ModelMessage } from './model.ts';

const userMessage = (content: string): UserMessage => ({ role: 'user', content, timestamp: Date.now() });
function historyMessage(message: ModelMessage): Message {
  if (message.role === 'user') return userMessage(message.content);
  return {
    role: 'assistant', content: [{ type: 'text', text: message.content }], api: 'openai-codex-responses',
    provider: 'openai-codex', model: 'history', stopReason: 'stop', timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  } as Message;
}

/** Runs the main model's actual tool-call/result loop and returns only its final text. */
export async function runMainTurn(args: {
  modelId: string; access: string; getAccess?: () => Promise<string>; authorizeRequest?: () => void;
  systemPrompt: string; history: ModelMessage[]; sessionId: string;
  proxyUrl: string; signal: AbortSignal; engine: TaskEngine; mainBotId: string; rootTaskId: string;
  transport?: CodexTransport;
}) {
  const systemPrompt = args.systemPrompt;
  const messages: Message[] = args.history.filter((item) => item.role !== 'system').map(historyMessage);
  const scope = args.engine.scope(args.mainBotId, args.rootTaskId);
  const canDelegate = scope.allowedWorkerIds.length > 0;
  let toolsUsed = false;
  for (let turn = 0; turn < 3; turn++) {
    const access = args.getAccess ? await args.getAccess() : args.access;
    const response = await completeCodexTurn({ modelId: args.modelId, access,
      systemPrompt, messages, tools: canDelegate && !toolsUsed ? [delegateTool] : undefined,
      proxyUrl: args.proxyUrl, sessionId: args.sessionId, signal: args.signal, transport: args.transport,
      beforeRequest: args.authorizeRequest });
    const calls = response.content.filter((part) => part.type === 'toolCall');
    if (calls.length === 0) {
      const text = response.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
      requireValue(text.length > 0 && text.length <= 64000, 'model-invalid-response', 'Codex 未返回有效文本。', 502);
      return text;
    }
    messages.push(response as AssistantMessage);
    for (const call of calls) {
      toolsUsed = true;
      const result = await args.engine.delegate(scope, call, args.signal);
      messages.push(result);
    }
  }
  throw new BotError('tool-turn-limit', '主 Bot 工具调用超过本次运行限制。', 409);
}

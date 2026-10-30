import { text, requireValue } from './errors.ts';

export type BotIdentity = { name: string; persona: string };

/** Shared validation for owner and scoped model edits; identity is the only editable surface. */
export function validateBotIdentityPatch(current: BotIdentity, params: Record<string, unknown>): BotIdentity {
  const allowed = new Set(['name', 'persona']);
  requireValue(Object.keys(params).every((key) => allowed.has(key)), 'invalid-worker-fields',
    '工作 Bot 管理只允许修改名称和身份提示。');
  const name = params.name === undefined ? current.name : text(params.name, 'Bot 名称', 100);
  const persona = params.persona === undefined ? current.persona : text(params.persona, '身份', 8000, true);
  requireValue(name.trim().length > 0, 'invalid-input', 'Bot 名称不能为空。');
  return { name, persona };
}

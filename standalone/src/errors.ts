export class BotError extends Error {
  code: string;
  status: number;
  upstreamStatus?: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function requireValue(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new BotError(code, message, status);
}

export function text(value: unknown, name: string, max = 12000, allowEmpty = false): string {
  requireValue(
    typeof value === 'string' && value.length <= max && !value.includes('\0'),
    'invalid-input',
    `${name} is invalid.`,
  );
  requireValue(allowEmpty || value.trim().length > 0, 'invalid-input', `${name} is required.`);
  return value;
}

export function publicError(error: unknown) {
  return error instanceof BotError
    ? { error: { code: error.code, message: error.message } }
    : { error: { code: 'internal-error', message: '操作未完成，请查看诊断记录。' } };
}

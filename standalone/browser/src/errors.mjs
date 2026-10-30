export class BrowserError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function requireValue(condition, code, message, status = 400) {
  if (!condition) throw new BrowserError(code, message, status);
}

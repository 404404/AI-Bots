import { TobError } from './service.js';

export function literalManagedCliArguments(command: string): string[] {
  if (command.length > 16000 || /[;&|<>$`\\\r\n(){}\u0000]/u.test(command))
    throw new TobError('memory-cli-command-required');
  const args: string[] = [];
  let cursor = 0;
  while (cursor < command.length) {
    while (/\s/u.test(command[cursor] ?? '') && cursor < command.length) cursor++;
    if (cursor === command.length) break;
    const quote =
      command[cursor] === "'" || command[cursor] === '"' ? command[cursor++] : undefined;
    const start = cursor;
    if (quote) {
      while (cursor < command.length && command[cursor] !== quote) cursor++;
      if (command[cursor] !== quote) throw new TobError('memory-cli-command-required');
      args.push(command.slice(start, cursor++));
      if (cursor < command.length && !/\s/u.test(command[cursor]!))
        throw new TobError('memory-cli-command-required');
    } else {
      while (cursor < command.length && !/\s/u.test(command[cursor]!)) {
        if (command[cursor] === "'" || command[cursor] === '"')
          throw new TobError('memory-cli-command-required');
        cursor++;
      }
      args.push(command.slice(start, cursor));
    }
    if (args.length > 100) throw new TobError('memory-cli-command-required');
  }
  if (args.shift() !== 'deepseekbot' || args.length === 0)
    throw new TobError('memory-cli-command-required');
  return args;
}

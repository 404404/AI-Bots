import { Lexer, type Token, type Tokens } from 'marked';

export function isMarkdownTable(token: Token): token is Tokens.Table {
  return (
    token.type === 'table' &&
    Array.isArray(token.header) &&
    Array.isArray(token.rows) &&
    Array.isArray(token.align)
  );
}

function inlineSupported(tokens: Token[]): boolean {
  return tokens.every((token) => {
    switch (token.type) {
      case 'escape':
      case 'codespan':
      case 'br':
        return true;
      case 'text':
        return (
          !token.text.includes('||') &&
          (token.tokens === undefined || inlineSupported(token.tokens))
        );
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
        return inlineSupported(token.tokens ?? []);
      default:
        return false;
    }
  });
}

export function textMarkdownSupported(tokens: Token[]): boolean {
  return tokens.every((token) => {
    if (['space', 'hr', 'code', 'def', 'checkbox'].includes(token.type)) return true;
    if (token.type === 'paragraph' || token.type === 'heading' || token.type === 'text')
      return token.tokens === undefined || inlineSupported(token.tokens);
    if (token.type === 'blockquote')
      return !/^\[![A-Z]+\]/i.test(token.text) && textMarkdownSupported(token.tokens ?? []);
    if (token.type === 'list')
      return token.items.every((item: { tokens: Token[] }) => textMarkdownSupported(item.tokens));
    if (isMarkdownTable(token))
      return [token.header, ...token.rows].every((row) =>
        row.every((cell) => inlineSupported(cell.tokens)),
      );
    return false;
  });
}

export interface MarkdownBlock {
  key: number;
  source: string;
}

export function markdownBlocks(source: string): MarkdownBlock[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const tokens = Lexer.lex(normalized, { gfm: true });
  if (
    Object.keys(tokens.links).length > 0 ||
    tokens.map((token) => token.raw).join('') !== normalized
  )
    return [{ key: 0, source }];
  const blocks: MarkdownBlock[] = [];
  let offset = 0;
  let leading = '';
  for (const token of tokens) {
    if (token.type === 'space') {
      const previous = blocks.at(-1);
      if (previous === undefined) leading += token.raw;
      else previous.source += token.raw;
    } else {
      blocks.push({ key: offset - leading.length, source: leading + token.raw });
      leading = '';
    }
    offset += token.raw.length;
  }
  return blocks;
}

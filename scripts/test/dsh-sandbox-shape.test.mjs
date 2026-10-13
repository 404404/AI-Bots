import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sandboxLocalSource() {
  const dsh = realpathSync(join(root, 'node_modules', '@deepseek-ai', 'dsh'));
  const fromDsh = createRequire(join(dsh, 'package.json'));
  const webApp = fromDsh.resolve('@deepseek-ai/dsh-web-app/package.json');
  const entry = createRequire(webApp).resolve('@deepseek-ai/dsh-sandbox-local');
  return readFileSync(entry, 'utf8');
}

describe('DSH sandbox runner shape the credential store read denial depends on', () => {
  it('still builds the Seatbelt profile as one -p argument and separates bwrap commands with --', () => {
    const source = sandboxLocalSource();
    expect(source).toContain('return ["-p", forms.join(" ")];');
    expect(source).toContain('"(allow default)"');
    expect(source).toContain('sandbox-exec');
    expect(source).toMatch(/"--ro-bind"/);
    expect(source).toMatch(/"--",\s*\.\.\.argv|\["--"\]|"--"\s*,/);
  });
});

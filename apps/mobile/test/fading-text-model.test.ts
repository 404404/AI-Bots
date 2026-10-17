import { describe, expect, it } from 'vitest';

import { appendTextReveal } from '../src/ui/primitives/fading-text-model';
import { streamReveal } from '../src/ui/design/tokens';

describe('incremental text reveal', () => {
  it('preserves the appearance time of existing glyphs and settles old text into its prefix', () => {
    const first = appendTextReveal(undefined, '你好', 1000);
    const next = appendTextReveal(first, '你好，世界', 1080);
    expect(next.glyphs.slice(0, 2)).toEqual(first.glyphs);
    expect(next.glyphs.at(-1)?.at).toBe(1080);
    const settled = appendTextReveal(next, next.text + '。', 2000);
    expect(settled.prefix).toBe(next.text);
    expect(settled.glyphs.map((glyph) => glyph.text)).toEqual(['。']);
  });

  it('bounds a burst without losing text or splitting a joined emoji across chunks', () => {
    let previous = appendTextReveal(undefined, '首段\n', 1000);
    for (let i = 1; i <= 80; i++) {
      const text = '首段\n' + '中文👨‍👩‍👧‍👦é'.repeat(i);
      previous = appendTextReveal(previous, text, 1000 + i * 10);
      expect(previous.glyphs.length).toBeLessThanOrEqual(streamReveal.maxGlyphs);
      expect(previous.prefix + previous.glyphs.map((glyph) => glyph.text).join('')).toBe(text);
      expect(previous.glyphs.every((glyph) => glyph.delay <= streamReveal.stagger)).toBe(true);
    }
    const partial = appendTextReveal(undefined, '家人👨', 1000);
    const joined = appendTextReveal(partial, '家人👨‍👩‍👧‍👦', 1080);
    expect(joined.glyphs.at(-1)?.text).toBe('👨‍👩‍👧‍👦');
    expect(joined.prefix + joined.glyphs.map((glyph) => glyph.text).join('')).toBe(joined.text);
  });

  it('shares fade spans for a fast batch while preserving single-grapheme slow appends', () => {
    const burst = '中文👨‍👩‍👧‍👦é'.repeat(8);
    const state = appendTextReveal(undefined, burst, 1000);
    expect(state.glyphs.length).toBeLessThanOrEqual(8);
    expect(state.prefix + state.glyphs.map((glyph) => glyph.text).join('')).toBe(burst);
    const slow = appendTextReveal(state, burst + '好', 1400);
    expect(slow.glyphs.map((glyph) => glyph.text)).toEqual(['好']);
    const partial = appendTextReveal(undefined, '中文'.repeat(14) + '家人👨', 1000);
    const joined = appendTextReveal(partial, partial.text + '‍👩‍👧‍👦', 1080);
    expect(joined.prefix + joined.glyphs.map((glyph) => glyph.text).join('')).toBe(joined.text);
  });

  it('accepts authoritative corrections immediately without replaying earlier text', () => {
    const first = appendTextReveal(undefined, 'Old body', 1000);
    expect(appendTextReveal(first, 'Corrected body', 1080)).toEqual({
      text: 'Corrected body',
      prefix: 'Corrected body',
      glyphs: [],
    });
  });
});

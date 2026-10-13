const STOP = /^[。！？!?…；;\n]$/u;
const CLOSE = /^[”’"'）)】」』\]]$/u;
const SOFT = /^[，、,：:\s]$/u;
const BEAT_LIMIT = 72;

export function speechBeats(body: string, boundaries: readonly number[]): readonly number[] {
  const ends: number[] = [];
  const grapheme = (index: number): string =>
    index < boundaries.length - 1 ? body.slice(boundaries[index], boundaries[index + 1]) : '';
  let start = 0;
  let soft = -1;
  const close = (end: number): void => {
    if (body.slice(boundaries[start], boundaries[end]).trim()) {
      ends.push(boundaries[end]!);
      start = end;
    }
    soft = -1;
  };
  for (let index = 0; index < boundaries.length - 1; index++) {
    const current = grapheme(index);
    const next = grapheme(index + 1);
    const terminal = STOP.test(current) || (current === '.' && (next === '' || /^\s$/u.test(next)));
    if (terminal && !STOP.test(next) && !CLOSE.test(next) && next !== '.') close(index + 1);
    else if (
      CLOSE.test(current) &&
      (STOP.test(grapheme(index - 1)) || grapheme(index - 1) === '.') &&
      !CLOSE.test(next)
    )
      close(index + 1);
    else if (index + 1 - start >= BEAT_LIMIT)
      close(soft > start + BEAT_LIMIT / 2 ? soft : index + 1);
    if (SOFT.test(current)) soft = index + 1;
  }
  const last = boundaries.at(-1) ?? 0;
  if (ends.at(-1) !== last) {
    if (ends.length && !body.slice(ends.at(-1), last).trim()) ends[ends.length - 1] = last;
    else ends.push(last);
  }
  return ends;
}

export function beatStart(beats: readonly number[], shown: number): number {
  let start = 0;
  for (const end of beats) {
    if (end >= shown) break;
    start = end;
  }
  return start;
}

export function beatHold(text: string, last: boolean, waiting: boolean): number {
  const length = [...text.trim()].length;
  if (!last) return Math.min(3000, 900 + length * 30);
  return waiting ? 1500 + length * 30 : Math.max(2500, Math.min(8000, 1600 + length * 70));
}

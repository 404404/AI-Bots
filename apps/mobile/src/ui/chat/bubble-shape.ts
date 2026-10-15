import { radius, space } from '../design/tokens';

export type BubbleGroup = { first: boolean; last: boolean };

/** The corners, padding and width every chat bubble shares, so a collapsed card reads as one. */
export function bubbleShape(human: boolean, { first, last }: BubbleGroup) {
  return {
    maxWidth: '80%',
    alignSelf: human ? 'flex-end' : 'flex-start',
    borderRadius: radius.lg,
    ...(human
      ? {
          borderTopRightRadius: first ? radius.lg : radius.xs,
          borderBottomRightRadius: last ? radius.lg : radius.xs,
        }
      : {
          borderTopLeftRadius: first ? radius.lg : radius.xs,
          borderBottomLeftRadius: last ? radius.lg : radius.xs,
        }),
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  } as const;
}

/** The row around a bubble: the chat gutter, and a tighter gap inside a group. */
export function bubbleRow(first: boolean) {
  return { paddingHorizontal: space.x4, paddingTop: first ? space.x3 : space.x1 } as const;
}

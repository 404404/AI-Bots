import type { CSSProperties } from 'react';

export function withHook(
  hook: string,
  props: Readonly<{ className?: string; style?: CSSProperties }>,
): { className: string; style?: CSSProperties } {
  const { className, style } = props;
  return {
    className: className === undefined ? hook : `${hook} ${className}`,
    ...(style === undefined ? {} : { style }),
  };
}

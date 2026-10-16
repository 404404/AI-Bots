import type { TextStyle } from 'react-native';

export function systemTextStyle(
  style: TextStyle | undefined,
  fontScale: number,
  allowFontScaling = true,
  maxFontSizeMultiplier = 0,
): TextStyle | undefined {
  if (!style || !allowFontScaling) return style;
  const scale = maxFontSizeMultiplier >= 1 ? Math.min(fontScale, maxFontSizeMultiplier) : fontScale;
  return {
    ...style,
    ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize * scale }),
    ...(style.lineHeight === undefined ? {} : { lineHeight: style.lineHeight * scale }),
  };
}

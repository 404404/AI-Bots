import { createContext, useContext, type ComponentPropsWithRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  useWindowDimensions,
  type TextStyle,
  type StyleProp,
} from 'react-native';

import { systemTextStyle } from '../design/system-type';
import { typeScale } from '../design/tokens';

const TextAncestor = createContext<number | null>(null);

function useSystemTextStyle(
  style: StyleProp<TextStyle>,
  allowFontScaling: boolean | undefined,
  maxFontSizeMultiplier: number | undefined,
) {
  const { fontScale } = useWindowDimensions();
  return Platform.OS === 'ios'
    ? systemTextStyle(StyleSheet.flatten(style), fontScale, allowFontScaling, maxFontSizeMultiplier)
    : style;
}

export function Text({ style, ...props }: ComponentPropsWithRef<typeof NativeText>) {
  const parentMaximum = useContext(TextAncestor);
  const maximum = props.maxFontSizeMultiplier ?? parentMaximum ?? 0;
  const scaled = useSystemTextStyle(
    Platform.OS === 'ios' && parentMaximum === null
      ? [{ fontSize: typeScale.ios.body.size }, style]
      : style,
    props.allowFontScaling,
    maximum,
  );
  return (
    <NativeText
      {...props}
      style={scaled}
      allowFontScaling={Platform.OS === 'ios' ? false : props.allowFontScaling}
    >
      <TextAncestor.Provider value={maximum}>{props.children}</TextAncestor.Provider>
    </NativeText>
  );
}

export type TextInput = NativeTextInput;

export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof NativeTextInput>) {
  const scaled = useSystemTextStyle(
    Platform.OS === 'ios' ? [{ fontSize: typeScale.ios.body.size }, style] : style,
    props.allowFontScaling,
    props.maxFontSizeMultiplier ?? undefined,
  );
  return (
    <NativeTextInput
      {...props}
      style={scaled}
      allowFontScaling={Platform.OS === 'ios' ? false : props.allowFontScaling}
    />
  );
}

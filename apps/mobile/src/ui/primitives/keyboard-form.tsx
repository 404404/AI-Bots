import type { ComponentPropsWithRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';

export function KeyboardFormScroll(props: ComponentPropsWithRef<typeof KeyboardAwareScrollView>) {
  const theme = useDesignTheme();
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      bottomOffset={theme.touch + space.x3}
      {...props}
      automaticallyAdjustKeyboardInsets={false}
    />
  );
}

export function renderKeyboardFormScroll(props: ScrollViewProps) {
  return <KeyboardFormScroll {...props} />;
}

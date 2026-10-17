import type { ReactNode } from 'react';
import { KeyboardAvoidingView, View, type ColorValue, type LayoutChangeEvent } from 'react-native';

export interface KeyboardChatFrameProps {
  children: ReactNode;
  composer: ReactNode;
  backgroundColor: ColorValue;
  onMount(node: unknown): void;
  onComposerLayout(event: LayoutChangeEvent): void;
}

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return children;
}

export function KeyboardChatFrame({
  children,
  composer,
  backgroundColor,
  onMount,
  onComposerLayout,
}: KeyboardChatFrameProps) {
  return (
    <KeyboardAvoidingView ref={onMount} style={{ flex: 1, backgroundColor }} behavior="padding">
      <View style={{ flex: 1 }}>
        {children}
        <View
          onLayout={onComposerLayout}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          {composer}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

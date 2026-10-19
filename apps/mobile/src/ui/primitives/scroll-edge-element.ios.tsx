import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useState, type ReactNode } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

type EdgeProps = ViewProps & { edge: 'top' | 'bottom'; revision: string };

export const nativeScrollEdge =
  Number.parseInt(String(Platform.Version), 10) >= 26 &&
  requireOptionalNativeModule('ScrollEdgeElement') !== null;
const NativeEdge = nativeScrollEdge ? requireNativeView<EdgeProps>('ScrollEdgeElement') : undefined;

export function ScrollEdgeElement({
  edge,
  children,
}: {
  edge: 'top' | 'bottom';
  children: ReactNode;
}) {
  if (NativeEdge === undefined) return <View>{children}</View>;
  return <NativeScrollEdge edge={edge}>{children}</NativeScrollEdge>;
}

function NativeScrollEdge({ edge, children }: { edge: 'top' | 'bottom'; children: ReactNode }) {
  const keyboard = useKeyboardState((state) => state.isVisible);
  const [height, setHeight] = useState(0);
  if (NativeEdge === undefined) return null;
  return (
    <NativeEdge
      edge={edge}
      revision={`${keyboard ? 'open' : 'closed'}:${height}`}
      onLayout={(event) => setHeight(Math.round(event.nativeEvent.layout.height))}
    >
      {children}
    </NativeEdge>
  );
}

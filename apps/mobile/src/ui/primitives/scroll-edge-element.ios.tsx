import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ReactNode } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

type EdgeProps = ViewProps & { edge: 'top' | 'bottom' };

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
  return <NativeEdge edge={edge}>{children}</NativeEdge>;
}

import type { ReactNode } from 'react';
import { View } from 'react-native';

export const nativeScrollEdge = false;

export function ScrollEdgeElement({ children }: { edge: 'top' | 'bottom'; children: ReactNode }) {
  return <View>{children}</View>;
}

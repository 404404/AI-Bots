import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform } from 'react-native';

export const glassHeader =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

export function useHeaderOverlap(): number {
  const height = useHeaderHeight();
  return Platform.OS === 'ios' ? height : 0;
}

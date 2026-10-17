import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import type { ParamListBase } from 'expo-router/react-navigation';
import { useState } from 'react';
import type { View } from 'react-native';

import { useMounted } from '../mounted';

export function useSheetContent() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>('/');
  const [ready, setReady] = useState(false);
  const mount = useMounted<View>(
    () =>
      navigation.addListener('transitionEnd', (event) => {
        if (!event.data.closing) setReady(true);
      }),
    [navigation],
  );
  return { ready, mount };
}

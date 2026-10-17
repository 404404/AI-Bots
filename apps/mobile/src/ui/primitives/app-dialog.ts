import { Alert, Keyboard, Platform } from 'react-native';

import { appDialogs, type DialogAction } from './dialog-state';

export function showAppDialog(
  title: string,
  message: string | undefined,
  actions: readonly DialogAction[],
): void {
  if (Platform.OS === 'android') {
    Keyboard.dismiss();
    appDialogs.open(title, message, actions);
    return;
  }
  Alert.alert(
    title,
    message,
    actions.map(({ onPress, ...action }) => ({
      ...action,
      ...(onPress === undefined
        ? {}
        : {
            onPress: () => {
              void Promise.resolve(onPress()).catch(() => undefined);
            },
          }),
    })),
  );
}

import { Pressable, View } from 'react-native';

import {
  QUICK_REACTIONS,
  reactable,
  reactedByMe,
  type ConversationMessage,
} from '../../host/conversation';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { Sheet } from './sheet';

export function MessageActions({
  message,
  onClose,
  onReact,
  onCopy,
}: {
  message: ConversationMessage | undefined;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
}) {
  const theme = useDesignTheme();
  const mine = new Set(
    (message?.reactions ?? []).filter(reactedByMe).map((reaction) => reaction.emoji),
  );
  return (
    <Sheet visible={message !== undefined} label={t.messageActions} onClose={onClose}>
      {message === undefined ? null : (
        <>
          {reactable(message) ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-around',
                paddingHorizontal: space.x4,
                paddingBottom: space.x3,
              }}
            >
              {QUICK_REACTIONS.map((emoji) => {
                const picked = mine.has(emoji);
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={picked ? t.unreact(emoji) : t.react(emoji)}
                    accessibilityState={{ selected: picked }}
                    onPress={() => {
                      onReact(message, emoji, !picked);
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      width: theme.touch,
                      height: theme.touch,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.round,
                      backgroundColor: picked
                        ? theme.layer.sheet.chosen
                        : pressed
                          ? theme.layer.sheet.pressed
                          : theme.layer.sheet.fill,
                    })}
                  >
                    <Text variant="title">{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {message.body.trim() === '' ? null : (
            <SettingsRow
              title={t.copy}
              onPress={() => {
                onCopy(message.body);
                onClose();
              }}
            />
          )}
          <SettingsRow title={t.cancel} tone="muted" onPress={onClose} />
        </>
      )}
    </Sheet>
  );
}

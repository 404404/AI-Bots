import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { botDotTone } from './bot-tone';

const AVATAR = 28;

export function ChatTitle({
  bot,
  fallback,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const status = bot === undefined ? undefined : bot.paused ? t.paused : t.state[bot.state];
  const name = bot?.displayName ?? fallback;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status === undefined ? name : `${name}, ${status}`}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingLeft: bot === undefined ? space.x5 : space.x2,
        paddingRight: space.x4,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {bot === undefined ? null : <BotAvatar bot={bot} size={AVATAR} ring={false} />}
      <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      {bot === undefined ? null : (
        <View
          testID="chat-title-state"
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: theme.color[botDotTone(bot)],
          }}
        />
      )}
    </Pressable>
  );
}

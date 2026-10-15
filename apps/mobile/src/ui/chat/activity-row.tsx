import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { ChannelActivity } from '../../host/channel-activity';
import type { RosterView } from '../../host/client';
import type { ConversationMessage } from '../../host/conversation';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { GitCommitIcon } from '../shell/icons';
import { activityText } from './activity-text';

export function ActivityRow({
  message,
  activity,
  roster,
  count = 1,
}: {
  message: ConversationMessage;
  activity: ChannelActivity;
  roster: RosterView | undefined;
  count?: number;
}) {
  const router = useRouter();
  const theme = useDesignTheme();
  const line = activityText(message, activity, roster, count);
  const bot = roster?.bots.find((entry) => entry.slug === line.botSlug);
  const label = [`${line.name} ${line.verb}`, line.detail]
    .filter((part) => part !== undefined)
    .join(' ');
  return (
    <Pressable
      accessible
      accessibilityRole={line.target === undefined ? 'text' : 'button'}
      accessibilityLabel={label}
      disabled={line.target === undefined}
      onPress={() => {
        if (line.target !== undefined) router.push(line.target);
      }}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.touch,
        paddingHorizontal: space.x6,
        paddingVertical: space.x2,
        gap: space.x1,
        backgroundColor: pressed ? theme.layer.sheet.pressed : 'transparent',
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.x2,
        }}
      >
        {activity.kind === 'memory' ? (
          <GitCommitIcon color={theme.color.muted} size={space.x5} />
        ) : null}
        {bot === undefined ? null : (
          <BotAvatar bot={bot} size={space.x5} corner={radius.xs} ring={false} />
        )}
        <Text variant="meta" tone="muted" style={{ textAlign: 'center', flexShrink: 1 }}>
          <Text variant="meta" strong>
            {line.name}
          </Text>{' '}
          {line.verb}
        </Text>
      </View>
      {line.detail === undefined ? null : (
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {line.detail}
        </Text>
      )}
    </Pressable>
  );
}

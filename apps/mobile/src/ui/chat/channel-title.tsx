import { View } from 'react-native';

import type { RosterChannel } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
}: {
  channel: RosterChannel | undefined;
  fallback: string;
}) {
  const theme = useDesignTheme();
  const name = channel?.name ?? fallback;
  const members = channel === undefined ? undefined : t.members(channel.memberCount);
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={members === undefined ? name : `${name}, ${members}`}
      style={{
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
      }}
    >
      <View
        style={{
          width: MARK,
          height: MARK,
          borderRadius: radius.sm,
          backgroundColor: theme.color.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text strong tone="muted">
          #
        </Text>
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text strong numberOfLines={1}>
          {name}
        </Text>
        {members === undefined ? null : (
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {members}
          </Text>
        )}
      </View>
    </View>
  );
}

import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { buttonColors } from '../design/controls';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronDownIcon, RecordingStopIcon } from '../shell/icons';
import { t } from '../strings';
import { stepLabel, stepRows } from './bot-steps';

const AVATAR = 32;

export function WorkingCard({
  bot,
  stopping,
  onStop,
}: {
  bot: RosterBot;
  stopping: boolean;
  onStop(): void;
}) {
  const theme = useDesignTheme();
  const stopColors = buttonColors(theme, 'secondary', 'raised');
  const [open, setOpen] = useState(false);
  const rows = stepRows(bot);
  const expandable = rows.length > 0;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: space.x4, paddingTop: space.x3 }}
    >
      <View
        testID="working-card"
        style={{
          backgroundColor: theme.layer.raised.fill,
          borderRadius: radius.lg,
          paddingVertical: space.x3,
          paddingLeft: space.x4,
          paddingRight: space.x3,
          gap: space.x3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.showSteps(bot.displayName)}
            accessibilityState={{ expanded: open, disabled: !expandable }}
            disabled={!expandable}
            onPress={() => setOpen((current) => !current)}
            style={{
              flex: 1,
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x3,
            }}
          >
            <BotAvatar bot={bot} size={AVATAR} ring={false} />
            <View style={{ flex: 1, gap: space.x1 }}>
              <Text strong numberOfLines={1}>
                {bot.displayName}
              </Text>
              <Text variant="meta" tone="muted" numberOfLines={1}>
                {`${stepLabel(bot.activity, bot.state)}…`}
              </Text>
            </View>
            {expandable ? (
              <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                <ChevronDownIcon color={theme.color.muted} size={theme.type.meta.line} />
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stopping ? t.stopping : t.stopBot(bot.displayName)}
            accessibilityState={{ disabled: stopping, busy: stopping }}
            disabled={stopping}
            onPress={onStop}
            hitSlop={space.x2}
            style={({ pressed }) => ({
              width: theme.touch,
              height: theme.touch,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.round,
              backgroundColor: pressed ? stopColors.pressed : stopColors.fill,
              opacity: stopping ? 0.6 : 1,
            })}
          >
            <RecordingStopIcon color={stopColors.label} size={theme.type.title.line} />
          </Pressable>
        </View>
        {open && expandable ? (
          <View
            style={{
              backgroundColor: theme.layer.well.fill,
              borderRadius: radius.md,
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              gap: space.x2,
            }}
          >
            {rows.map((row) => (
              <View key={row.key} style={{ flexDirection: 'row', gap: space.x3 }}>
                <Text variant="meta" strong numberOfLines={1} style={{ flexShrink: 1 }}>
                  {row.who}
                </Text>
                <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 2 }}>
                  {row.what}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

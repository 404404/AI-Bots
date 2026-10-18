import { Pressable, ScrollView, View } from 'react-native';

import { Sheet } from '../chat/sheet';
import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { ChatsIcon, CloudIcon, ComputerIcon, PlusIcon } from './icons';

export function WorkspaceAddButton({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.workspaceAdd.title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        marginHorizontal: space.x5,
        marginVertical: space.x3,
        padding: space.x4,
        borderRadius: radius.xl,
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      <Text strong style={{ flex: 1 }}>
        {t.workspaceAdd.title}
      </Text>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', paddingLeft: space.x3 }}
      >
        {[ComputerIcon, CloudIcon, ChatsIcon].map((Icon, index) => (
          <View
            key={index}
            style={{
              marginLeft: -space.x3,
              padding: space.x3,
              borderRadius: radius.round,
              borderWidth: edge.hairline,
              borderColor: theme.layer.raised.edge,
              backgroundColor: theme.layer.sheet.fill,
            }}
          >
            <Icon color={theme.color.muted} size={theme.type.body.size} />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export function WorkspaceAddSheet({
  visible,
  onClose,
  onPair,
  onJoin,
}: {
  visible: boolean;
  onClose(): void;
  onPair(): void;
  onJoin(): void;
}) {
  const theme = useDesignTheme();
  const choices = [
    { label: t.pairAnother, detail: t.workspaceAdd.pairHint, Icon: ComputerIcon, run: onPair },
    { label: t.workspaceAdd.join, detail: t.workspaceAdd.joinHint, Icon: CloudIcon, run: onJoin },
  ];
  return (
    <Sheet
      visible={visible}
      label={t.workspaceAdd.title}
      title={t.workspaceAdd.title}
      onClose={onClose}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.x5,
          paddingBottom: space.x4,
          gap: space.x3,
        }}
      >
        {choices.map(({ label, detail, Icon, run }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={detail}
            onPress={run}
            style={({ pressed }) => ({
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space.x4,
              padding: space.x5,
              borderRadius: radius.lg,
              backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
            })}
          >
            <Icon color={theme.color.fg} size={theme.type.body.line} />
            <View style={{ flex: 1, gap: space.x2 }}>
              <Text strong>{label}</Text>
              <Text tone="muted">{detail}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

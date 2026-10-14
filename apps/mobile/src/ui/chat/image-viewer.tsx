import type { ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageAttachment } from '../../host/conversation';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { CloseIcon, ShareIcon } from '../shell/icons';
import { t } from '../strings';

function RoundButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surface,
      }}
    >
      {children}
    </Pressable>
  );
}

export function ImageViewer({
  attachment,
  onClose,
  onShare,
}: {
  attachment: MessageAttachment | undefined;
  onClose(): void;
  onShare(attachment: MessageAttachment): Promise<void>;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal
      visible={attachment !== undefined}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.color.base }}>
        {attachment?.source === undefined ? null : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={attachment.source}
              resizeMode="contain"
              accessibilityLabel={attachment.name}
              style={{ width, height: height - insets.top - insets.bottom }}
            />
          </ScrollView>
        )}
        <View
          style={{
            position: 'absolute',
            top: insets.top + space.x3,
            left: space.x5,
            right: space.x5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x4,
          }}
        >
          <RoundButton label={t.closeViewer} onPress={onClose}>
            <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
          </RoundButton>
          <Text numberOfLines={1} ellipsizeMode="middle" style={{ flex: 1, textAlign: 'center' }}>
            {attachment?.name ?? ''}
          </Text>
          <RoundButton
            label={t.shareFile(attachment?.name ?? '')}
            onPress={() => {
              if (attachment !== undefined) void onShare(attachment);
            }}
          >
            <ShareIcon color={theme.color.fg} size={theme.type.title.line} />
          </RoundButton>
        </View>
      </View>
    </Modal>
  );
}

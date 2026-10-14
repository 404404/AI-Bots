import { useState, type ReactNode } from 'react';
import { Image, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PickSource, PickedFile } from '../../host/pick-files';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ArrowUpIcon, CameraIcon, CloseIcon, FileIcon, PhotoIcon, PlusIcon } from '../shell/icons';
import { t } from '../strings';

const SOURCES: Array<{ source: PickSource; label: string; Icon: typeof PhotoIcon }> = [
  { source: 'photos', label: t.attachPhotos, Icon: PhotoIcon },
  { source: 'camera', label: t.attachCamera, Icon: CameraIcon },
  { source: 'file', label: t.attachFile, Icon: FileIcon },
];

function RoundButton({
  label,
  filled,
  onPress,
  children,
}: {
  label: string;
  filled: boolean;
  onPress(): void;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const size = theme.touch - space.x4;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space.x2}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? theme.color.accent : pressed ? theme.color.hover : undefined,
        opacity: filled && pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function AttachmentTile({ file, onRemove }: { file: PickedFile; onRemove(): void }) {
  const theme = useDesignTheme();
  const tile = theme.touch + space.x5;
  const badge = theme.type.meta.line + space.x1;
  return (
    <View style={{ paddingTop: space.x2, paddingRight: space.x2 }}>
      {file.kind === 'image' ? (
        <Image
          source={{ uri: file.uri }}
          accessibilityLabel={file.name}
          style={{
            width: tile,
            height: tile,
            borderRadius: radius.md,
            backgroundColor: theme.color.selected,
          }}
        />
      ) : (
        <View
          style={{
            height: tile,
            maxWidth: tile * 3,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            paddingHorizontal: space.x3,
            borderRadius: radius.md,
            backgroundColor: theme.color.selected,
          }}
        >
          <FileIcon color={theme.color.muted} size={theme.type.title.line} />
          <Text variant="meta" numberOfLines={2} style={{ flexShrink: 1 }}>
            {file.name}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.removeAttachment(file.name)}
        onPress={onRemove}
        hitSlop={space.x3}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: badge,
          height: badge,
          borderRadius: radius.round,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: edge.focus,
          borderColor: theme.color.surface,
          backgroundColor: theme.color.fg,
        }}
      >
        <CloseIcon color={theme.color.base} size={theme.type.meta.size} />
      </Pressable>
    </View>
  );
}

function AttachMenu({ onPick }: { onPick(source: PickSource): void }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: space.x5,
        paddingBottom: space.x2,
      }}
    >
      {SOURCES.map(({ source, label, Icon }) => (
        <Pressable
          key={source}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onPick(source)}
          style={({ pressed }) => ({
            alignItems: 'center',
            gap: space.x2,
            minWidth: theme.touch * 2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: theme.touch + space.x3,
              height: theme.touch + space.x3,
              borderRadius: radius.round,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.surface,
              borderWidth: edge.hairline,
              borderColor: theme.color.border,
            }}
          >
            <Icon color={theme.color.fg} size={theme.type.display.size} />
          </View>
          <Text variant="meta" tone="muted">
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Composer({
  value,
  placeholder,
  disabled,
  files,
  canAttach,
  onChange,
  onSend,
  onPick,
  onRemove,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  files: PickedFile[];
  canAttach: boolean;
  onChange(next: string): void;
  onSend(): void;
  onPick(source: PickSource): void;
  onRemove(id: string): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const ready = (value.trim() !== '' || files.length > 0) && !disabled;
  const toggleMenu = () => {
    if (!menu) Keyboard.dismiss();
    setMenu(!menu);
  };
  return (
    <View
      style={{
        paddingHorizontal: space.x4,
        paddingTop: space.x3,
        paddingBottom: Math.max(insets.bottom, space.x3),
        backgroundColor: theme.color.base,
      }}
    >
      <View
        style={{
          borderRadius: radius.lg + space.x3,
          borderWidth: edge.hairline,
          borderColor: theme.color.borderStrong,
          backgroundColor: theme.color.surface,
          overflow: 'hidden',
        }}
      >
        {files.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.x4, paddingTop: space.x2 }}
          >
            {files.map((file) => (
              <AttachmentTile key={file.id} file={file} onRemove={() => onRemove(file.id)} />
            ))}
          </ScrollView>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: space.x2,
            paddingHorizontal: space.x2,
            paddingVertical: space.x3,
          }}
        >
          {canAttach ? (
            <RoundButton
              label={menu ? t.closeAttach : t.attach}
              filled={false}
              onPress={toggleMenu}
            >
              {menu ? (
                <CloseIcon color={theme.color.muted} size={theme.type.title.line} />
              ) : (
                <PlusIcon color={theme.color.muted} size={theme.type.title.line} />
              )}
            </RoundButton>
          ) : null}
          <TextInput
            value={value}
            onChangeText={onChange}
            onFocus={() => setMenu(false)}
            placeholder={placeholder}
            placeholderTextColor={theme.color.subtle}
            accessibilityLabel={placeholder}
            multiline
            style={{
              flex: 1,
              maxHeight: theme.touch * 3,
              minHeight: theme.touch - space.x4,
              paddingVertical: (theme.touch - space.x4 - theme.type.body.line) / 2,
              paddingLeft: canAttach ? 0 : space.x3,
              color: theme.color.fg,
              fontSize: theme.type.body.size,
              lineHeight: theme.type.body.line,
            }}
          />
          {ready ? (
            <RoundButton label={t.send} filled onPress={onSend}>
              <ArrowUpIcon color={theme.color.onAccent} size={theme.type.title.line} />
            </RoundButton>
          ) : null}
        </View>
      </View>
      {menu && canAttach ? (
        <AttachMenu
          onPick={(source) => {
            setMenu(false);
            onPick(source);
          }}
        />
      ) : null}
    </View>
  );
}

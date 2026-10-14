import { useState, type ReactNode } from 'react';
import { Image, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PickSource, PickedFile } from '../../host/pick-files';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import {
  ArrowUpIcon,
  CameraIcon,
  CloseIcon,
  FileIcon,
  MicIcon,
  PhotoIcon,
  PlusIcon,
  StopIcon,
} from '../shell/icons';
import { t } from '../strings';
import { composerActions, composerStacked, dictating, type DictationStatus } from './dictation';

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

function DictationLine({ status }: { status: DictationStatus }) {
  const theme = useDesignTheme();
  const dot = space.x2;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.x2 }}
    >
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: radius.round,
          backgroundColor: status === 'listening' ? theme.color.accent : theme.color.subtle,
        }}
      />
      <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {status === 'listening' ? t.dictationListening : t.dictationStarting}
      </Text>
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
  dictation,
  canDictate,
  onChange,
  onSend,
  onPick,
  onRemove,
  onDictate,
  onStopDictation,
  onCancelDictation,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  files: PickedFile[];
  canAttach: boolean;
  dictation: DictationStatus;
  canDictate: boolean;
  onChange(next: string): void;
  onSend(): void;
  onPick(source: PickSource): void;
  onRemove(id: string): void;
  onDictate(): void;
  onStopDictation(): void;
  onCancelDictation(): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const lineHeight = theme.touch - space.x4;
  const inset = space.x3;
  const listening = dictating(dictation);
  const actions = composerActions({
    text: value,
    files: files.length,
    disabled,
    dictation,
    canDictate,
  });
  const toggleMenu = () => {
    if (!menu) Keyboard.dismiss();
    setMenu(!menu);
  };
  const stacked = composerStacked(actions, files.length);
  const icon = theme.type.title.line;
  const leading = listening ? (
    <RoundButton label={t.cancelDictation} filled={false} onPress={onCancelDictation}>
      <CloseIcon color={theme.color.muted} size={icon} />
    </RoundButton>
  ) : canAttach ? (
    <RoundButton label={menu ? t.closeAttach : t.attach} filled={false} onPress={toggleMenu}>
      {menu ? (
        <CloseIcon color={theme.color.muted} size={icon} />
      ) : (
        <PlusIcon color={theme.color.muted} size={icon} />
      )}
    </RoundButton>
  ) : null;
  const field = (
    <TextInput
      value={value}
      onChangeText={onChange}
      onFocus={() => setMenu(false)}
      placeholder={placeholder}
      placeholderTextColor={theme.color.subtle}
      accessibilityLabel={placeholder}
      multiline
      editable={!listening}
      onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
      style={{
        flex: stacked ? undefined : 1,
        height: Math.min(Math.max(contentHeight, lineHeight), theme.touch * 3),
        paddingVertical: (lineHeight - theme.type.body.line) / 2,
        paddingHorizontal: stacked || leading === null ? space.x3 : 0,
        color: theme.color.fg,
        fontSize: theme.type.body.size,
        lineHeight: theme.type.body.line,
      }}
    />
  );
  const trailing = actions.map((action) =>
    action === 'mic' ? (
      <RoundButton
        key={action}
        label={t.dictate}
        filled={false}
        onPress={() => {
          setMenu(false);
          onDictate();
        }}
      >
        <MicIcon color={theme.color.muted} size={icon} />
      </RoundButton>
    ) : action === 'stop' ? (
      <RoundButton key={action} label={t.stopDictation} filled onPress={onStopDictation}>
        <StopIcon color={theme.color.onAccent} size={icon} />
      </RoundButton>
    ) : (
      <RoundButton key={action} label={t.send} filled onPress={onSend}>
        <ArrowUpIcon color={theme.color.onAccent} size={icon} />
      </RoundButton>
    ),
  );
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
          borderRadius: (theme.touch - space.x4) / 2 + inset,
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
        {stacked ? (
          <View style={{ padding: inset }}>
            {field}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x2,
                paddingTop: space.x2,
              }}
            >
              {leading}
              {listening ? <DictationLine status={dictation} /> : <View style={{ flex: 1 }} />}
              {trailing}
            </View>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: space.x2,
              padding: inset,
            }}
          >
            {leading}
            {field}
            {trailing}
          </View>
        )}
      </View>
      {menu && canAttach && !listening ? (
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

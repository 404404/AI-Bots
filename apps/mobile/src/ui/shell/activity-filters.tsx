import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INBOX_SECTIONS, type InboxSection } from '../../host/inbox';
import { Sheet } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CheckIcon } from './icons';
import { t } from '../strings';

export type ActivitySection = 'all' | InboxSection;
export type ActivityFilter = {
  section: ActivitySection;
  bot: string | undefined;
  channel?: string | undefined;
  unreadOnly?: boolean;
};
export type ActivitySort = 'default' | 'newest' | 'oldest';
export const ALL_ACTIVITY: ActivityFilter = { section: 'all', bot: undefined };
const SECTIONS: readonly ActivitySection[] = ['all', ...INBOX_SECTIONS];

type Props = {
  visible: boolean;
  bots: ReadonlyArray<{ slug: string; name: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  filter: ActivityFilter;
  sort: ActivitySort;
  onFilter(next: ActivityFilter): void;
  onSort(next: ActivitySort): void;
  onClose(): void;
};

type Choice = { key: string; label: string; selected: boolean; choose(): void };
type Row =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'choice'; first: boolean; last: boolean; choice: Choice; key: string }
  | { kind: 'unread'; key: string };

function TextAction({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        justifyContent: 'center',
        paddingHorizontal: space.x3,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text tone="accent" strong>
        {label}
      </Text>
    </Pressable>
  );
}

function Selection({ selected }: { selected: boolean }) {
  const theme = useDesignTheme();
  if (Platform.OS === 'ios')
    return selected ? <CheckIcon color={theme.color.accent} size={theme.type.body.line} /> : null;
  return (
    <View
      style={{
        width: theme.type.body.line,
        height: theme.type.body.line,
        borderRadius: radius.round,
        borderWidth: edge.focus,
        borderColor: selected ? theme.color.accent : theme.color.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View
          style={{
            width: space.x3,
            height: space.x3,
            borderRadius: radius.round,
            backgroundColor: theme.color.accent,
          }}
        />
      ) : null}
    </View>
  );
}

function OptionsEditor({ bots, channels, filter, sort, onFilter, onSort, onClose }: Props) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const [draft, setDraft] = useState(filter);
  const [order, setOrder] = useState(sort);
  const group = (key: string, label: string, choices: Choice[]): Row[] => [
    { kind: 'heading', key, label },
    ...choices.map((choice, index) => ({
      kind: 'choice' as const,
      key: choice.key,
      choice,
      first: index === 0,
      last: index === choices.length - 1,
    })),
  ];
  const rows: Row[] = [
    ...group('sort', t.activitySort, [
      {
        key: 'default',
        label: t.activitySortDefault,
        selected: order === 'default',
        choose: () => setOrder('default'),
      },
      {
        key: 'newest',
        label: t.activitySortNewest,
        selected: order === 'newest',
        choose: () => setOrder('newest'),
      },
      {
        key: 'oldest',
        label: t.activitySortOldest,
        selected: order === 'oldest',
        choose: () => setOrder('oldest'),
      },
    ]),
    ...group(
      'category',
      t.activityCategory,
      SECTIONS.map((section) => ({
        key: `section:${section}`,
        label: section === 'all' ? t.filterAll : t.inboxSections[section],
        selected: draft.section === section,
        choose: () => setDraft({ ...draft, section }),
      })),
    ),
    { kind: 'unread', key: 'unread' },
    ...group('bots', t.bots, [
      {
        key: 'bot:all',
        label: t.filterAllBots,
        selected: draft.bot === undefined,
        choose: () => setDraft({ ...draft, bot: undefined }),
      },
      ...bots.map((bot) => ({
        key: `bot:${bot.slug}`,
        label: bot.name,
        selected: draft.bot === bot.slug,
        choose: () => setDraft({ ...draft, bot: bot.slug }),
      })),
    ]),
    ...group('channels', t.channels, [
      {
        key: 'channel:all',
        label: t.activityAllChannels,
        selected: draft.channel === undefined,
        choose: () => setDraft({ ...draft, channel: undefined }),
      },
      ...channels.map((channel) => ({
        key: `channel:${channel.id}`,
        label: channel.name,
        selected: draft.channel === channel.id,
        choose: () => setDraft({ ...draft, channel: channel.id }),
      })),
    ]),
  ];
  const apply = () => {
    onFilter(draft);
    onSort(order);
    onClose();
  };
  const actions = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.x4,
      }}
    >
      <TextAction label={t.cancel} onPress={onClose} />
      <TextAction label={t.done} onPress={apply} />
    </View>
  );
  const content = (
    <>
      {ios ? actions : null}
      <Text
        variant="display"
        strong
        accessibilityRole="header"
        style={{ paddingHorizontal: space.x5, paddingTop: space.x2, paddingBottom: space.x3 }}
      >
        {t.activityOptions}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.x6 }}
        renderItem={({ item }) => {
          if (item.kind === 'heading')
            return (
              <Text
                variant="meta"
                tone="muted"
                accessibilityRole="header"
                style={{
                  paddingHorizontal: space.x6,
                  paddingTop: space.x6,
                  paddingBottom: space.x3,
                }}
              >
                {item.label}
              </Text>
            );
          if (item.kind === 'unread')
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  marginTop: space.x6,
                  marginHorizontal: space.x5,
                  paddingHorizontal: space.x5,
                  paddingVertical: space.x3,
                  borderRadius: ios ? radius.md : 0,
                  backgroundColor: theme.layer.raised.fill,
                }}
              >
                <Text style={{ flex: 1 }}>{t.activityUnreadOnly}</Text>
                <Switch
                  accessibilityLabel={t.activityUnreadOnly}
                  value={draft.unreadOnly === true}
                  onValueChange={(unreadOnly) => setDraft({ ...draft, unreadOnly })}
                  trackColor={{ true: theme.color.accent }}
                />
              </View>
            );
          const { choice, first, last } = item;
          return (
            <Pressable
              accessibilityRole={ios ? 'button' : 'radio'}
              accessibilityLabel={choice.label}
              accessibilityState={
                ios ? { selected: choice.selected } : { checked: choice.selected }
              }
              onPress={choice.choose}
              style={({ pressed }) => ({
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                marginHorizontal: space.x5,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
                borderTopLeftRadius: ios && first ? radius.md : 0,
                borderTopRightRadius: ios && first ? radius.md : 0,
                borderBottomLeftRadius: ios && last ? radius.md : 0,
                borderBottomRightRadius: ios && last ? radius.md : 0,
                borderBottomWidth: last ? 0 : edge.hairline,
                borderBottomColor: theme.layer.raised.divider,
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              })}
            >
              {ios ? null : <Selection selected={choice.selected} />}
              <Text style={{ flex: 1 }}>{choice.label}</Text>
              {ios ? <Selection selected={choice.selected} /> : null}
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View
            style={{ alignItems: 'flex-start', paddingHorizontal: space.x5, paddingTop: space.x5 }}
          >
            <TextAction
              label={t.activityReset}
              onPress={() => {
                setDraft(ALL_ACTIVITY);
                setOrder('default');
              }}
            />
          </View>
        }
      />
      {ios ? null : actions}
    </>
  );
  return (
    <OptionsSurface onClose={onClose}>
      <View
        style={{
          flex: ios ? 1 : undefined,
          flexShrink: 1,
          paddingBottom: ios ? Math.max(insets.bottom, space.x5) : 0,
          backgroundColor: theme.layer.sheet.fill,
        }}
      >
        {content}
      </View>
    </OptionsSurface>
  );
}

function OptionsSurface({ children, onClose }: { children: ReactNode; onClose(): void }) {
  if (Platform.OS === 'ios')
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={onClose}
      >
        <View
          accessibilityViewIsModal
          accessibilityLabel={t.activityOptions}
          onAccessibilityEscape={onClose}
          style={{ flex: 1 }}
        >
          {children}
        </View>
      </Modal>
    );
  return (
    <Sheet visible label={t.activityOptions} onClose={onClose}>
      {children}
    </Sheet>
  );
}

export function ActivityFilters(props: Props) {
  return props.visible ? <OptionsEditor {...props} /> : null;
}

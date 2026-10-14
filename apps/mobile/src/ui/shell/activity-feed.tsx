import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import type { HostClient, RosterBot } from '../../host/client';
import {
  INBOX_SECTIONS,
  type Inbox,
  type InboxSection,
  type InboxSnapshot,
} from '../../host/inbox';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  requestRef,
  type DecisionResult,
  type RequestRef,
} from '../../host/requests';
import type { HumanAttentionItem } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { ApprovalCard } from '../chat/approval-card';
import { QuestionCard } from '../chat/question-card';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';
import { InboxRow } from '../inbox-list';
import { Text } from '../primitives/text';
import { Loading, Notice } from '../request-parts';
import { t } from '../strings';

const AVATAR = 32;

type FeedRow =
  | { kind: 'header'; key: string; section: InboxSection }
  | { kind: 'empty'; key: string }
  | { kind: 'post'; key: string; item: HumanAttentionItem; ref: RequestRef }
  | { kind: 'row'; key: string; item: HumanAttentionItem };

function decidable(item: HumanAttentionItem): RequestRef | undefined {
  if (item.kind !== 'user-question' && item.kind !== 'tool-approval') return undefined;
  return requestRef(item);
}

export function feedRows(
  snapshot: InboxSnapshot,
  gone: ReadonlySet<string>,
  held: readonly HumanAttentionItem[],
): FeedRow[] {
  if (snapshot.status !== 'ready') return [];
  const rows: FeedRow[] = [];
  for (const section of INBOX_SECTIONS) {
    const listed = snapshot.sections[section].filter((item) => !gone.has(item.id));
    const items =
      section === 'action'
        ? [...listed, ...held.filter((kept) => !listed.some((item) => item.id === kept.id))]
        : listed;
    if (items.length === 0 && section !== 'action') continue;
    rows.push({ kind: 'header', key: `header-${section}`, section });
    if (items.length === 0) rows.push({ kind: 'empty', key: 'empty' });
    for (const item of items) {
      const ref = section === 'action' ? decidable(item) : undefined;
      rows.push(
        ref === undefined
          ? { kind: 'row', key: item.id, item }
          : { kind: 'post', key: item.id, item, ref },
      );
    }
  }
  return rows;
}

function minutesSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

function Post({
  client,
  inbox,
  item,
  requestRef: ref,
  bot,
  now,
  onOpen,
  onSettled,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
  item: HumanAttentionItem;
  requestRef: RequestRef;
  bot: RosterBot | undefined;
  now: number;
  onOpen(item: HumanAttentionItem): void;
  onSettled(item: HumanAttentionItem, result: DecisionResult): void;
}) {
  const theme = useDesignTheme();
  const router = useRouter();
  const name = bot?.displayName ?? item.botSlug;
  const where =
    item.channelName !== undefined && !item.channelId?.startsWith('dm-')
      ? ` · ${t.inChannel(item.channelName)}`
      : '';
  const ports = useMemo(
    () => ({
      approval: {
        load: () => loadApproval(client, ref),
        decide: (outcome: Parameters<typeof decideApproval>[2]) =>
          decideApproval(client, ref, outcome),
      },
      question: {
        load: () => loadQuestion(client, ref),
        answer: (answer: Parameters<typeof answerQuestion>[2]) =>
          answerQuestion(client, ref, answer),
      },
    }),
    [client, ref],
  );
  const settled = (result: DecisionResult) => {
    onSettled(item, result);
    void inbox?.refresh();
  };
  return (
    <View
      testID={`inbox-post-${item.id}`}
      style={{
        paddingVertical: space.x4,
        gap: space.x1,
        borderBottomWidth: edge.hairline,
        borderBottomColor: theme.color.divider,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.openPost(t.kind[item.kind] ?? t.otherKind, name, item.summary)}
        onPress={() => onOpen(item)}
        style={({ pressed }) => ({
          minHeight: theme.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x3,
          paddingHorizontal: space.x5,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {bot === undefined ? (
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR / 2,
              backgroundColor: theme.layer.canvas.inset,
            }}
          />
        ) : (
          <BotAvatar bot={bot} size={AVATAR} />
        )}
        <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
          <Text tone="muted">{where}</Text>
        </Text>
        <Text variant="meta" tone="muted" style={{ marginLeft: 'auto' }}>
          {t.ago(minutesSince(item.createdAt, now))}
        </Text>
      </Pressable>
      {item.kind === 'tool-approval' ? (
        <ApprovalCard
          port={ports.approval}
          botName={name}
          wide
          onDetails={() => router.push({ pathname: '/approval', params: { ...ref } })}
          onSettled={settled}
        />
      ) : (
        <QuestionCard port={ports.question} botName={name} wide onSettled={settled} />
      )}
    </View>
  );
}

export function ActivityFeed({
  client,
  inbox,
  snapshot,
  bot,
  onOpen,
  header,
  now = Date.now(),
}: {
  client: HostClient | undefined;
  inbox: Inbox | undefined;
  snapshot: InboxSnapshot;
  bot(slug: string): RosterBot | undefined;
  onOpen(item: HumanAttentionItem): void;
  header?: ReactElement | null;
  now?: number;
}) {
  const theme = useDesignTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [held, setHeld] = useState<readonly HumanAttentionItem[]>([]);
  const rows = feedRows(snapshot, gone, held);
  const settled = (item: HumanAttentionItem, result: DecisionResult) => {
    if (result === 'accepted') setGone((current) => new Set(current).add(item.id));
    else setHeld((current) => [...current.filter((kept) => kept.id !== item.id), item]);
  };
  const refresh = () => {
    setRefreshing(true);
    setHeld([]);
    void inbox?.refresh().finally(() => setRefreshing(false));
  };
  return (
    <Animated.FlatList
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ backgroundColor: theme.color.base }}
      data={rows}
      keyExtractor={(row) => row.key}
      itemLayoutAnimation={LinearTransition}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={{ gap: space.x3 }}>
          {header}
          {snapshot.status === 'ready' && snapshot.stale !== undefined ? (
            <View style={{ paddingHorizontal: space.x5 }}>
              <Notice tone="warning">{`${t.inboxStale} ${snapshot.stale}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'error' ? (
            <View style={{ paddingHorizontal: space.x5 }}>
              <Notice tone="danger">{`${t.inboxFailed} ${snapshot.error}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'loading' ? <Loading /> : null}
        </View>
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'header')
          return (
            <Text
              accessibilityRole="header"
              variant="meta"
              tone="muted"
              strong
              style={{
                paddingHorizontal: space.x5,
                paddingTop: space.x6,
                paddingBottom: space.x2,
                textTransform: 'uppercase',
              }}
            >
              {t.inboxSections[row.section]}
            </Text>
          );
        if (row.kind === 'empty')
          return (
            <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
              {t.inboxEmpty}
            </Text>
          );
        if (row.kind === 'row')
          return <InboxRow item={row.item} bot={bot(row.item.botSlug)} onOpen={onOpen} now={now} />;
        return (
          <Animated.View exiting={FadeOut.duration(220)}>
            {client === undefined ? null : (
              <Post
                client={client}
                inbox={inbox}
                item={row.item}
                requestRef={row.ref}
                bot={bot(row.item.botSlug)}
                now={now}
                onOpen={onOpen}
                onSettled={settled}
              />
            )}
          </Animated.View>
        );
      }}
    />
  );
}

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';

import { botSettings } from '../../src/host/bot-settings';
import type { HostClient } from '../../src/host/client';
import type {
  CardResolution,
  ConversationDraft,
  ConversationMessage,
  MessageAttachment,
  MessageCard,
} from '../../src/host/conversation';
import type { Inbox } from '../../src/host/inbox';
import { shareAttachment } from '../../src/host/share-attachment';
import { MAX_PICKED, pickFiles, type PickSource, type PickedFile } from '../../src/host/pick-files';
import { stopBot, type StopOutcome } from '../../src/host/stop';
import {
  useConversation,
  useConversationSnapshot,
  useHostSession,
  useHostSnapshot,
} from '../../src/host/host-session';
import {
  answerInChat,
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  type RequestRef,
} from '../../src/host/requests';
import { useDictation } from '../../src/host/speech';
import { botColor } from '../../src/ui/bot-color';
import { ApprovalCard } from '../../src/ui/chat/approval-card';
import { botBusy } from '../../src/ui/chat/bot-tone';
import { ChatTitle } from '../../src/ui/chat/chat-title';
import { Composer } from '../../src/ui/chat/composer';
import { HeaderBackButton, HeaderEdgeFade, systemGlassBar } from '../../src/ui/chat/header-chrome';
import { useComposerContext } from '../../src/ui/chat/composer-context';
import { modelLabel, workspaceLabel } from '../../src/ui/chat/composer-labels';
import { ComposerFooter } from '../../src/ui/chat/composer-footer';
import { useFollowLatest } from '../../src/ui/chat/follow-latest';
import { ImageViewer } from '../../src/ui/chat/image-viewer';
import { JumpToLatest } from '../../src/ui/chat/jump-to-latest';
import { MessageActions } from '../../src/ui/chat/message-actions';
import { ModelSheet } from '../../src/ui/chat/model-sheet';
import { DraftBubble, MessageBubble } from '../../src/ui/chat/message-bubble';
import { copyMessage } from '../../src/ui/chat/message-menu';
import { chatRows, type ChatRow } from '../../src/ui/chat/message-groups';
import { QuestionCard } from '../../src/ui/chat/question-card';
import { StatusStrip } from '../../src/ui/chat/status-strip';
import { TimeSeparator } from '../../src/ui/chat/time-separator';
import { WorkspaceSheet } from '../../src/ui/chat/workspace-sheet';
import { AccentProvider, useDesignTheme } from '../../src/ui/design/theme';
import { space } from '../../src/ui/design/tokens';
import { OpenFullClientButton } from '../../src/ui/open-full-client';
import { Text } from '../../src/ui/primitives/text';
import { t } from '../../src/ui/strings';

type Row = ChatRow | { kind: 'draft'; key: string; draft: ConversationDraft };

export default function DmScreen() {
  const { slug, focus } = useLocalSearchParams<{
    slug: string;
    focus?: string;
  }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <DmConversation slug={slug} focus={focus} />
    </AccentProvider>
  );
}

function hiddenResolution(message: ConversationMessage): boolean {
  const resolution = message.resolves?.resolution;
  return (
    resolution?.kind === 'tool-approval' ||
    (resolution?.kind === 'user-question' && resolution.state === 'cancelled')
  );
}

const RequestCard = memo(function RequestCard({
  client,
  inbox,
  message,
  card,
  botSlug,
  botName,
  resolution,
  focused,
  answeredHere,
}: {
  client: HostClient;
  inbox: Inbox | undefined;
  message: ConversationMessage;
  card: MessageCard;
  botSlug: string;
  botName: string;
  resolution: CardResolution | undefined;
  focused: boolean;
  answeredHere: boolean;
}) {
  const ref = useMemo<RequestRef>(
    () => ({ channelId: card.channelId, messageId: message.id, botSlug }),
    [card.channelId, message.id, botSlug],
  );
  const approval = useMemo(
    () => ({
      load: () => loadApproval(client, ref),
      decide: async (outcome: Parameters<typeof decideApproval>[2]) => {
        const result = await decideApproval(client, ref, outcome);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const question = useMemo(
    () => ({
      load: () => loadQuestion(client, ref),
      answer: async (answer: Parameters<typeof answerQuestion>[2]) => {
        const result = await answerQuestion(client, ref, answer);
        void inbox?.refresh();
        return result;
      },
    }),
    [client, inbox, ref],
  );
  const subject = card.subject === undefined ? {} : { subject: card.subject };
  if (card.kind === 'tool-approval')
    return (
      <ApprovalCard
        port={approval}
        {...subject}
        {...(resolution?.kind === 'tool-approval' ? { resolution } : {})}
        focused={focused}
      />
    );
  return (
    <QuestionCard
      port={question}
      botName={botName}
      {...subject}
      {...(resolution?.kind === 'user-question' ? { resolution } : {})}
      focused={focused}
      replyInChat
      answeredHere={answeredHere}
    />
  );
});

function DmConversation({ slug, focus }: { slug: string | undefined; focus: string | undefined }) {
  const theme = useDesignTheme();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { client, inbox } = useHostSession();
  const host = useHostSnapshot(client);
  const bot = host.roster?.bots.find((entry) => entry.slug === slug);
  const target = useMemo(
    () =>
      slug === undefined
        ? undefined
        : {
            slug,
            ...(bot === undefined ? {} : { displayName: bot.displayName }),
            ...(bot?.dmChannelId === undefined ? {} : { dmChannelId: bot.dmChannelId }),
          },
    [slug, bot !== undefined],
  );
  const conversation = useConversation(client, target);
  const snapshot = useConversationSnapshot(conversation);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attachError, setAttachError] = useState(false);
  const dictation = useDictation(setDraft);
  const [stop, setStop] = useState<StopOutcome | { status: 'stopping' } | undefined>();
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const [actionsFor, setActionsFor] = useState<ConversationMessage>();
  const [reactError, setReactError] = useState(false);
  const [settingsSheet, setSettingsSheet] = useState<'model' | 'workspace'>();
  const [workspaceOpened, setWorkspaceOpened] = useState(0);
  const settings = useMemo(
    () => (client === undefined || slug === undefined ? undefined : botSettings(client, slug)),
    [client, slug],
  );
  const context = useComposerContext(settings);
  const list = useRef<FlatList<Row>>(null);
  const jumped = useRef<string | undefined>(undefined);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());

  const resolutions = useMemo(
    () =>
      new Map(
        snapshot.messages.flatMap((message) =>
          message.resolves === undefined
            ? []
            : [[message.resolves.requestId, message.resolves.resolution] as const],
        ),
      ),
    [snapshot.messages],
  );

  const visible = useMemo(
    () => snapshot.messages.filter((message) => !hiddenResolution(message)),
    [snapshot.messages],
  );
  const history = useMemo(() => chatRows(visible).reverse(), [visible]);
  const latest = useFollowLatest(list, visible);

  const asking = snapshot.messages.findLast(
    (message) => message.card?.kind === 'user-question' && !resolutions.has(message.id),
  );

  const rows = useMemo<Row[]>(
    () => [
      ...snapshot.drafts.map((entry): Row => ({
        kind: 'draft',
        key: `draft:${entry.draftId}`,
        draft: entry,
      })),
      ...history,
    ],
    [snapshot.drafts, history],
  );

  const jump = () => {
    if (focus === undefined || jumped.current === focus) return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === focus);
    if (index >= 0) {
      jumped.current = focus;
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } else if (snapshot.status === 'live' && snapshot.hasOlder && !snapshot.loadingOlder)
      void conversation?.loadOlder();
  };

  const send = () => {
    const body = draft.trim();
    if ((body === '' && files.length === 0) || conversation === undefined) return;
    if (dictation.state.status !== 'idle') dictation.cancel();
    setDraft('');
    setFiles([]);
    latest.jumpToLatest();
    if (
      asking?.card === undefined ||
      client === undefined ||
      slug === undefined ||
      files.length > 0
    ) {
      conversation.send(body, files);
      return;
    }
    const ref = {
      channelId: asking.card.channelId,
      messageId: asking.id,
      botSlug: slug,
    };
    void answerInChat(client, ref, body)
      .catch(() => false)
      .then((done) => {
        if (!done) {
          conversation.send(body, files);
          return;
        }
        setAnswered((current) => new Set([...current, asking.id]));
        void inbox?.refresh();
      });
  };

  const pick = (source: PickSource) => {
    setAttachError(false);
    pickFiles(source, MAX_PICKED - files.length)
      .then((more) => setFiles((current) => [...current, ...more].slice(0, MAX_PICKED)))
      .catch(() => setAttachError(true));
  };

  const stopRun = () => {
    if (client === undefined || bot?.dmChannelId === undefined || stop?.status === 'stopping')
      return;
    setStop({ status: 'stopping' });
    void stopBot(client, bot.dmChannelId, bot.slug).then((outcome) =>
      setStop(outcome.status === 'stopped' ? undefined : outcome),
    );
  };

  const share = useCallback((attachment: MessageAttachment): Promise<void> => {
    setShareError(false);
    return shareAttachment(attachment).catch(() => setShareError(true));
  }, []);

  const retry = useCallback((id: string) => conversation?.retry(id), [conversation]);

  const react = useCallback(
    (messageId: string, emoji: string, active: boolean): void => {
      setReactError(false);
      void conversation?.react(messageId, emoji, active).catch(() => setReactError(true));
    },
    [conversation],
  );

  const roster = host.roster;
  const botName = useCallback(
    (id: string): string => roster?.bots.find((entry) => entry.slug === id)?.displayName ?? id,
    [roster],
  );

  const title = bot?.displayName ?? slug;
  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'draft' ? (
        <DraftBubble draft={item.draft} />
      ) : item.kind === 'separator' ? (
        <TimeSeparator at={item.at} />
      ) : client !== undefined &&
        slug !== undefined &&
        title !== undefined &&
        (item.message.card?.kind === 'tool-approval' ||
          item.message.card?.kind === 'user-question') ? (
        <RequestCard
          client={client}
          inbox={inbox}
          message={item.message}
          card={item.message.card}
          botSlug={slug}
          botName={title}
          resolution={resolutions.get(item.message.id)}
          focused={item.message.id === focus}
          answeredHere={answered.has(item.message.id)}
        />
      ) : (
        <MessageBubble
          message={item.message}
          first={item.first}
          last={item.last}
          onRetry={retry}
          onOpenImage={setViewing}
          onShare={share}
          onLongPress={setActionsFor}
          onReact={react}
          botName={botName}
        />
      ),
    [client, slug, title, inbox, resolutions, focus, answered, retry, share, react, botName],
  );

  const notice =
    snapshot.status === 'refused'
      ? t.dmRefused
      : host.roster !== undefined && bot === undefined
        ? t.noBot
        : snapshot.fromCache && host.connection.status !== 'connected'
          ? t.offline
          : snapshot.status === 'interrupted'
            ? t.liveInterrupted
            : attachError
              ? t.attachFailed
              : shareError
                ? t.shareFailed
                : reactError
                  ? t.reactFailed
                  : stop?.status === 'not-working' && bot !== undefined
                    ? t.stopNotWorking(bot.displayName)
                    : stop?.status === 'failed'
                      ? `${t.stopFailed} ${stop.reason}`
                      : dictation.state.status === 'denied'
                        ? t.dictationDenied
                        : dictation.state.status === 'unavailable'
                          ? t.dictationUnavailable
                          : dictation.state.status === 'failed'
                            ? t.dictationFailed
                            : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          scrollEdgeEffects: { top: 'soft', bottom: 'soft', left: 'hidden', right: 'hidden' },
          ...(systemGlassBar
            ? {}
            : { headerLeft: () => <HeaderBackButton onPress={() => router.back()} /> }),
          headerTitle: () => (
            <ChatTitle
              bot={bot}
              fallback={slug ?? ''}
              onPress={() => router.push(`/bot/${bot?.slug ?? slug}`)}
            />
          ),
          headerRight: () =>
            slug === undefined ? null : (
              <OpenFullClientButton target={{ kind: 'dm', slug }} round={!systemGlassBar} />
            ),
        }}
      />
      <KeyboardAvoidingView
        ref={dictation.mountRef}
        style={{ flex: 1, backgroundColor: theme.color.base }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {notice === undefined ? null : (
          <Text
            accessibilityLiveRegion="polite"
            variant="meta"
            tone="warning"
            style={{
              marginTop: headerHeight,
              backgroundColor: theme.color.warningSoft,
              paddingHorizontal: space.x5,
              paddingVertical: space.x3,
            }}
          >
            {notice}
          </Text>
        )}
        <View style={{ flex: 1 }}>
          <FlatList
            ref={list}
            inverted
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: space.x3,
              paddingBottom: (notice === undefined ? headerHeight : 0) + space.x3,
            }}
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderItem}
            onContentSizeChange={jump}
            onScrollToIndexFailed={(info) => {
              list.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
              setTimeout(
                () =>
                  list.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0.5,
                    animated: true,
                  }),
                100,
              );
            }}
            onEndReached={() => void conversation?.loadOlder()}
            onEndReachedThreshold={0.5}
            {...latest.listProps}
            scrollEventThrottle={32}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              snapshot.loadingOlder ? (
                <View
                  style={{
                    padding: space.x4,
                    alignItems: 'center',
                    gap: space.x2,
                  }}
                >
                  <ActivityIndicator />
                  <Text variant="meta" tone="muted">
                    {t.olderLoading}
                  </Text>
                </View>
              ) : !snapshot.hasOlder && snapshot.status === 'live' ? (
                <Text
                  variant="meta"
                  tone="muted"
                  style={{ textAlign: 'center', padding: space.x5 }}
                >
                  {t.beginning}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              snapshot.status === 'opening' ? (
                <View style={{ padding: space.x6, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
          {latest.away ? (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                bottom: space.x4,
                left: 0,
                right: 0,
                alignItems: 'center',
              }}
            >
              <JumpToLatest unseen={latest.unseen} onPress={latest.jumpToLatest} />
            </View>
          ) : null}
        </View>
        {bot !== undefined && botBusy(bot) ? (
          <StatusStrip bot={bot} stopping={stop?.status === 'stopping'} onStop={stopRun} />
        ) : null}
        <Composer
          value={draft}
          placeholder={bot === undefined ? t.messagePlaceholder : t.messageBot(bot.displayName)}
          disabled={conversation === undefined}
          files={files}
          canAttach={files.length < MAX_PICKED}
          dictation={dictation.state.status}
          canDictate={conversation !== undefined}
          onChange={setDraft}
          onSend={send}
          onPick={pick}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          onDictate={() => {
            setAttachError(false);
            dictation.start();
          }}
          onStopDictation={dictation.stop}
          onCancelDictation={dictation.cancel}
          {...(bot === undefined
            ? {}
            : {
                footer: (
                  <ComposerFooter
                    mountRef={context.mount}
                    botName={bot.displayName}
                    model={modelLabel(context.model)}
                    workspace={workspaceLabel(context.grants)}
                    onModel={() => {
                      if (context.model.status !== 'ready') context.reloadModel();
                      setSettingsSheet('model');
                    }}
                    onWorkspace={() => {
                      context.openWorkspace();
                      setWorkspaceOpened((count) => count + 1);
                      setSettingsSheet('workspace');
                    }}
                  />
                ),
              })}
        />
      </KeyboardAvoidingView>
      {systemGlassBar ? null : <HeaderEdgeFade height={headerHeight} />}
      <ImageViewer attachment={viewing} onClose={() => setViewing(undefined)} onShare={share} />
      <MessageActions
        message={actionsFor}
        onClose={() => setActionsFor(undefined)}
        onReact={(message, emoji, active) => react(message.id, emoji, active)}
        onCopy={copyMessage}
      />
      <ModelSheet
        visible={settingsSheet === 'model'}
        botName={bot?.displayName ?? slug ?? ''}
        model={context.model}
        onRetry={context.reloadModel}
        onChoose={async (model, entry) => {
          await settings?.chooseModel(model, entry);
          context.reloadModel();
        }}
        onPreset={async (presetId) => {
          await settings?.applyPreset(presetId);
          context.reloadModel();
        }}
        onClose={() => setSettingsSheet(undefined)}
      />
      <WorkspaceSheet
        key={workspaceOpened}
        visible={settingsSheet === 'workspace'}
        botName={bot?.displayName ?? slug ?? ''}
        settings={settings}
        grants={context.grants}
        access={context.access}
        templates={context.templates}
        onRetryGrants={context.reloadGrants}
        onGrantsChanged={context.reloadGrants}
        onAccess={context.setAccess}
        onTemplates={context.setTemplates}
        onClose={() => setSettingsSheet(undefined)}
      />
    </>
  );
}

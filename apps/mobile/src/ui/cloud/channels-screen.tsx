import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudError } from '../../cloud/client';
import type { CloudChannel, CloudMessage } from '../../cloud/channel-contract';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { t } from '../strings';

function ChannelFormScroll(props: ScrollViewProps) {
  const theme = useDesignTheme();
  return (
    <KeyboardFormScroll
      {...props}
      bottomOffset={Math.max(theme.touch, theme.type.body.line * theme.fontScale * 2) + space.x6 * 2}
    />
  );
}
function renderChannelFormScroll(props: ScrollViewProps) {
  return <ChannelFormScroll {...props} />;
}

export function CloudChannelsScreen() {
  const { instanceId, organizationId } = useLocalSearchParams<{
    instanceId: string;
    organizationId: string;
  }>();
  return (
    <ChannelWorkspace
      key={instanceId + ':' + organizationId}
      instanceId={instanceId}
      organizationId={organizationId}
    />
  );
}
function ChannelWorkspace({
  instanceId,
  organizationId,
}: {
  instanceId: string;
  organizationId: string;
}) {
  const snapshot = useCloudSnapshot(),
    theme = useDesignTheme(),
    insets = useSafeAreaInsets();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const allowed = !!row?.identity && row.organization?.organizationId === organizationId;
  const [channels, setChannels] = useState<CloudChannel[]>();
  const [channelCursor, setChannelCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CloudChannel>();
  const [messages, setMessages] = useState<CloudMessage[]>();
  const [cursor, setCursor] = useState(0),
    [more, setMore] = useState(false);
  const [name, setName] = useState(''),
    [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const busy = working || snapshot.busy;
  const pending = row?.pendingChannelAction;
  const pendingHere = pending?.organizationId === organizationId ? pending : undefined;
  const pendingCreate = pendingHere?.kind === 'channel.create' ? pendingHere : undefined;
  const pendingSend =
    pendingHere?.kind === 'message.send' && pendingHere.channelId === selected?.channelId
      ? pendingHere
      : undefined;
  const box = {
    padding: space.x5,
    gap: space.x4,
    borderRadius: radius.lg,
    backgroundColor: theme.layer.raised.fill,
  };
  const run = async (action: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (e) {
      setError(cloudError(e));
    } finally {
      setWorking(false);
    }
  };
  const reload = async (after?: string) => {
    const page = await cloudClient.listChannels(instanceId, organizationId, after);
    setChannels((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.channels.filter((c) => !old?.some((o) => o.channelId === c.channelId)),
          ]
        : page.channels,
    );
    setChannelCursor(page.nextCursor);
  };
  const history = async (channel: CloudChannel, after = 0) => {
    const page = await cloudClient.readMessages(
      instanceId,
      organizationId,
      channel.channelId,
      after,
    );
    setMessages((old) =>
      after
        ? [
            ...(old ?? []),
            ...page.messages.filter((m) => !old?.some((o) => o.sequence === m.sequence)),
          ]
        : page.messages,
    );
    setCursor(page.nextCursor);
    setMore(page.hasMore);
  };
  return (
    <FlatList<CloudChannel | CloudMessage>
      style={{ flex: 1, backgroundColor: theme.color.base }}
      contentInsetAdjustmentBehavior="automatic"
      renderScrollComponent={renderChannelFormScroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.x5,
        paddingBottom: insets.bottom + space.x6,
        gap: space.x5,
      }}
      data={allowed ? (selected ? (messages ?? []) : (channels ?? [])) : []}
      keyExtractor={(item) => ('sequence' in item ? 'message-' + item.sequence : item.channelId)}
      ListHeaderComponent={
        <View style={{ gap: space.x4 }}>
          <Text variant="title">{row?.organization?.name}</Text>
          {!!error && (
            <Text accessibilityLiveRegion="polite">
              {t.cloud.error} {error}
            </Text>
          )}
          {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
          {!allowed ? (
            <Text>{t.cloudChannels.selectWorkspace}</Text>
          ) : selected ? (
            <>
              <Text variant="title">{selected.name}</Text>
              <Button
                label={t.cloudChannels.back}
                disabled={busy}
                onPress={() => {
                  setSelected(undefined);
                  setMessages(undefined);
                  setDraft('');
                  setNotice(undefined);
                }}
              />
              <Button
                label={t.cloudChannels.reloadMessages}
                disabled={busy}
                onPress={() => void run(() => history(selected))}
              />
              <View style={box}>
                <TextInput
                  accessibilityLabel={t.cloudChannels.message}
                  placeholder={t.cloudChannels.message}
                  multiline
                  maxLength={4000}
                  value={pendingSend?.value ?? draft}
                  editable={!busy && !pendingSend}
                  onChangeText={setDraft}
                />
                {!!pendingSend && <Text>{t.cloudChannels.pending}</Text>}
                <Button
                  label={pendingSend ? t.cloudChannels.retrySend : t.cloudChannels.send}
                  disabled={busy || !(pendingSend?.value ?? draft).trim()}
                  onPress={() =>
                    void run(async () => {
                      const result = await cloudClient.sendMessage(
                        instanceId,
                        organizationId,
                        selected.channelId,
                        pendingSend?.value ?? draft,
                      );
                      setDraft('');
                      setNotice(t.cloudChannels.committed + ' ' + result.sequence);
                      await history(selected);
                    })
                  }
                />
              </View>
            </>
          ) : (
            <>
              {row.organization?.role === 'owner' && (
                <View style={box}>
                  <TextInput
                    accessibilityLabel={t.cloudChannels.name}
                    placeholder={t.cloudChannels.name}
                    value={pendingCreate?.value ?? name}
                    maxLength={80}
                    editable={!busy && !pendingCreate}
                    onChangeText={setName}
                  />
                  {!!pendingCreate && <Text>{t.cloudChannels.pending}</Text>}
                  <Button
                    label={pendingCreate ? t.cloudChannels.retryCreate : t.cloudChannels.create}
                    disabled={busy || !(pendingCreate?.value ?? name).trim()}
                    onPress={() =>
                      void run(async () => {
                        await cloudClient.createChannel(
                          instanceId,
                          organizationId,
                          pendingCreate?.value ?? name,
                        );
                        setName('');
                        await reload();
                      })
                    }
                  />
                </View>
              )}
              <Button
                label={t.cloudChannels.reload}
                disabled={busy}
                onPress={() => void run(() => reload())}
              />
            </>
          )}
          {!!pending && !pendingHere && <Text>{t.cloudChannels.pendingElsewhere}</Text>}
          {busy && <Text accessibilityRole="progressbar">{t.cloud.working}</Text>}
        </View>
      }
      renderItem={({ item }) =>
        'sequence' in item ? (
          <View style={box}>
            <Text>
              {item.authorType} · {item.authorId}
            </Text>
            <Text selectable>{item.text}</Text>
            <Text>
              {t.cloudChannels.committed} {item.sequence}
            </Text>
          </View>
        ) : (
          <View style={box}>
            <Text variant="title">{item.name}</Text>
            <Button
              label={t.cloudChannels.open + ': ' + item.name}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  setSelected(item);
                  setMessages(undefined);
                  setDraft('');
                  await history(item);
                })
              }
            />
          </View>
        )
      }
      ListEmptyComponent={
        allowed && !busy && (selected ? messages : channels) ? (
          <Text>{selected ? t.cloudChannels.noMessages : t.cloudChannels.empty}</Text>
        ) : undefined
      }
      ListFooterComponent={
        allowed && (selected ? more : channelCursor) ? (
          <Button
            label={t.cloudOrganizations.more}
            disabled={busy}
            onPress={() =>
              void run(() => (selected ? history(selected, cursor) : reload(channelCursor!)))
            }
          />
        ) : undefined
      }
    />
  );
}

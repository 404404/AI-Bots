import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { cloudConversations } from '../../cloud/native-conversations';
import { cloudViewScope } from '../../cloud/workspace-directory';
import { prepareCloudCreation } from '../../cloud/prepare-creation';
import { cloudError } from '../../cloud/client';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { TextInput } from '../primitives/system-text';
import { t } from '../strings';

export function CloudCreateChannelScreen() {
  const params = useLocalSearchParams<{
    instanceId: string;
    organizationId: string;
    accountScope: string;
  }>();
  const snapshot = useCloudSnapshot();
  const row = snapshot.rows.find((r) => r.config.instanceId === params.instanceId);
  const valid =
    !!params.accountScope && row?.hasSession && cloudViewScope(row) === params.accountScope;
  if (!valid) return <Text accessibilityRole="alert">{t.creationSourceChanged}</Text>;
  return <CreateChannelForm key={params.accountScope + params.organizationId} {...params} />;
}

function CreateChannelForm({
  instanceId,
  organizationId,
  accountScope,
}: {
  instanceId: string;
  organizationId: string;
  accountScope: string;
}) {
  const theme = useDesignTheme();
  const snapshot = useCloudSnapshot();
  const row = snapshot.rows.find((r) => r.config.instanceId === instanceId);
  const org = row?.organization;
  const allowed = org?.organizationId === organizationId && org.role === 'owner';
  const pending = row?.pendingChannelAction;
  const pendingHere =
    pending?.kind === 'channel.create' && pending.organizationId === organizationId
      ? pending
      : undefined;
  const [name, setName] = useState(pendingHere?.value ?? '');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const create = async () => {
    if (working || snapshot.busy || !allowed || !row) return;
    setWorking(true);
    setError(undefined);
    const target = {
      scope: accountScope,
      instanceId,
      organizationId,
      organizationName: org.name,
      guest: false,
      role: 'owner' as const,
      server: row.config.server,
    };
    try {
      await prepareCloudCreation(cloudClient, target);
      if (!active.current) return;
      const channel = await cloudClient.createChannel(instanceId, organizationId, name);
      if (
        !active.current ||
        cloudViewScope(
          cloudClient.getSnapshot().rows.find((r) => r.config.instanceId === instanceId),
        ) !== accountScope
      )
        return;
      void cloudConversations.refresh();
      router.replace({
        pathname: '/cloud-channels',
        params: { instanceId, organizationId, accountScope, channelId: channel.channelId },
      });
    } catch (e) {
      setError(cloudError(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Stack.Screen options={{ title: t.newChannel }} />
      <KeyboardFormScroll
        contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
        bottomOffset={theme.touch + space.x6 * 3}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="title" strong>
          {org?.name}
        </Text>
        {!allowed ? (
          <Text>{t.cloudInvitations.required}</Text>
        ) : (
          <>
            <Text>{t.cloudChannels.name}</Text>
            <TextInput
              accessibilityLabel={t.cloudChannels.name}
              value={name}
              onChangeText={setName}
              maxLength={80}
              editable={!working && !pendingHere}
              autoCapitalize="none"
              style={{
                minHeight: theme.touch,
                color: theme.color.fg,
                backgroundColor: theme.layer.field.fill,
                padding: space.x4,
              }}
            />
            {!!error && <Text accessibilityRole="alert">{error}</Text>}
            {!!pendingHere && <Text>{t.cloudChannels.pending}</Text>}
            <View>
              <Button
                label={pendingHere ? t.retry : t.newChannel}
                disabled={snapshot.busy || !name.trim()}
                busy={working}
                onPress={() => void create()}
              />
            </View>
          </>
        )}
      </KeyboardFormScroll>
    </>
  );
}

import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';

import { useHostSession } from '../src/host/host-session';
import { loadApproval, readableInput, type ApprovalRequest } from '../src/host/requests';
import { useDesignTheme } from '../src/ui/design/theme';
import { edge, radius, space } from '../src/ui/design/tokens';
import { useMounted } from '../src/ui/mounted';
import { Button } from '../src/ui/primitives/button';
import { Text } from '../src/ui/primitives/text';
import { t } from '../src/ui/strings';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Params = { channelId: string; messageId: string; botSlug: string };

function Field({ label, value }: { label: string; value: string }) {
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x2 }}>
      {label === '' ? null : (
        <Text variant="meta" tone="muted" strong>
          {label}
        </Text>
      )}
      <View
        style={{
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          borderWidth: edge.hairline,
          borderRadius: radius.md,
          padding: space.x4,
        }}
      >
        <Text selectable variant="meta" style={{ fontFamily: MONO }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function ApprovalDetailsScreen() {
  const theme = useDesignTheme();
  const { channelId, messageId, botSlug } = useLocalSearchParams<Params>();
  const { client } = useHostSession();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; request: ApprovalRequest }
  >({ kind: 'loading' });

  const load = useCallback(async () => {
    if (client === undefined) return;
    setState({ kind: 'loading' });
    try {
      const request = await loadApproval(client, { channelId, messageId, botSlug });
      setState({ kind: 'ready', request });
    } catch {
      setState({ kind: 'failed' });
    }
  }, [client, channelId, messageId, botSlug]);

  const mount = useMounted<View>(() => void load(), [load]);

  return (
    <View ref={mount} style={{ flex: 1, backgroundColor: theme.color.base }}>
      <Stack.Screen options={{ title: t.kind['tool-approval']! }} />
      {state.kind === 'loading' ? (
        <View style={{ padding: space.x6, alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : state.kind === 'failed' ? (
        <View style={{ padding: space.x5, gap: space.x4 }}>
          <Text tone="danger">{t.cardLoadFailed}</Text>
          <View style={{ flexDirection: 'row' }}>
            <Button label={t.tryAgain} onPress={() => void load()} />
          </View>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
        >
          <Field label={t.tool} value={state.request.toolName} />
          <Field label={t.workingFolder} value={state.request.cwd} />
          <Text variant="title">{t.arguments}</Text>
          {readableInput(state.request.input).map((row, index) => (
            <Field key={`${row.label}-${index}`} label={row.label} value={row.value} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

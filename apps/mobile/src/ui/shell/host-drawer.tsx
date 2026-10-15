import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createHostClient } from '../../host/client';
import { createHostGlances, liveGlance, type HostStatus } from '../../host/host-glance';
import { hostSession, useHostSession, useHostSnapshot, useInbox } from '../../host/host-session';
import { nativeCarrier } from '../../host/native-carrier';
import { NeedsYouBadge } from '../chat/conversation-row';
import { glassShadow, useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { motion, radius, scrim, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import {
  createHostDrawer,
  drawerWidth,
  EDGE_WIDTH,
  hostDrawerRows,
  settleOpen,
  type HostDrawerRow,
} from './host-drawer-model';
import { PlusIcon } from './icons';

export const hostDrawer = createHostDrawer({
  switchTo: (hostId) => hostSession.switchTo(hostId),
  pair: () => router.push('/pair'),
});

const glances = createHostGlances((host) =>
  createHostClient({ routes: host.routes, credential: host.credential, carrier: nativeCarrier() }),
);

const progress = makeMutable(0);

const DRAG_START = 10;
const VERTICAL_FAIL = 15;

function hidden(): void {
  hostDrawer.hidden();
}

function slide(open: boolean): void {
  progress.value = withTiming(
    open ? 1 : 0,
    { duration: motion.drawer, reduceMotion: ReduceMotion.System },
    (finished) => {
      if (finished === true && !open) runOnJS(hidden)();
    },
  );
}

function settle(open: boolean): void {
  if (open) hostDrawer.open();
  else hostDrawer.close();
  slide(open);
}

function reveal(): void {
  hostDrawer.reveal();
}

export function focusOn(node: View): void {
  AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus');
}

export function openHostDrawer(): void {
  settle(true);
}

export function useHostDrawerOpen(): boolean {
  return useSyncExternalStore(hostDrawer.subscribe, () => hostDrawer.getSnapshot().open);
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export function HostDrawerEdge({ children }: { children: ReactNode }) {
  const width = drawerWidth(useWindowDimensions().width);
  const reduced = useReducedMotion();
  const { hosts } = useHostSession();
  const pan = Gesture.Pan()
    .enabled(hosts.length > 0)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(DRAG_START)
    .failOffsetY([-VERTICAL_FAIL, VERTICAL_FAIL])
    .onStart(() => {
      runOnJS(reveal)();
    })
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(settleOpen(clamp(event.translationX / width), event.velocityX));
    });
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}

function statusText(status: HostStatus): string {
  return status === 'online' ? t.hostOnline : status === 'offline' ? t.hostOffline : t.hostChecking;
}

function HostTile({ name, current }: { name: string; current: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.md,
        backgroundColor: current ? theme.color.accent : theme.layer.sheet.inset,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="title" tone={current ? 'onAccent' : 'fg'}>
        {Array.from(name.trim())[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

function HostRow({ row, onPress }: { row: HostDrawerRow; onPress(): void }) {
  const theme = useDesignTheme();
  const pending = row.glance.pending ?? 0;
  const status = statusText(row.glance.status);
  const dot =
    row.glance.status === 'online'
      ? theme.color.success
      : row.glance.status === 'checking'
        ? theme.color.warning
        : theme.color.subtle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        row.hostName,
        row.current ? t.showing : undefined,
        status,
        pending > 0 ? t.hostPending(pending) : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(', ')}
      accessibilityState={{ selected: row.current }}
      style={({ pressed }) => ({
        minHeight: theme.touch + space.x4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        marginHorizontal: space.x3,
        paddingHorizontal: space.x3,
        paddingVertical: space.x3,
        borderRadius: radius.md,
        backgroundColor: pressed
          ? theme.layer.sheet.pressed
          : row.current
            ? theme.layer.sheet.selected
            : theme.layer.sheet.fill,
      })}
    >
      <HostTile name={row.hostName} current={row.current} />
      <View style={{ flex: 1, gap: space.x1 }}>
        <Text strong numberOfLines={1}>
          {row.hostName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <View
            style={{
              width: space.x3,
              height: space.x3,
              borderRadius: radius.round,
              backgroundColor: dot,
            }}
          />
          <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {status}
          </Text>
        </View>
      </View>
      {pending > 0 ? <NeedsYouBadge count={pending} /> : null}
    </Pressable>
  );
}

function PairRow({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.pairAnother}
      style={({ pressed }) => ({
        minHeight: theme.touch + space.x4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        marginHorizontal: space.x3,
        paddingHorizontal: space.x3,
        paddingVertical: space.x3,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
      })}
    >
      <View
        style={{
          width: theme.touch,
          height: theme.touch,
          borderRadius: radius.md,
          backgroundColor: theme.layer.sheet.inset,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.size + space.x2} />
      </View>
      <Text strong tone="accent" style={{ flex: 1 }}>
        {t.pairAnother}
      </Text>
    </Pressable>
  );
}

export function HostDrawer() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const width = drawerWidth(useWindowDimensions().width);
  const reduced = useReducedMotion();
  const state = useSyncExternalStore(hostDrawer.subscribe, hostDrawer.getSnapshot);
  const { saved, hosts, client, inbox } = useHostSession();
  const connection = useHostSnapshot(client).connection;
  const list = useInbox(inbox);
  const glanceMap = useSyncExternalStore(glances.subscribe, glances.getSnapshot);
  const currentId = saved?.hostId;

  const rows = useMemo(
    () => hostDrawerRows(hosts, currentId, glanceMap, liveGlance(connection, list)),
    [hosts, currentId, glanceMap, connection, list],
  );

  const heading = useMounted<View>(
    (node) => {
      if (!state.open) return;
      const stopWatching = glances.watch(hosts.filter((host) => host.hostId !== currentId));
      const focus = setTimeout(() => focusOn(node), motion.drawer);
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        settle(false);
        return true;
      });
      return () => {
        stopWatching();
        clearTimeout(focus);
        back.remove();
      };
    },
    [state.open, hosts, currentId],
  );

  const fade = theme.scheme === 'dark' ? scrim.dark : scrim.light;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * fade }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * width }],
  }));

  const swipe = Gesture.Pan()
    .enabled(state.open)
    .activeOffsetX(-DRAG_START)
    .failOffsetY([-VERTICAL_FAIL, VERTICAL_FAIL])
    .onUpdate((event) => {
      if (!reduced) progress.value = clamp(1 + event.translationX / width);
    })
    .onEnd((event) => {
      runOnJS(settle)(settleOpen(clamp(1 + event.translationX / width), event.velocityX));
    });

  if (!state.shown) return null;

  return (
    <GestureDetector gesture={swipe}>
      <View style={StyleSheet.absoluteFill} pointerEvents={state.open ? 'auto' : 'none'}>
        {state.open ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.scheme === 'dark' ? theme.layer.canvas.fill : theme.color.fg,
            },
            backdropStyle,
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={t.closeComputers}
            onPress={() => settle(false)}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width,
              backgroundColor: theme.layer.sheet.fill,
              borderTopRightRadius: radius.lg,
              borderBottomRightRadius: radius.lg,
              boxShadow: glassShadow(theme.scheme),
              paddingTop: insets.top + space.x4,
            },
            panelStyle,
          ]}
        >
          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t.computers}
            style={{ paddingHorizontal: space.x5, paddingBottom: space.x4 }}
          >
            <Text variant="display">{t.computers}</Text>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(row) => row.hostId}
            contentContainerStyle={{ gap: space.x2, paddingBottom: insets.bottom + space.x5 }}
            renderItem={({ item }) => (
              <HostRow
                row={item}
                onPress={() => {
                  slide(false);
                  void hostDrawer.select(item.hostId);
                }}
              />
            )}
            ListFooterComponent={
              <View style={{ paddingTop: space.x3, gap: space.x3 }}>
                <PairRow
                  onPress={() => {
                    slide(false);
                    hostDrawer.pairNew();
                  }}
                />
                <Text
                  variant="meta"
                  tone="muted"
                  style={{ paddingHorizontal: space.x5, paddingTop: space.x3 }}
                >
                  {t.computersHint}
                </Text>
              </View>
            }
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { ConversationMessage } from '../../host/conversation';

/** How far from the newest message (offset 0 of the inverted list) still counts as at the latest. */
export const LATEST_SLOP = 40;

export function atLatest(offset: number): boolean {
  return offset <= LATEST_SLOP;
}

/**
 * Messages that arrived after `anchor`, the newest message when the Human left the latest.
 * The Human's own messages are not news to them.
 */
export function unseenSince(
  messages: readonly ConversationMessage[],
  anchor: string | undefined,
): number {
  const start =
    anchor === undefined ? 0 : messages.findLastIndex((message) => message.id === anchor) + 1;
  if (anchor !== undefined && start === 0) return 0;
  let count = 0;
  for (let index = start; index < messages.length; index += 1)
    if (messages[index]!.author !== 'human') count += 1;
  return count;
}

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/**
 * Keeps an inverted chat list on the newest message only while the Human is there.
 *
 * At offset 0 an inverted list already shows a streaming reply as it grows, so following needs
 * no scrolling at all. Once the Human drags or reads history, `maintainVisibleContentPosition`
 * holds what they are looking at in place while new text lands below, and nothing pulls them
 * back down until they return or tap the jump button. Scroll events change state only when
 * the Human crosses the edge, so a stream never re-renders the screen from here.
 */
export function useFollowLatest<Row>(
  list: RefObject<FlatList<Row> | null>,
  messages: readonly ConversationMessage[],
) {
  const [following, setFollowing] = useState(true);
  const [away, setAway] = useState(false);
  const [anchor, setAnchor] = useState<string | undefined>();
  const followingNow = useRef(true);
  const dragging = useRef(false);
  const jumping = useRef(false);
  const latestId = useRef<string | undefined>(undefined);
  latestId.current = messages.at(-1)?.id;

  const hold = useCallback(() => {
    if (!followingNow.current) return;
    followingNow.current = false;
    setAnchor(latestId.current);
    setFollowing(false);
  }, []);

  const follow = useCallback(() => {
    jumping.current = false;
    followingNow.current = true;
    setFollowing(true);
    setAway(false);
  }, []);

  const settle = useCallback(
    (offset: number) => {
      if (!atLatest(offset)) return;
      if (offset > 0) list.current?.scrollToOffset({ offset: 0, animated: true });
      follow();
    },
    [list, follow],
  );

  const onScroll = useCallback(
    (event: ScrollEvent) => {
      const offset = event.nativeEvent.contentOffset.y;
      if (atLatest(offset)) {
        if (dragging.current) setAway(false);
        else follow();
      } else if (!jumping.current) {
        setAway(true);
        hold();
      }
    },
    [hold, follow],
  );

  const onScrollBeginDrag = useCallback(() => {
    dragging.current = true;
    jumping.current = false;
    hold();
  }, [hold]);

  const onScrollEndDrag = useCallback(
    (event: ScrollEvent) => {
      dragging.current = false;
      if ((event.nativeEvent.velocity?.y ?? 0) === 0) settle(event.nativeEvent.contentOffset.y);
    },
    [settle],
  );

  const onMomentumScrollEnd = useCallback(
    (event: ScrollEvent) => {
      if (dragging.current) return;
      jumping.current = false;
      settle(event.nativeEvent.contentOffset.y);
    },
    [settle],
  );

  const jumpToLatest = useCallback(() => {
    follow();
    jumping.current = true;
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [list, follow]);

  const maintainVisibleContentPosition = useMemo(
    () => (following ? undefined : { minIndexForVisible: 0 }),
    [following],
  );

  return {
    away,
    unseen: following ? 0 : unseenSince(messages, anchor),
    jumpToLatest,
    listProps: {
      onScroll,
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollEnd,
      maintainVisibleContentPosition,
    },
  };
}

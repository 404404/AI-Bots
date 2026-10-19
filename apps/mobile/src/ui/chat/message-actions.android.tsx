import {
  Column,
  FilledIconToggleButton,
  HorizontalDivider,
  Host,
  ListItem,
  ModalBottomSheet,
  RNHostView,
  Row,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  clickable,
  horizontalScroll,
  padding,
  semantics,
  size,
} from '@expo/ui/jetpack-compose/modifiers';
import { Fragment } from 'react';
import { StyleSheet } from 'react-native';

import { MENU_REACTIONS, reactedByMe } from '../../host/conversation';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { RowIcon } from '../primitives/row-icon';
import { t } from '../strings';
import {
  menuGroups,
  menuLabel,
  menuReactions,
  menuTime,
  messageMenuActions,
  runAction,
  type MessageActionsProps,
} from './message-sheet';

export {
  dismissQueue,
  menuTime,
  messageMenuActions,
  type ActivityMenuLink,
  type MessageMenuAction,
  type MessageMenuTarget,
} from './message-sheet';

export function MessageActions({
  target,
  readOnly = false,
  onClose,
  onReact,
  onCopy,
  onShareText,
}: MessageActionsProps) {
  const theme = useDesignTheme();
  if (target === undefined) return null;
  const { message } = target;
  const mine = new Set((message.reactions ?? []).filter(reactedByMe).map((r) => r.emoji));
  const groups = menuGroups(messageMenuActions(message, target.activity));
  const reactions = menuReactions(target, readOnly);
  return (
    <Host
      key={message.id}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose} skipPartiallyExpanded>
        <Column modifiers={[semantics({ contentDescription: menuLabel(target) })]}>
          <Text
            color={theme.color.muted}
            style={{ typography: 'labelMedium' }}
            modifiers={[padding(space.x5, 0, space.x5, space.x3)]}
          >
            {menuTime(message.at, new Date())}
          </Text>
          {reactions ? (
            <Row
              horizontalArrangement={{ spacedBy: space.x3 }}
              modifiers={[
                horizontalScroll(),
                padding(space.x5, space.x3, space.x5, space.x4),
                semantics({ contentDescription: t.reactions }),
              ]}
            >
              {MENU_REACTIONS.map((emoji) => {
                const picked = mine.has(emoji);
                return (
                  <FilledIconToggleButton
                    key={emoji}
                    checked={picked}
                    onCheckedChange={() => {
                      onReact(message, emoji, !picked);
                      onClose();
                    }}
                    modifiers={[
                      size(theme.touch, theme.touch),
                      semantics({ contentDescription: picked ? t.unreact(emoji) : t.react(emoji) }),
                    ]}
                  >
                    <Text style={{ typography: 'titleLarge' }}>{emoji}</Text>
                  </FilledIconToggleButton>
                );
              })}
            </Row>
          ) : null}
          {groups.map((group, index) => (
            <Fragment key={group.map((action) => action.key).join()}>
              {index === 0 && !reactions ? null : <HorizontalDivider />}
              {group.map((action) => (
                <ListItem
                  key={action.key}
                  modifiers={[
                    clickable(() => {
                      runAction(action, message, {
                        onCopy,
                        onShareText,
                        onOpen: () => target.activity?.onOpen?.(),
                      });
                      onClose();
                    }),
                  ]}
                >
                  <ListItem.LeadingContent>
                    <RNHostView matchContents>
                      <RowIcon name={action.key} />
                    </RNHostView>
                  </ListItem.LeadingContent>
                  <ListItem.HeadlineContent>
                    <Text>{action.label}</Text>
                  </ListItem.HeadlineContent>
                </ListItem>
              ))}
            </Fragment>
          ))}
        </Column>
      </ModalBottomSheet>
    </Host>
  );
}

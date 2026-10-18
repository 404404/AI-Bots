import { createContext, useContext } from 'react';
import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import type { ConversationMessage } from '../../host/conversation';
import type { WireMention } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { MarkdownView } from '../markdown-view';
import { InlineText, Text } from '../primitives/text';
import { t } from '../strings';
import { leadingMessageMentions, messageMentionRuns, mentionIdentity } from './message-mentions';

const AVATAR = 20;
const NO_BOTS: readonly RosterBot[] = [];

export const MessageIdentities = createContext<{
  bots: readonly RosterBot[];
  openBot?: (id: string) => void;
}>({ bots: NO_BOTS });

function MentionBadge({ mention }: { mention: WireMention }) {
  const theme = useDesignTheme();
  const { bots, openBot } = useContext(MessageIdentities);
  const { label, bot } = mentionIdentity(mention, bots);
  const enabled = bot !== undefined && openBot !== undefined;
  return (
    <Pressable
      disabled={!enabled}
      accessibilityRole={enabled ? 'link' : 'text'}
      accessibilityLabel={enabled ? t.openMention(label) : `@${label}`}
      onPress={() => {
        if (bot !== undefined) openBot?.(bot.slug);
      }}
      style={({ pressed }) => ({
        maxWidth: '100%',
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: space.x3,
        paddingVertical: space.x1,
        borderRadius: radius.sm,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.inset,
      })}
    >
      {bot === undefined ? null : <BotAvatar bot={bot} size={AVATAR} ring={false} />}
      <Text strong style={{ flexShrink: 1 }}>
        @{label}
      </Text>
    </Pressable>
  );
}

export function MessageBody({
  message,
  streaming,
}: {
  message: ConversationMessage;
  streaming: boolean;
}) {
  const theme = useDesignTheme();
  const { bots, openBot } = useContext(MessageIdentities);
  const human = message.author === 'human';
  const ink = human ? 'onAccent' : 'fg';
  const leading = leadingMessageMentions(message.body, message.mentions);
  const text = leading?.text ?? message.body;
  return (
    <>
      {leading === undefined ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
          {leading.mentions.map((mention) => (
            <MentionBadge key={mention.start} mention={mention} />
          ))}
        </View>
      )}
      {text.trim() === '' ? (
        streaming ? (
          <Text tone="muted">…</Text>
        ) : null
      ) : human ? (
        <Text tone={ink}>
          {messageMentionRuns(text, leading === undefined ? message.mentions : []).map(
            (run, index) => {
              if (run.mention === undefined) return run.text;
              const { bot, label } = mentionIdentity(run.mention, bots);
              const enabled = bot !== undefined && openBot !== undefined;
              return (
                <InlineText
                  key={index}
                  {...(enabled
                    ? {
                        accessibilityRole: 'link' as const,
                        accessibilityLabel: t.openMention(label),
                        onPress: () => openBot(bot.slug),
                      }
                    : {})}
                  style={{
                    fontWeight: theme.weight.strong,
                    backgroundColor: theme.layer.raised.fill,
                    color: theme.color.fg,
                    borderRadius: radius.xs,
                    textDecorationLine: 'underline',
                  }}
                >
                  @{label}
                </InlineText>
              );
            },
          )}
        </Text>
      ) : (
        <MarkdownView
          source={text}
          color={theme.color[ink]}
          selectable={false}
          streaming={streaming}
        />
      )}
    </>
  );
}

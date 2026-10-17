import { useState, type ReactElement } from 'react';
import {
  IconEllipsisOutlineRegular,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { IconButton } from './ds/icon-button.js';
import type { BotHarnessTranslate } from './locale.js';
import type { HumanInboxFilters } from './store.js';

const categories = [
  ['action', 'activityInbox.needsYou'],
  ['replies', 'humanInbox.replies'],
  ['unread', 'humanInbox.unread'],
  ['handled', 'humanInbox.handled'],
] as const;

export function ActivityInboxMenu({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const { humanInbox: inbox, bots, channels } = useClientState();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const filter = (patch: Partial<HumanInboxFilters>): Promise<void> =>
    actions.setHumanInboxFilters({
      botSlug: inbox.botSlug,
      channelId: inbox.channelId,
      sort: inbox.sort,
      snoozed: inbox.snoozed,
      ...patch,
    });
  const items: MenuEntry[] = [
    { type: 'label', id: 'category-label', text: t('activityInbox.category') },
    ...categories.map(([id, label]) => ({ id: 'category:' + id, label: t(label) })),
    { type: 'separator', id: 'sort-separator' },
    { type: 'label', id: 'sort-label', text: t('humanInbox.filter.sort') },
    { id: 'sort:newest', label: t('humanInbox.filter.newest') },
    { id: 'sort:oldest', label: t('humanInbox.filter.oldest') },
    { type: 'separator', id: 'filter-separator' },
    ...(inbox.category === 'unread'
      ? []
      : [
          {
            id: 'bot',
            label: t('humanInbox.filter.bot'),
            submenu: [
              { id: 'bot:', label: t('humanInbox.filter.allBots') },
              ...[...bots]
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((bot) => ({ id: 'bot:' + bot.slug, label: bot.displayName })),
            ],
          },
        ]),
    {
      id: 'channel',
      label: t('humanInbox.filter.channel'),
      submenu: [
        { id: 'channel:', label: t('humanInbox.filter.allChannels') },
        ...channels
          .filter((channel) =>
            inbox.category === 'replies'
              ? channel.type === 'group'
              : channel.type === 'group' || channel.botSlug !== undefined,
          )
          .map((channel) => ({
            id: 'channel:' + channel.id,
            label:
              channel.type === 'dm'
                ? (bots.find((bot) => bot.slug === channel.botSlug)?.displayName ?? channel.name)
                : channel.name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ],
    },
    ...(inbox.category === 'unread' || inbox.category === 'handled'
      ? []
      : [{ id: 'snoozed', label: t('humanInbox.snoozed') }]),
    ...(inbox.items.length > 150
      ? [{ id: 'refresh', label: t('humanInbox.refresh.current') }]
      : []),
    ...(error ? [{ type: 'label' as const, id: 'error', text: t('humanInbox.failed') }] : []),
  ];
  const select = (id: string): void => {
    setOpen(false);
    setError(false);
    const category = categories.find(([value]) => id === 'category:' + value)?.[0];
    let operation: Promise<void> | undefined;
    if (category !== undefined) operation = actions.refreshHumanInbox(category);
    else if (id === 'sort:newest' || id === 'sort:oldest')
      operation = filter({ sort: id === 'sort:newest' ? 'newest' : 'oldest' });
    else if (id.startsWith('bot:')) operation = filter({ botSlug: id.slice(4) || undefined });
    else if (id.startsWith('channel:')) operation = filter({ channelId: id.slice(8) || undefined });
    else if (id === 'snoozed') operation = filter({ snoozed: !inbox.snoozed });
    else if (id === 'refresh') operation = actions.refreshHumanInbox();
    void operation?.catch(() => {
      setError(true);
      setOpen(true);
    });
  };
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      items={items}
      selectedIds={[
        'category:' + inbox.category,
        'sort:' + inbox.sort,
        'bot:' + (inbox.botSlug ?? ''),
        'channel:' + (inbox.channelId ?? ''),
        ...(inbox.snoozed ? ['snoozed'] : []),
      ]}
      onSelect={select}
      onClose={() => setOpen(false)}
      anchor={
        <IconButton
          aria-label={t('activityInbox.settings')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <IconEllipsisOutlineRegular size={16} />
        </IconButton>
      }
    />
  );
}

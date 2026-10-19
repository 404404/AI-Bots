import type { useRouter } from 'expo-router';

import type { Conversation } from '../chat/conversations';

export function openConversation(
  router: Pick<ReturnType<typeof useRouter>, 'push'>,
  row: Conversation,
  hostId?: string,
): void {
  if (row.kind === 'bot')
    router.push({ pathname: '/dm/[slug]', params: { slug: row.bot.slug, hostId } });
  else router.push({ pathname: '/channel/[id]', params: { id: row.channel.id, hostId } });
}

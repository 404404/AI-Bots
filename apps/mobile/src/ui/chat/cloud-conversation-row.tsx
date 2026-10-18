import type { CloudConversation } from '../../cloud/conversations';
import { t } from '../strings';
import { ConversationGroupAvatar, ConversationRowFrame } from './conversation-row';

export function CloudConversationRow({
  row,
  disabled,
  onPress,
}: {
  row: CloudConversation;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <ConversationRowFrame
      title={row.channel.name}
      source="cloud"
      label={`${row.channel.name}, ${t.cloudChannels.cloudChannel}`}
      preview={t.recentNotLoaded}
      avatar={<ConversationGroupAvatar />}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

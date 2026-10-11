import type { ReactElement } from 'react';
import {
  IconChevronLeftOutlineRegular,
  IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotHarnessTranslate } from './locale.js';

export function MobileConversationHeader({
  title,
  onBack,
  onSettings,
  settingsOpen,
  t,
}: {
  title: string;
  onBack(): void;
  onSettings(): void;
  settingsOpen: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <header className="bh-mobile-conversation-header">
      <button type="button" onClick={onBack} aria-label={t('mobile.back')} title={t('mobile.back')}>
        <IconChevronLeftOutlineRegular size={22} />
      </button>
      <h1 title={title}>{title}</h1>
      <button
        type="button"
        onClick={onSettings}
        aria-label={t('mobile.channelSettings')}
        title={t('mobile.channelSettings')}
        aria-controls="bh-channel-sidebar"
        aria-expanded={settingsOpen}
      >
        <IconSettingsOutlineRegular size={22} />
      </button>
    </header>
  );
}

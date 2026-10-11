import { useState, type ReactElement } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { BotPanel } from './bot-main.js';
import { BotSidebar } from './bot-sidebar.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { BotModeSortMode } from '../bot-mode-settings.js';
import { useMountedResource } from './mounted-resource.js';
import { store } from './store.js';
import { MOBILE_BOT_CSS } from './mobile-bot-styles.js';
import { useMobileBotViewport } from './mobile-viewport.js';

export function mountMobileBotShell(node: HTMLElement): () => void {
  let frame = node.parentElement;
  while (frame !== null && !frame.querySelector('nav:not(.bh-mobile-nav)'))
    frame = frame.parentElement;
  const sidebar =
    frame === null
      ? undefined
      : [...frame.children].find(
          (child) =>
            !child.contains(node) && child.querySelector('nav:not(.bh-mobile-nav)') !== null,
        );
  const previousSidebar = sidebar?.getAttribute('data-bh-mobile-sidebar');
  sidebar?.setAttribute('data-bh-mobile-sidebar', 'true');
  const viewport = window.visualViewport;
  const resize = (): void => {
    node.style.setProperty('--bh-mobile-height', `${viewport?.height ?? window.innerHeight}px`);
    node.style.setProperty('--bh-mobile-top', `${viewport?.offsetTop ?? 0}px`);
  };
  resize();
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  window.addEventListener('resize', resize);
  return () => {
    viewport?.removeEventListener('resize', resize);
    viewport?.removeEventListener('scroll', resize);
    window.removeEventListener('resize', resize);
    node.style.removeProperty('--bh-mobile-height');
    node.style.removeProperty('--bh-mobile-top');
    if (previousSidebar == null) sidebar?.removeAttribute('data-bh-mobile-sidebar');
    else sidebar?.setAttribute('data-bh-mobile-sidebar', previousSidebar);
  };
}

type MobileBotPanelProps = Parameters<typeof BotPanel>[0] & {
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  exitBotMode(): void;
  openBotSettings(): void;
  setSortMode(mode: BotModeSortMode): void;
  setSectionSortMode(sectionId: string, mode: BotModeSortMode | undefined): void;
};

export function MobileBotPanel(props: MobileBotPanelProps): ReactElement {
  const mobile = useMobileBotViewport();
  return mobile ? <MobileNavigation {...props} /> : <BotPanel {...props} />;
}

function MobileNavigation(props: MobileBotPanelProps): ReactElement {
  const { prefs, actions, companion, useBotModePrefs, t } = props;
  const [page, setPage] = useState<'list' | 'conversation' | 'inbox'>('list');
  const shellMount = useMountedResource<HTMLDivElement>((node) => {
    store.setMode('bot');
    const releaseShell = mountMobileBotShell(node);
    let selection = store.getSnapshot().selection;
    const unsubscribe = store.subscribe(() => {
      const next = store.getSnapshot().selection;
      if (next === selection) return;
      selection = next;
      if (next !== undefined) setPage(next.kind === 'inbox' ? 'inbox' : 'conversation');
    });
    return () => {
      unsubscribe();
      releaseShell();
      store.setMode('dsh');
    };
  }, []);
  const showList = (): void => {
    store.select(undefined);
    setPage('list');
  };
  return (
    <div ref={shellMount} className="bh-root bh-mobile-shell" data-page={page}>
      <style>{MOBILE_BOT_CSS}</style>
      <header className="bh-mobile-header">
        {page !== 'list' ? (
          <button type="button" onClick={showList} aria-label={t('mobile.back')}>
            <IconPanelLeftOutlineRegular /> {t('mobile.back')}
          </button>
        ) : (
          <strong>{t('mobile.conversations')}</strong>
        )}
        <button type="button" onClick={props.exitBotMode}>
          {t('mobile.host')}
        </button>
      </header>
      <div
        className="bh-mobile-list"
        hidden={page !== 'list'}
        onClickCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button.bh-contact, button.bh-channel-row') !== null
          )
            setPage('conversation');
        }}
      >
        {prefs === undefined ? null : (
          <BotSidebar
            wide
            actions={actions}
            companion={companion}
            useBotModePrefs={useBotModePrefs}
            setSortMode={props.setSortMode}
            setSectionSortMode={props.setSectionSortMode}
            t={t}
          />
        )}
      </div>
      <div className="bh-mobile-content" hidden={page === 'list'}>
        <BotPanel {...props} />
      </div>
      {page === 'conversation' ? null : (
        <nav className="bh-mobile-nav" aria-label={t('mobile.navigation')}>
          <button
            type="button"
            aria-current={page === 'list' ? 'page' : undefined}
            onClick={showList}
          >
            {t('mobile.conversations')}
          </button>
          <button
            type="button"
            aria-current={page === 'inbox' ? 'page' : undefined}
            onClick={() => {
              setPage('inbox');
              void actions.openActivityCenter();
            }}
          >
            {t('activityCenter.title')}
          </button>
          <button type="button" onClick={props.openBotSettings}>
            {t('panel.settings')}
          </button>
        </nav>
      )}
    </div>
  );
}

import { ActivityInboxMenu } from './activity-inbox-menu.js';
import { useClientState } from './bot-sidebar.js';
import type { ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { HumanInboxView } from './human-inbox-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { NativeSessionCatalog } from './sessions-entry.js';

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  placement = 'page',
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  nativeSessions?: NativeSessionCatalog | undefined;
  placement?: 'page' | 'panel';
}): ReactElement {
  const panel = placement === 'panel';
  const { humanInbox: inbox } = useClientState();
  const filterKey = JSON.stringify([
    inbox.category,
    inbox.botSlug,
    inbox.channelId,
    inbox.sort,
    inbox.snoozed,
  ]);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const detach = panel ? actions.attachActivityCenterPanel() : undefined;
    void actions.refreshHumanInboxStatus();
    void actions.refreshHumanInbox('action');
    return detach;
  }, [actions, panel]);
  return (
    <div
      ref={mount}
      className={
        panel
          ? 'bh-activity-center bh-activity-center-panel bh-activity-triage'
          : 'bh-root bh-main bh-activity-center bh-activity-triage'
      }
    >
      {panel ? null : (
        <header className="bh-activity-center-header">
          <h1>{t('activityCenter.title')}</h1>
          <ActivityInboxMenu actions={actions} t={t} />
        </header>
      )}
      <HumanInboxView key={filterKey} actions={actions} t={t} embedded activity />
    </div>
  );
}

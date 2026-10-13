import { useRef, useState, type ReactElement, type CSSProperties } from 'react';
import type { CompanionRequest } from '../../../core/src/companions/feed.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';
import { useMountedResource } from './mounted-resource.js';

function PendingRequest({
  request,
  actions,
  live,
  t,
  onReleaseFocus,
}: {
  request: CompanionRequest;
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  onReleaseFocus(): void;
}): ReactElement {
  const companionTarget = {
    channelId: request.channelId,
    botSlug: request.botSlug,
    sessionId: request.sessionId,
    live,
  };
  const release = useRef(onReleaseFocus);
  const ownedFocus = useRef(false);
  release.current = onReleaseFocus;
  const mounted = useMountedResource<HTMLLIElement>(
    (node) => () => {
      if (
        node.contains(document.activeElement) ||
        (ownedFocus.current && document.activeElement === document.body)
      )
        queueMicrotask(() => {
          if (document.activeElement === document.body || node.contains(document.activeElement))
            release.current();
        });
    },
    [request.messageId],
  );
  return (
    <li
      ref={mounted}
      onFocusCapture={() => {
        ownedFocus.current = true;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          ownedFocus.current = false;
      }}
    >
      {actions && request.kind === 'tool-approval' ? (
        <ToolApprovalCard
          message={{
            id: request.messageId,
            at: request.expiresAt,
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            toolApprovalRequest: request,
          }}
          channelId={request.channelId}
          actions={actions}
          t={t}
          companionTarget={{
            ...companionTarget,
            callId: request.callId,
          }}
        />
      ) : actions && request.kind === 'user-question' ? (
        <UserQuestionCard
          message={{
            id: request.messageId,
            at: '',
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            userQuestionRequest: request,
          }}
          channelId={request.channelId}
          actions={actions}
          t={t}
          companionTarget={companionTarget}
        />
      ) : null}
    </li>
  );
}

export function CompanionRequests({
  requests,
  actions,
  live,
  t,
  style,
  restoreFocus,
  messageCount,
}: {
  requests: readonly CompanionRequest[];
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  style: CSSProperties;
  restoreFocus(): void;
  messageCount: number;
}): ReactElement {
  const root = useRef<HTMLElement>(null);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const found = requests.findIndex((request) => request.messageId === chosen);
  const index = found < 0 ? 0 : found;
  const request = requests[index]!;
  const release = (): void => {
    const next =
      root.current?.querySelector<HTMLElement>(
        'li button:not(:disabled), li input:not(:disabled)',
      ) ?? root.current?.querySelector<HTMLElement>('ol');
    if (next?.isConnected) next.focus();
    else restoreFocus();
  };
  const step = (offset: number): void =>
    setChosen(requests[(index + offset + requests.length) % requests.length]!.messageId);
  return (
    <section
      ref={root}
      className="bh-companion-pending"
      aria-label={t('companion.requests')}
      style={style}
    >
      <header>
        <span className="bh-companion-request-source">
          {t(request.channelId.startsWith('dm-') ? 'companion.source' : 'companion.sourceGroup', {
            name: request.channelName,
          })}
        </span>
        {messageCount ? (
          <span
            className="bh-companion-queue"
            title={t('companion.messagesWaiting', { count: messageCount })}
            aria-label={t('companion.messagesWaiting', { count: messageCount })}
          >
            +{messageCount}
          </span>
        ) : null}
        {requests.length > 1 ? (
          <span className="bh-companion-request-nav">
            <button
              type="button"
              aria-label={t('companion.previousRequest')}
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <span
              aria-label={t('companion.requestPosition', {
                index: index + 1,
                count: requests.length,
              })}
            >
              {index + 1}/{requests.length}
            </span>
            <button type="button" aria-label={t('companion.nextRequest')} onClick={() => step(1)}>
              ›
            </button>
          </span>
        ) : null}
      </header>
      <ol tabIndex={-1}>
        <PendingRequest
          key={request.messageId}
          request={request}
          actions={actions}
          live={live}
          t={t}
          onReleaseFocus={release}
        />
      </ol>
    </section>
  );
}

import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorMessage, type ToolApprovalExecutionState } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';
import type { CompanionRequestTarget } from './companion-requests.js';
import { channelSettings } from './channel-settings-state.js';
import { approvalCountdown } from './approval-countdown.js';
import { ApprovalInput } from './approval-input.js';

export function ToolApprovalCard({
  message,
  actions,
  decision,
  t,
  companionTarget,
  channelId: sourceChannelId,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  channelId?: string | undefined;
  decision?:
    | 'allowed-once'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  t: BotHarnessTranslate;
  companionTarget?: (CompanionRequestTarget & { callId: string }) | undefined;
}): ReactElement {
  const request = message.toolApprovalRequest!;
  const eachUse = request.toolName === 'secret_cli' || request.toolName === 'secret_mcp_connect';
  const [acceptedDecision, setAcceptedDecision] = useState<typeof decision>();
  const effectiveDecision = decision ?? acceptedDecision;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const cardChannelId = sourceChannelId ?? 'dm-' + botSlug;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'expired' | 'decided' | 'unavailable'
  >(decision === undefined ? 'loading' : 'decided');
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [executionState, setExecutionState] = useState<ToolApprovalExecutionState | undefined>();
  const [retry, setRetry] = useState(0);
  const [expiresAt, setExpiresAt] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const target = useRef(companionTarget);
  target.current = companionTarget;
  const mounted = useRef(false);
  const submitting = useRef(false);
  const qualified = (): boolean => {
    const current = target.current;
    return (
      current !== undefined &&
      current.live &&
      current.botSlug === botSlug &&
      current.channelId === cardChannelId &&
      current.sessionId === request.sessionId &&
      current.callId === request.callId
    );
  };
  const approvalMount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    if (effectiveDecision !== undefined) setStatus('decided');
    if (botSlug === undefined) return;
    let active = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    if (companionTarget && effectiveDecision === undefined) setStatus('loading');
    const refreshExecution = (): void => {
      if (request.role !== 'assignment' || actions.toolApprovalExecutionState === undefined) return;
      void actions.toolApprovalExecutionState(cardChannelId, message.id).then(
        (value) => {
          if (!active) return;
          setExecutionState(value);
          if (
            value === 'waiting-human' ||
            value === 'waiting-capacity' ||
            (value === 'running' && effectiveDecision === undefined)
          )
            poll = setTimeout(refreshExecution, 1000);
        },
        () => {
          if (!active) return;
          setExecutionState(undefined);
          poll = setTimeout(refreshExecution, 2000);
        },
      );
    };
    const refreshStatus = (): void => {
      void (
        actions.toolApprovalState?.(cardChannelId, message.id) ??
        actions.toolApprovalStatus(cardChannelId, message.id).then((value) => ({ status: value }))
      ).then(
        ({
          status: value,
          expiresAt: expiry,
        }: {
          status: 'pending' | 'expired';
          expiresAt?: string;
        }) => {
          if (active) {
            setStatus((current) =>
              current === 'expired' || current === 'decided' ? current : value,
            );
            setExpiresAt(expiry);
          }
        },
        () => {
          if (active) setStatus(companionTarget ? 'unavailable' : 'expired');
        },
      );
    };
    const onGrantChanged = (event: Event): void => {
      if ((event as CustomEvent<{ slug: string }>).detail?.slug === botSlug) refreshStatus();
    };
    if (effectiveDecision === undefined) refreshStatus();
    refreshExecution();
    window.addEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(poll);
      window.removeEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    };
  }, [actions, botSlug, effectiveDecision, message.id, request.role, companionTarget?.live, retry]);
  const countdown =
    status === 'pending' && effectiveDecision === undefined && expiresAt !== undefined
      ? approvalCountdown(expiresAt, now)
      : undefined;
  const countdownMount = useMountedResource<HTMLDivElement>(() => {
    if (expiresAt === undefined) return;
    const next = approvalCountdown(expiresAt, Date.now());
    if (next === undefined) return;
    const timer = setTimeout(
      () => {
        const at = Date.now();
        if (approvalCountdown(expiresAt, at) === undefined) setStatus('expired');
        else setNow(at);
      },
      Math.min(next.nextTick, 60_000),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, now]);
  const actionable = status === 'pending' && effectiveDecision === undefined;
  const focusMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (companionTarget !== undefined) return;
      const active = document.activeElement;
      if (active === null || active === document.body)
        node.closest<HTMLElement>('.bh-tool-approval-card')?.focus({ preventScroll: true });
    },
    [companionTarget],
  );
  const decide = (
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): void => {
    if (botSlug === undefined || submitting.current || status !== 'pending') return;
    if (companionTarget && !qualified()) return;
    setBusy(true);
    setError(undefined);
    const channelId = cardChannelId;
    if (
      !companionTarget &&
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('approval.channelChanged'));
      setBusy(false);
      return;
    }
    submitting.current = true;
    const submit = async (): Promise<void> => {
      if (companionTarget) {
        const current = await actions.toolApprovalStatus(channelId, message.id);
        if (!mounted.current || !qualified()) return;
        if (current !== 'pending') {
          setStatus(current);
          return;
        }
      }
      await actions.decideToolApproval(channelId, message.id, outcome);
      if (mounted.current) {
        setAcceptedDecision(outcome);
        setStatus('decided');
      }
    };
    void submit()
      .then(
        () => undefined,
        (cause: unknown) => {
          return actions.toolApprovalStatus(channelId, message.id).then(
            (latest) => {
              if (!mounted.current) return;
              setStatus(latest);
              setError(latest === 'pending' ? errorMessage(cause) : undefined);
            },
            () => {
              if (!mounted.current) return;
              setStatus(companionTarget ? 'unavailable' : 'expired');
              setError(errorMessage(cause));
            },
          );
        },
      )
      .finally(() => {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const disabled = busy || (companionTarget !== undefined && !qualified());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') !== null) return;
    if (!actionable) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (confirmAll) {
      if (key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmAll(false);
      event.currentTarget.focus({ preventScroll: true });
      return;
    }
    if (disabled) return;
    const onCard = target === event.currentTarget;
    if (key === 'y' || (key === 'Enter' && onCard)) decide('allowed-once');
    else if (key === 'n' || key === 'Escape') decide('rejected');
    else if (key === 'a' && !eachUse) setConfirmAll(true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const compact = companionTarget !== undefined;
  const size = compact ? 'sm' : 'md';
  const details = (
    <>
      <div className="bh-note">
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div className="bh-note">{t('approval.cwd', { path: request.cwd })}</div>
      <ApprovalInput toolName={request.toolName} input={request.input} t={t} />
      <div className="bh-note">
        {t(
          request.toolName === 'channel_attachment_open'
            ? 'approval.originalRisk'
            : request.toolName === 'secret_cli'
              ? 'approval.secretCliRisk'
              : request.toolName === 'secret_mcp_connect'
                ? 'approval.secretMcpRisk'
                : 'approval.risk',
        )}
      </div>
    </>
  );
  return (
    <div
      ref={approvalMount}
      className="bh-tool-approval-card"
      data-compact={compact || undefined}
      tabIndex={actionable ? 0 : undefined}
      aria-label={actionable ? t('approval.requestTitle') : undefined}
      aria-keyshortcuts={
        actionable ? (eachUse ? 'Y Enter N Escape' : 'Y Enter N Escape A') : undefined
      }
      onKeyDown={onKeyDown}
    >
      {compact ? (
        <>
          <div className="bh-grant-request-title">
            {t('approval.requestTitle')} · <code>{request.toolName}</code>
          </div>
          <details className="bh-companion-details">
            <summary>{t('companion.details')}</summary>
            {details}
          </details>
        </>
      ) : (
        <>
          <div className="bh-grant-request-title">{t('approval.requestTitle')}</div>
          {details}
        </>
      )}
      {countdown === undefined ? null : (
        <div
          ref={countdownMount}
          className="bh-note bh-tool-approval-countdown"
          data-urgent={countdown.urgent || undefined}
        >
          <time dateTime={expiresAt} title={new Date(expiresAt!).toLocaleString()}>
            {t(countdown.key, { count: String(countdown.count) })}
          </time>
        </div>
      )}
      {executionState === 'waiting-human' ||
      executionState === 'waiting-capacity' ||
      executionState === 'needs-repair' ? (
        <div role="status" className="bh-note">
          {t(
            executionState === 'waiting-human'
              ? 'approval.waitingHumanCapacity'
              : executionState === 'waiting-capacity'
                ? 'approval.waitingCapacity'
                : 'approval.needsRepair',
          )}
        </div>
      ) : null}
      {effectiveDecision !== undefined ? (
        <div role="status" className="bh-note">
          {effectiveDecision === 'rejected'
            ? t('approval.rejected')
            : effectiveDecision === 'allowed-once'
              ? t('approval.approved')
              : t(
                  request.toolName === 'secret_mcp_connect'
                    ? 'approval.serverRemembered'
                    : 'approval.ruleSaved',
                )}
        </div>
      ) : status === 'pending' && !confirmAll ? (
        <div ref={focusMount} className="bh-tool-approval-actions bh-message-card-actions">
          <Button
            variant="primary"
            size={size}
            disabled={disabled}
            onClick={() => decide('allowed-once')}
          >
            {t('approval.allowOnce')}
          </Button>
          {eachUse && request.toolName !== 'secret_mcp_connect' ? null : (
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              onClick={() => decide('allowed-always-exact')}
            >
              {t(
                request.toolName === 'secret_mcp_connect'
                  ? 'approval.allowAndRemember'
                  : 'approval.allowExact',
              )}
            </Button>
          )}
          {eachUse ? null : (
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              onClick={() => setConfirmAll(true)}
            >
              {t('approval.allowAll')}
            </Button>
          )}
          <Button
            variant="outline"
            size={size}
            disabled={disabled}
            onClick={() => decide('rejected')}
          >
            {t('approval.reject')}
          </Button>
        </div>
      ) : confirmAll && status === 'pending' ? null : (
        <div role="status" className="bh-note">
          {status === 'loading'
            ? t('approval.loading')
            : status === 'unavailable'
              ? t('companion.requestUnavailable')
              : t('approval.expired')}
        </div>
      )}
      {status === 'pending' &&
      effectiveDecision === undefined &&
      !confirmAll &&
      !eachUse &&
      companionTarget === undefined &&
      request.role === 'orchestrator' &&
      cardChannelId === 'dm-' + botSlug ? (
        <div className="bh-message-card-actions">
          <Button
            variant="ghost"
            size={size}
            onClick={() => channelSettings.open('workspace-grants')}
          >
            {t('approval.fullAccessEntry')}
          </Button>
        </div>
      ) : null}
      {companionTarget && status === 'unavailable' ? (
        <div className="bh-message-card-actions">
          <Button
            variant="outline"
            disabled={!qualified()}
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('companion.retryRequest')}
          </Button>
        </div>
      ) : null}
      {confirmAll && status === 'pending' ? (
        <div className="bh-message-card-actions">
          <div
            className="bh-tool-approval-confirm"
            role="group"
            aria-label={t('approval.allowAll')}
          >
            <div className="bh-note">{t('approval.allowAllRisk')}</div>
            <div className="bh-tool-approval-actions bh-message-card-actions">
              <Button
                variant="primary"
                size={size}
                disabled={disabled}
                onClick={() => decide('allowed-always-all')}
              >
                {t('approval.confirmAll')}
              </Button>
              <Button
                variant="outline"
                size={size}
                disabled={busy}
                onClick={() => setConfirmAll(false)}
              >
                {t('approval.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {actionable && !compact ? (
        <div className="bh-note bh-tool-approval-keys" aria-hidden="true">
          {confirmAll ? (
            <>
              <kbd>Esc</kbd> {t('approval.cancel')}
            </>
          ) : (
            <>
              <kbd>Y</kbd> {t('approval.keyAllow')} · <kbd>N</kbd> {t('approval.keyReject')}
              {eachUse ? null : (
                <>
                  {' · '}
                  <kbd>A</kbd> {t('approval.keyAll')}
                </>
              )}
            </>
          )}
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

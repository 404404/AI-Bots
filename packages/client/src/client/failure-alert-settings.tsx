import type { ReactElement } from 'react';
import { Button, Checkbox, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { FailureAlertSnapshot } from '../../../core/src/messaging/failure-alerts.js';
import { MessagingHelp } from './messaging-help.js';
import type { BotHarnessTranslate } from './locale.js';

export function FailureAlertSettings({
  snapshot,
  busy,
  save,
  test,
  retry,
  openSession,
  t,
}: {
  snapshot?: FailureAlertSnapshot;
  busy: boolean;
  save(enabled: boolean, revision: number): Promise<void>;
  test(): Promise<void>;
  retry(id: string): Promise<void>;
  openSession(sessionId: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <section aria-label={t('failureAlerts.title')}>
      <div className="bh-im-actions">
        <Checkbox
          checked={snapshot?.enabled ?? false}
          disabled={busy || !snapshot}
          label={t('failureAlerts.title')}
          onChange={(enabled) => void save(enabled, snapshot?.revision ?? 0)}
        />
        <MessagingHelp title={t('failureAlerts.title')} text={t('failureAlerts.hint')} t={t} />
        <Button
          size="sm"
          variant="toolbar"
          disabled={busy || !snapshot?.enabled || !snapshot.available}
          onClick={() => void test()}
        >
          {t('failureAlerts.test')}
        </Button>
      </div>
      {snapshot?.enabled && !snapshot.available ? (
        <p role="status" className="bh-muted">
          {t('failureAlerts.unavailable')}
        </p>
      ) : null}
      {snapshot?.deliveries.map((delivery) => (
        <article key={delivery.id} className="bh-im-pairing-request">
          <div className="bh-im-actions">
            <strong>
              {t(delivery.sessionId ? 'failureAlerts.event' : 'failureAlerts.testLabel')}
            </strong>
            <Tag>{t(`failureAlerts.state.${delivery.state}`)}</Tag>
            <time dateTime={delivery.createdAt}>
              {new Date(delivery.createdAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {delivery.sessionId ? (
              <Button size="sm" variant="toolbar" onClick={() => openSession(delivery.sessionId!)}>
                {t('failureAlerts.openSession')}
              </Button>
            ) : null}
            {delivery.state === 'failed' &&
            delivery.attempts < 3 &&
            snapshot.enabled &&
            snapshot.available ? (
              <Button
                size="sm"
                variant="toolbar"
                disabled={busy}
                onClick={() => void retry(delivery.id)}
              >
                {t('approvalIm.retry')}
              </Button>
            ) : null}
          </div>
          {delivery.state === 'unknown-outcome' ? (
            <p role="status" className="bh-muted">
              {t('failureAlerts.unknown')}
            </p>
          ) : null}
          {delivery.reason ? <code>{delivery.reason}</code> : null}
        </article>
      ))}
    </section>
  );
}

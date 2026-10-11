import { useId, useRef, useState, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import type { PrivateInputStatus } from '../../../core/src/credentials/contracts.js';
import { PrivateAccountControls } from './private-account-controls.js';

type PrivateCardMount = {
  node: HTMLFormElement;
  requestId: string;
  active: boolean;
  terminal: PrivateInputStatus | undefined;
};

export function PrivateInputCard({
  message,
  actions,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const request = message.privateInputRequest!;
  const channelId = 'dm-' + (message.author.kind === 'bot' ? message.author.slug : '');
  const id = useId();
  const mounted = useRef<PrivateCardMount>();
  const submitting = useRef(false);
  const [status, setStatus] = useState<PrivateInputStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLFormElement>(
    (node) => {
      const replacing = mounted.current?.requestId !== message.id;
      const lease: PrivateCardMount = {
        node,
        requestId: message.id,
        active: true,
        terminal: undefined,
      };
      mounted.current = lease;
      submitting.current = false;
      setStatus('loading');
      setBusy(false);
      if (replacing) setError(false);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = () => {
        void actions.privateInputStatus?.(channelId, message.id).then(
          (current) => {
            if (!lease.active || lease.terminal !== undefined) return;
            setStatus(current);
            if (current !== 'pending') {
              lease.terminal = current;
              setError(false);
              node.reset();
            } else timer = setTimeout(poll, 2500);
          },
          () => {
            if (lease.active && lease.terminal === undefined) setError(true);
          },
        );
      };
      poll();
      return () => {
        lease.active = false;
        clearTimeout(timer);
        node.reset();
      };
    },
    [actions, channelId, message.id, retry],
  );
  const disabled = status !== 'pending' || busy || actions.privateInputSubmit === undefined;
  const settle = async (cancel: boolean): Promise<void> => {
    if (
      disabled ||
      submitting.current ||
      mounted.current?.active !== true ||
      store.getSnapshot().conversation.channel?.id !== channelId
    )
      return;
    const lease = mounted.current;
    submitting.current = true;
    setBusy(true);
    setError(false);
    const values: Record<string, string> = {};
    try {
      if (cancel) await actions.privateInputCancel?.(channelId, message.id);
      else {
        const data = new FormData(lease.node);
        for (const field of request.fields) values[field.id] = String(data.get(field.id) ?? '');
        lease.node.reset();
        await actions.privateInputSubmit!(channelId, message.id, values);
      }
      const current = (await actions.privateInputStatus?.(channelId, message.id)) ?? 'expired';
      if (lease.active) {
        if (current !== 'pending') lease.terminal = current;
        setStatus(current);
      }
    } catch {
      if (lease.active && lease.terminal === undefined) {
        setError(true);
        setRetry((value) => value + 1);
      }
    } finally {
      for (const key of Object.keys(values)) delete values[key];
      if (lease.active) {
        lease.node.reset();
        submitting.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <form
      ref={mount}
      className="bh-question-card"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void settle(false);
      }}
    >
      <div className="bh-grant-request-title">{t('privateInput.title')}</div>
      <div className="bh-note">
        {t('privateInput.account')}: {request.account}
      </div>
      <div className="bh-question-prompt">{request.purpose}</div>
      {request.replacesMessageId === undefined ? null : (
        <div className="bh-note">{t('privateInput.replacementNote')}</div>
      )}
      {request.expiresAt === undefined ? null : (
        <div className="bh-note">
          {t('privateInput.expiresAt', { time: new Date(request.expiresAt).toLocaleString() })}
        </div>
      )}
      <div className="bh-note">{t('privateInput.note')}</div>
      {status === 'pending' ? (
        request.fields.map((field) => (
          <div className="bh-question-item" key={field.id}>
            <label htmlFor={id + field.id}>
              {field.label}
              {field.required ? ' *' : ''}
            </label>
            <Input
              id={id + field.id}
              name={field.id}
              type="password"
              required={field.required}
              maxLength={16384}
              autoComplete="new-password"
              disabled={disabled}
            />
          </div>
        ))
      ) : (
        <div role="status" className="bh-note">
          {status === 'loading'
            ? t('approval.loading')
            : status === 'configured'
              ? t('privateInput.configured')
              : status === 'cancelled'
                ? t('question.cancelled')
                : t('privateInput.expired')}
        </div>
      )}
      {status === 'pending' ? (
        <div className="bh-question-actions">
          <Button type="submit" disabled={disabled}>
            {busy ? t('approval.loading') : t('privateInput.submit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void settle(true)}
          >
            {t('privateInput.cancel')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="bh-error" role="alert">
          {t('privateInput.error')}{' '}
          <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>
            {t('question.retry')}
          </Button>
        </div>
      ) : null}
      {status === 'configured' && actions.privateAccountStatus !== undefined ? (
        <PrivateAccountControls
          channelId={channelId}
          messageId={message.id}
          actions={actions}
          t={t}
        />
      ) : null}
    </form>
  );
}

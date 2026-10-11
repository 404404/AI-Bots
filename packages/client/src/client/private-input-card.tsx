import { useId, useRef, useState, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import type { PrivateInputStatus } from '../../../core/src/credentials/contracts.js';

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
  const form = useRef<HTMLFormElement | null>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState<PrivateInputStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLFormElement>(
    (node) => {
      form.current = node;
      alive.current = true;
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = () => {
        void actions.privateInputStatus?.(channelId, message.id).then(
          (current) => {
            if (!active) return;
            setStatus(current);
            if (current !== 'pending') form.current?.reset();
            else timer = setTimeout(poll, 2500);
          },
          () => {
            if (active) setError(true);
          },
        );
      };
      poll();
      return () => {
        active = false;
        alive.current = false;
        clearTimeout(timer);
        form.current?.reset();
      };
    },
    [actions, channelId, message.id, retry],
  );
  const disabled = status !== 'pending' || busy || actions.privateInputSubmit === undefined;
  const settle = async (cancel: boolean): Promise<void> => {
    if (
      disabled ||
      form.current === null ||
      store.getSnapshot().conversation.channel?.id !== channelId
    )
      return;
    setBusy(true);
    setError(false);
    const values: Record<string, string> = {};
    try {
      if (cancel) await actions.privateInputCancel?.(channelId, message.id);
      else {
        const data = new FormData(form.current);
        for (const field of request.fields) values[field.id] = String(data.get(field.id) ?? '');
        form.current.reset();
        await actions.privateInputSubmit!(channelId, message.id, values);
      }
      if (alive.current) setStatus(cancel ? 'cancelled' : 'configured');
    } catch {
      if (alive.current) {
        setError(true);
        setRetry((value) => value + 1);
      }
    } finally {
      for (const key of Object.keys(values)) delete values[key];
      form.current?.reset();
      if (alive.current) setBusy(false);
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
                : t('question.expired')}
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
    </form>
  );
}

import { useId, useRef, useState, type ReactElement } from 'react';
import { useMountedResource } from './mounted-resource.js';
import type { ApprovalTemplateView } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function ApprovalTemplateEntry({
  botSlug,
  actions,
  disabled,
  t,
}: {
  botSlug: string;
  actions: {
    approvalTemplates?(
      slug: string,
    ): Promise<{ templates: ApprovalTemplateView[]; selected: string | null }>;
    setBotApprovalTemplate?(slug: string, template: string | null): Promise<void>;
  };
  disabled: boolean;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const id = useId();
  const [templates, setTemplates] = useState<ApprovalTemplateView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const current = useRef(botSlug);
  current.current = botSlug;
  const mount = useMountedResource<HTMLDivElement>(() => {
    setTemplates([]);
    setSelected(null);
    setError(undefined);
    if (actions.approvalTemplates === undefined) return;
    void actions
      .approvalTemplates(botSlug)
      .then((loaded) => {
        if (current.current !== botSlug) return;
        setTemplates(loaded.templates);
        setSelected(loaded.selected);
      })
      .catch((cause: unknown) => {
        if (current.current === botSlug) setError(errorMessage(cause));
      });
  }, [actions, botSlug]);
  if (actions.approvalTemplates === undefined || actions.setBotApprovalTemplate === undefined)
    return null;
  const chosen = templates.find((template) => template.name === selected);
  return (
    <div ref={mount} className="bh-approval-template" data-approval-template>
      <label className="bh-note" htmlFor={id}>
        {t('autoApproval.title')}
      </label>
      <select
        id={id}
        value={selected ?? ''}
        disabled={disabled || busy || templates.length === 0}
        onChange={(event) => {
          const next = event.currentTarget.value === '' ? null : event.currentTarget.value;
          const previous = selected;
          setSelected(next);
          setBusy(true);
          setError(undefined);
          void actions.setBotApprovalTemplate!(botSlug, next)
            .catch((cause: unknown) => {
              if (current.current !== botSlug) return;
              setSelected(previous);
              setError(errorMessage(cause));
            })
            .finally(() => {
              if (current.current === botSlug) setBusy(false);
            });
        }}
      >
        <option value="">{t('autoApproval.off')}</option>
        {templates.map((template) => (
          <option key={template.name} value={template.name}>
            {template.title}
          </option>
        ))}
      </select>
      <div className="bh-access-hint">
        {chosen === undefined
          ? t('autoApproval.hintOff')
          : t('autoApproval.hintOn', { description: chosen.description })}
      </div>
      {error === undefined ? null : (
        <div className="bh-note" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function AutoApprovalLine({
  messageId,
  record,
  t,
}: {
  messageId: string;
  record: NonNullable<import('./store.js').ChannelMessage['toolAutoApproval']>;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <details className="bh-auto-approval" data-message-id={messageId}>
      <summary className="bh-member-departure">
        <span>
          {t(record.outcome === 'allowed' ? 'autoApproval.allowed' : 'autoApproval.rejected', {
            template: record.template,
            reason: record.reason,
          })}
        </span>
      </summary>
      <div className="bh-note">{t('autoApproval.tool', { tool: record.toolName })}</div>
      <pre className="bh-tool-approval-input">{record.input}</pre>
    </details>
  );
}

import { useRef, useState, type ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { useMountedResource } from './mounted-resource.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import type { ApprovalTemplateView } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

const OFF = 'off';

function templateTitle(t: BotHarnessTranslate, name: string, fallback: string | undefined): string {
  if (name === 'cautious') return t('autoApproval.template.cautious');
  if (name === 'get-work-done') return t('autoApproval.template.getWorkDone');
  return fallback ?? name;
}

function templateDescription(t: BotHarnessTranslate, template: ApprovalTemplateView): string {
  if (template.name === 'cautious') return t('autoApproval.template.cautiousHint');
  if (template.name === 'get-work-done') return t('autoApproval.template.getWorkDoneHint');
  return template.description;
}

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
    <>
      <SettingsSection title={t('autoApproval.section')}>
        <SettingsRow
          rootRef={mount}
          data={{ 'data-approval-template': '' }}
          title={t('autoApproval.title')}
          description={
            chosen === undefined
              ? t('autoApproval.hintOff')
              : t('autoApproval.hintOn', { description: templateDescription(t, chosen) })
          }
          control={
            <Select
              label={t('autoApproval.title')}
              value={selected ?? OFF}
              disabled={disabled || busy || templates.length === 0}
              options={[
                { value: OFF, label: t('autoApproval.off') },
                ...templates.map((template) => ({
                  value: template.name,
                  label: templateTitle(t, template.name, template.title),
                })),
              ]}
              onChange={(value) => {
                const next = value === OFF ? null : value;
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
            />
          }
        />
      </SettingsSection>
      {error === undefined ? null : (
        <Note tone="danger" inset>
          {error}
        </Note>
      )}
    </>
  );
}

export function AutoApprovalLine({
  messageId,
  record,
  bots,
  t,
}: {
  messageId: string;
  record: NonNullable<ChannelMessage['toolAutoApproval']>;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const bot = bots.find((candidate) => candidate.slug === record.botSlug);
  const name = bot?.displayName ?? record.botSlug;
  const template = templateTitle(t, record.template, undefined);
  return (
    <div className="bh-memory-commit-row" data-auto-approval={record.outcome}>
      <button
        type="button"
        className="bh-memory-commit-line bh-dm-trace-line"
        data-message-id={messageId}
        aria-expanded={open}
        title={t('autoApproval.tool', { tool: record.toolName })}
        onClick={() => setOpen((previous) => !previous)}
      >
        <ChannelSidebarIcon name="shield-check" size={14} />
        <span className="bh-bot-dm-action-bot">
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={record.botSlug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span>
          {t(record.outcome === 'allowed' ? 'autoApproval.allowed' : 'autoApproval.rejected', {
            template,
          })}
        </span>
        <span className="bh-memory-commit-subject">{record.reason}</span>
        <span className="bh-memory-commit-files">{record.toolName}</span>
      </button>
      {open ? <pre className="bh-tool-approval-input">{record.input}</pre> : null}
    </div>
  );
}

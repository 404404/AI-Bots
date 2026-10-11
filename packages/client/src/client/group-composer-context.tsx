import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { AssignmentAccessPresetView, WorkspaceGrantView, WorkspaceOption } from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotSummary, ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ComposerContext } from './composer-shortcuts.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import {
  WorkspaceFolderPicker,
  WorkspaceGrantConfirmation,
  withWorkspaceActionDeadline,
} from './workspace-grants-entry.js';
import { subscribeWorkspaceGrantChanges } from './workspace-grant-events.js';
import { authorizeGroupMembers, type GroupGrantResult } from './group-workspace-authorization.js';

interface PreviewMember {
  slug: string;
  name: string;
  grant: WorkspaceGrantView | undefined;
  access: AssignmentAccessPresetView;
}

export function useGroupComposerContext({
  channel,
  members,
  actions,
  t,
}: {
  channel: ChannelSummary | undefined;
  members: BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ComposerContext | undefined {
  const [openChannel, setOpenChannel] = useState<string>();
  if (channel?.type !== 'group') return;
  const open = () => setOpenChannel(channel.id);
  return {
    target: channel.id,
    shortcuts: [
      {
        id: 'workspace',
        label: t('grant.addFolder'),
        icon: <ChannelSidebarIcon name="folder-key" />,
        run: open,
      },
    ],
    content: (
      <GroupComposerContextView
        key={channel.id}
        channelId={channel.id}
        members={members.filter((bot) => !bot.deleted && !bot.paused)}
        actions={actions}
        t={t}
        open={openChannel === channel.id}
        onOpen={open}
        onClose={() => setOpenChannel(undefined)}
      />
    ),
  };
}

export function GroupComposerContextView({
  channelId,
  members,
  actions,
  t,
  open,
  onOpen,
  onClose,
}: {
  channelId: string;
  members: BotSummary[];
  actions: BridgeActions;
  t: BotHarnessTranslate;
  open: boolean;
  onOpen(): void;
  onClose(): void;
}): ReactElement {
  const [selected, setSelected] = useState<string[]>([]);
  const [facts, setFacts] = useState<Record<string, WorkspaceGrantView[] | undefined>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [preview, setPreview] = useState<{ path: string; members: PreviewMember[] }>();
  const [results, setResults] = useState<GroupGrantResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const current = useRef(0);
  const factRequest = useRef(0);
  const eligible = selected.filter((slug) => members.some((bot) => bot.slug === slug));
  const signature = eligible.join('|');
  const mount = useMountedResource<HTMLDivElement>(() => {
    current.current += 1;
    return () => {
      current.current += 1;
    };
  }, []);
  const factMount = useMountedResource<HTMLButtonElement>(() => {
    const generation = ++factRequest.current;
    const refresh = (slug: string): void => {
      void actions.listWorkspaceGrants(slug).then(
        (rows) => {
          if (factRequest.current === generation)
            setFacts((value) => ({
              ...value,
              [slug]: rows.filter((grant) => grant.revokedAt === undefined),
            }));
        },
        () => {
          if (factRequest.current === generation)
            setFacts((value) => ({ ...value, [slug]: undefined }));
        },
      );
    };
    for (const slug of eligible) refresh(slug);
    if (eligible.length > 0)
      void actions.listWorkspaceOptions().then(
        (rows) => {
          if (factRequest.current === generation) setWorkspaces(rows);
        },
        () => {},
      );
    const disposers = eligible.map((slug) =>
      subscribeWorkspaceGrantChanges(slug, () => refresh(slug)),
    );
    return () => {
      factRequest.current += 1;
      disposers.forEach((dispose) => dispose());
    };
  }, [actions, signature]);
  const choose = (path: string): void => {
    if (busy || eligible.length === 0) return;
    const generation = current.current;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    setResults([]);
    void withWorkspaceActionDeadline(
      (async () => {
        const resolved = await actions.resolveWorkspaceFolder(path);
        const targets = await Promise.all(
          eligible.map(async (slug): Promise<PreviewMember> => ({
            slug,
            name: members.find((bot) => bot.slug === slug)!.displayName,
            grant: await actions.readGroupWorkspaceGrant(channelId, slug, resolved.path),
            access: await actions.assignmentAccess(slug),
          })),
        );
        if (current.current === generation) setPreview({ path: resolved.path, members: targets });
      })(),
      t('grant.loadTimeout'),
    )
      .catch((cause: unknown) => {
        if (current.current === generation) setError(errorMessage(cause));
      })
      .finally(() => {
        if (current.current === generation) setBusy(false);
      });
  };
  const submit = (): void => {
    if (busy || preview === undefined) return;
    const generation = current.current;
    setBusy(true);
    setError(undefined);
    void authorizeGroupMembers({
      actions,
      channelId,
      path: preview.path,
      slugs: preview.members.map((bot) => bot.slug),
      previous: results,
      deadline: (operation) => withWorkspaceActionDeadline(operation, t('grant.operationTimeout')),
      onResult: (result) => {
        if (current.current === generation)
          setResults((rows) => [...rows.filter((row) => row.slug !== result.slug), result]);
      },
    }).finally(() => {
      if (current.current === generation) setBusy(false);
    });
  };
  const chip =
    eligible.length === 0
      ? t('groupGrant.select')
      : eligible
          .map(
            (slug) =>
              `${members.find((bot) => bot.slug === slug)!.displayName} · ${facts[slug] === undefined ? t('composerContext.unavailable') : t('composerContext.workspaces', { count: facts[slug]!.length })}`,
          )
          .join(' / ');
  const retry = results.some((row) => row.status === 'unknown' || row.status === 'failed');
  return (
    <div ref={mount}>
      <div className="bh-composer-context" aria-label={t('composerContext.label')}>
        <button ref={factMount} type="button" onClick={onOpen}>
          <ChannelSidebarIcon name="folder-key" size={14} />
          <span>{chip}</span>
        </button>
      </div>
      {open ? (
        <Modal
          open
          className="bh-group-grant-modal"
          contentClassName="bh-group-grant-content"
          title={t('entry.workspaceGrants')}
          closeLabel={t('approval.cancel')}
          onClose={() => {
            if (!busy) onClose();
          }}
        >
          <div className="bh-workspace-grants">
            <p className="bh-note">{t('groupGrant.scope')}</p>
            <fieldset className="bh-group-grant-members" disabled={busy}>
              <legend>{t('groupGrant.select')}</legend>
              {members.map((bot) => (
                <label key={bot.slug}>
                  <input
                    type="checkbox"
                    checked={eligible.includes(bot.slug)}
                    onChange={(event) => {
                      setSelected(
                        event.target.checked
                          ? [...eligible, bot.slug]
                          : eligible.filter((slug) => slug !== bot.slug),
                      );
                      setPreview(undefined);
                      setResults([]);
                      setError(undefined);
                    }}
                  />
                  {bot.displayName}
                </label>
              ))}
              {members.length === 0 ? <p>{t('groupGrant.noMembers')}</p> : null}
            </fieldset>
            {error === undefined ? null : (
              <div className="bh-error" role="alert">
                {error}
              </div>
            )}
            {busy ? (
              <div className="bh-note" role="status">
                {t('grant.working')}
              </div>
            ) : null}
            {preview === undefined ? (
              <WorkspaceFolderPicker
                actions={actions}
                t={t}
                disabled={busy || eligible.length === 0}
                workspaces={workspaces}
                onChoose={choose}
              />
            ) : (
              <WorkspaceGrantConfirmation title={t('groupGrant.confirm')}>
                {preview.members.map((bot) => (
                  <div key={bot.slug} className="bh-group-grant-result">
                    <strong>{bot.name}</strong>
                    <p>{t('composerContext.grantScope', { path: preview.path })}</p>
                    <div className="bh-note">
                      {t('groupGrant.access', {
                        mode: bot.access.mode,
                        write: t(
                          bot.grant?.orchestratorWrite ? 'grant.chip.write' : 'grant.chip.read',
                        ),
                      })}
                    </div>
                    {results.find((row) => row.slug === bot.slug) === undefined ? (
                      <p>
                        {t(bot.grant === undefined ? 'groupGrant.pending' : 'groupGrant.existing')}
                      </p>
                    ) : (
                      results
                        .filter((row) => row.slug === bot.slug)
                        .map((row) => (
                          <div key={row.slug} role="status">
                            <strong>{t(`groupGrant.${row.status}`)}</strong>
                            {row.error === undefined ? null : (
                              <div className="bh-error">{row.error}</div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                ))}
                <p className="bh-note">{t('groupGrant.partial')}</p>
                {results.length === 0 || retry ? (
                  <Button disabled={busy} onClick={submit}>
                    {t(results.length === 0 ? 'grant.authorize' : 'groupGrant.retry')}
                  </Button>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() => {
                    setPreview(undefined);
                    setResults([]);
                  }}
                >
                  {t('approval.cancel')}
                </Button>
              </WorkspaceGrantConfirmation>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

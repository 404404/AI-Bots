import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button, closeTopModal, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { BridgeActions } from './actions.js';
import { BOT_SETTINGS_SECTIONS, type BotSettings } from './bot-settings.js';
import { openExternalBindingSettings } from './bot-settings-open.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { loadMessagingApps, resumeImSetup, type BridgeCall, type MessagingApp } from './bridge.js';
import type { TobImSetupReceipt } from '../../../core/src/tob/cli-im-setup-operations.js';
import { Combobox } from './combobox.js';
import { EmptyState } from './ds/empty-state.js';
import { Field } from './ds/field.js';
import { ConfirmDialog, FormDialog, type DialogLabels } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsRows, SettingsValue } from './ds/settings-row.js';
import { CreateAppForm } from './create-app-form.js';
import { useMountedResource } from './mounted-resource.js';
import type { AppSetupDescriptor, ProviderAppSetup } from './provider-app-setup.js';
import type { ClientStore } from './store.js';

export type ImAppsNotice = 'settings-unavailable';

export interface ImAppsList {
  apps: MessagingApp[];
  setups: AppSetupDescriptor[];
  pendingSetups?: TobImSetupReceipt[];
}

export interface ImAppsFace {
  load(): Promise<ImAppsList>;
  manage(): void;
  takeNotice(): ImAppsNotice | undefined;
  bind(app: MessagingApp, botSlug: string): Promise<void>;
  unbind(app: MessagingApp): Promise<void>;
  bindCreated(botSlug: string): Promise<void>;
  resumeSetup?(receiptId: string, botSlug: string): Promise<void>;
  appSetup?: ProviderAppSetup;
}

export function createImApps({
  call,
  botSettings,
  actions,
  openDshSettings = (returned, unavailable) =>
    openExternalBindingSettings(document, returned, () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null)
        closeTopModal(document);
      unavailable();
    }),
}: {
  call: BridgeCall;
  botSettings: Pick<BotSettings, 'open' | 'close'>;
  actions: Pick<BridgeActions, 'messagingIdentity' | 'messagingSnapshot' | 'appSetup'>;
  openDshSettings?: (returned: () => void, unavailable: () => void) => () => void;
}): ImAppsFace {
  let notice: ImAppsNotice | undefined;
  let stop: (() => void) | undefined;
  return {
    load: () => loadMessagingApps(call),
    manage: () => {
      stop?.();
      botSettings.close();
      stop = openDshSettings(
        () => {
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
        () => {
          notice = 'settings-unavailable';
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
      );
    },
    takeNotice: () => {
      const taken = notice;
      notice = undefined;
      return taken;
    },
    bind: async (app, botSlug) => {
      await actions.messagingIdentity(botSlug, {
        kind: 'bind',
        providerId: app.providerId,
        accountRef: app.ref,
        fingerprint: app.fingerprint,
      });
    },
    unbind: async (app) => {
      if (app.boundBotSlug === undefined || app.bindingId === undefined)
        throw new Error('not-bound');
      const snapshot = await actions.messagingSnapshot(app.boundBotSlug);
      const identity = snapshot.identities?.find((candidate) => candidate.id === app.bindingId);
      if (identity === undefined) throw new Error('binding-missing');
      await actions.messagingIdentity(app.boundBotSlug, {
        kind: 'unbind',
        id: identity.id,
        expectedRevision: identity.revision,
      });
    },
    bindCreated: async (botSlug) => {
      const setup = actions.appSetup;
      if (setup === undefined) throw new Error('setup-unavailable');
      await actions.messagingIdentity(botSlug, setup.binding(botSlug));
      setup.forget(botSlug);
    },
    resumeSetup: async (receiptId, botSlug) => {
      if (!actions.appSetup) throw new Error('setup-unavailable');
      await actions.messagingSnapshot(botSlug);
      const resumed = await resumeImSetup(call, receiptId);
      await actions.appSetup.adopt(botSlug, resumed.descriptor, resumed.attemptId);
    },
    ...(actions.appSetup === undefined ? {} : { appSetup: actions.appSetup }),
  };
}

type Loaded = { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & ImAppsList);

type Dialog =
  | { kind: 'bind'; app: MessagingApp }
  | { kind: 'unbind'; app: MessagingApp }
  | { kind: 'create'; creating: boolean; receipt?: TobImSetupReceipt };

export function ImAppsSection({
  imApps,
  store,
  t,
}: PropsLocale<'botharness'> &
  InjectFace<{ imApps: ImAppsFace; store: ClientStore }>): ReactElement {
  const bots = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bots);
  const [notice] = useState(() => imApps.takeNotice());
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [dialog, setDialog] = useState<Dialog>();
  const [botSlug, setBotSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reload = async (): Promise<void> => {
    try {
      setLoaded({ status: 'ready', ...(await imApps.load()) });
    } catch {
      setLoaded({ status: 'failed' });
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    imApps.load().then(
      (list) => {
        if (active) setLoaded({ status: 'ready', ...list });
      },
      () => {
        if (active) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [imApps]);
  const botName = (slug: string): string =>
    bots.find((bot) => bot.slug === slug)?.displayName ?? t('imApps.removedBot');
  const open = (next: Dialog): void => {
    setBotSlug('');
    setFailed(false);
    setDialog(next);
  };
  const dismiss = (): void => {
    if (!busy) setDialog(undefined);
  };
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      setDialog(undefined);
      await reload();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const botPicker = (
    <Field label={t('imApps.bot')} group>
      {() => (
        <Combobox
          label={t('imApps.bot')}
          toggleLabel={t('imApps.bot')}
          placeholder={t('imApps.chooseBot')}
          searchable={false}
          disabled={busy}
          value={botSlug}
          onSelect={setBotSlug}
          options={bots.map((bot) => ({ value: bot.slug, label: bot.displayName }))}
        />
      )}
    </Field>
  );
  const error = failed ? t('imApps.failed') : undefined;
  const labels: DialogLabels = { close: t('common.close'), cancel: t('common.cancel') };
  const canCreate =
    imApps.appSetup !== undefined && loaded.status === 'ready' && loaded.setups.length > 0;
  return (
    <SettingsRows rootRef={mount}>
      <SettingsRow
        title={t('imApps.allApps')}
        description={t('imApps.description')}
        control={
          <>
            {canCreate && loaded.status === 'ready' && loaded.apps.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  open({ kind: 'create', creating: false });
                }}
              >
                {t('imApps.create')}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={imApps.manage}>
              {t('imApps.manage')}
            </Button>
          </>
        }
      >
        {notice === 'settings-unavailable' ? <Note>{t('imApps.settingsUnavailable')}</Note> : null}
      </SettingsRow>
      {loaded.status === 'ready'
        ? (loaded.pendingSetups ?? []).map((receipt) => {
            const expired = receipt.expiresAt <= Date.now();
            const finished = ['ready', 'cancelled', 'expired', 'failed'].includes(receipt.state);
            const available = loaded.setups.some((setup) => setup.platform === receipt.platform);
            return (
              <SettingsRow
                key={receipt.receiptId}
                data={{ 'data-im-setup-receipt': receipt.receiptId }}
                title={t('imApps.resumeSetupFor', {
                  platform: externalPlatformLabel(receipt.platform, t),
                })}
                description={t('imApps.setupExpires', {
                  expires: new Date(receipt.expiresAt).toLocaleString(),
                })}
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={expired || finished || !available || !imApps.resumeSetup}
                    aria-label={t('imApps.resumeSetupFor', {
                      platform: externalPlatformLabel(receipt.platform, t),
                    })}
                    onClick={() => open({ kind: 'create', creating: false, receipt })}
                  >
                    {t(
                      expired
                        ? 'imApps.setupExpired'
                        : finished
                          ? 'imApps.setupFinished'
                          : !available
                            ? 'imApps.setupUnavailable'
                            : 'imApps.resumeSetup',
                    )}
                  </Button>
                }
              />
            );
          })
        : null}
      {loaded.status === 'loading' ? null : loaded.status === 'failed' ? (
        <EmptyState status title={t('imApps.loadFailed')} />
      ) : loaded.apps.length === 0 ? (
        <EmptyState
          title={t('imApps.empty')}
          description={t('imApps.emptyHint')}
          action={
            canCreate ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  open({ kind: 'create', creating: false });
                }}
              >
                {t('imApps.create')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {loaded.apps.map((app) => (
            <SettingsRow
              key={`${app.providerId}:${app.ref}`}
              data={{ 'data-im-app': app.ref }}
              title={app.name}
              description={`${externalPlatformLabel(app.platform, t)} · ${t(
                app.connected ? 'imApps.connected' : 'imApps.disconnected',
              )}`}
              control={
                app.boundBotSlug === undefined ? (
                  <>
                    <Tag>{t('imApps.unbound')}</Tag>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!app.connected || app.unsupported !== undefined}
                      aria-label={t('imApps.bindFor', { app: app.name })}
                      onClick={() => {
                        open({ kind: 'bind', app });
                      }}
                    >
                      {t('imApps.bind')}
                    </Button>
                  </>
                ) : (
                  <>
                    <SettingsValue>{botName(app.boundBotSlug)}</SettingsValue>
                    {bots.some((bot) => bot.slug === app.boundBotSlug) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('imApps.unbindFor', { app: app.name })}
                        onClick={() => {
                          open({ kind: 'unbind', app });
                        }}
                      >
                        {t('imApps.unbind')}
                      </Button>
                    ) : null}
                  </>
                )
              }
            />
          ))}
        </>
      )}
      {dialog?.kind === 'bind' ? (
        <FormDialog
          title={t('imApps.bindFor', { app: dialog.app.name })}
          labels={labels}
          submitLabel={t('imApps.bind')}
          submitDisabled={botSlug === ''}
          busy={busy}
          error={error}
          onCancel={dismiss}
          onSubmit={() => void run(() => imApps.bind(dialog.app, botSlug))}
        >
          {botPicker}
        </FormDialog>
      ) : null}
      {dialog?.kind === 'unbind' ? (
        <ConfirmDialog
          title={t('imApps.unbindFor', { app: dialog.app.name })}
          description={
            dialog.app.boundBotSlug === undefined
              ? undefined
              : t('imApps.unbindHint', {
                  bot: botName(dialog.app.boundBotSlug),
                  app: dialog.app.name,
                })
          }
          labels={labels}
          confirmLabel={t('imApps.unbind')}
          busy={busy}
          error={error}
          onCancel={dismiss}
          onConfirm={() => void run(() => imApps.unbind(dialog.app))}
        />
      ) : null}
      {dialog?.kind === 'create' && dialog.creating && imApps.appSetup !== undefined ? (
        <CreateAppForm
          client={imApps.appSetup}
          botSlug={botSlug}
          descriptors={loaded.status === 'ready' ? loaded.setups : []}
          t={t}
          title={t(dialog.receipt ? 'imApps.resumeSetup' : 'imApps.create')}
          labels={labels}
          error={error}
          onCancel={dismiss}
          onBack={() => {
            setDialog({ ...dialog, creating: false });
          }}
          onCreated={() => run(() => imApps.bindCreated(botSlug))}
        />
      ) : dialog?.kind === 'create' ? (
        <FormDialog
          title={t(dialog.receipt ? 'imApps.resumeSetup' : 'imApps.create')}
          description={
            dialog.receipt
              ? t('imApps.resumeSetupFor', {
                  platform: externalPlatformLabel(dialog.receipt.platform, t),
                })
              : t('imApps.createHint')
          }
          labels={labels}
          submitLabel={t('imApps.next')}
          submitDisabled={botSlug === ''}
          busy={busy}
          error={error}
          onCancel={dismiss}
          onSubmit={() => {
            if (!dialog.receipt) {
              setDialog({ ...dialog, creating: true });
              return;
            }
            const resume = imApps.resumeSetup;
            if (!resume) {
              setFailed(true);
              return;
            }
            setBusy(true);
            setFailed(false);
            void resume(dialog.receipt.receiptId, botSlug)
              .then(() => setDialog({ ...dialog, creating: true }))
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        >
          {botPicker}
        </FormDialog>
      ) : null}
    </SettingsRows>
  );
}

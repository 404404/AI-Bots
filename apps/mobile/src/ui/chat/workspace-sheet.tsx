import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, SectionList, Switch, View } from 'react-native';

import {
  errorText,
  folderBrowsingUnavailable,
  type AccessScope,
  type ApprovalTemplate,
  type ApprovalTemplates,
  type AssignmentAccess,
  type BotSettings,
  type HostFolder,
  type HostFolderListing,
  type Loadable,
  type WorkspaceGrant,
  type WorkspaceOption,
} from '../../host/bot-settings';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Button } from '../primitives/button';
import { SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { CheckIcon, CloseIcon } from '../shell/icons';
import { t } from '../strings';
import { Sheet, SheetFailed, SheetHeading, SheetLoading, SheetNote } from './sheet';

type Mode = 'main' | 'browse' | 'confirm';
type Pending = { path: string; workspaceId?: string };

type MainRow =
  | { kind: 'grant'; key: string; grant: WorkspaceGrant }
  | { kind: 'note'; key: string; text: string; tone?: 'muted' | 'warning' | 'danger' }
  | { kind: 'loading'; key: string }
  | { kind: 'add'; key: string }
  | { kind: 'access'; key: string; access: AssignmentAccess }
  | { kind: 'danger'; key: string }
  | { kind: 'scope'; key: string; scope: AccessScope; selected: boolean }
  | { kind: 'template'; key: string; name: string | null; title: string; selected: boolean };

type BrowseRow =
  | { kind: 'registered'; key: string; option: WorkspaceOption }
  | { kind: 'folder'; key: string; folder: HostFolder };

const OFF = 'off';

export function templateTitle(template: Pick<ApprovalTemplate, 'name' | 'title'>): string {
  if (template.name === 'cautious') return t.autoApprovalCautious;
  if (template.name === 'get-work-done') return t.autoApprovalGetWorkDone;
  return template.title;
}

export function templateDescription(template: ApprovalTemplate): string {
  if (template.name === 'cautious') return t.autoApprovalCautiousHint;
  if (template.name === 'get-work-done') return t.autoApprovalGetWorkDoneHint;
  return template.description;
}

function RemoveButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <CloseIcon color={theme.color.muted} size={theme.type.title.line} />
    </Pressable>
  );
}

function Crumbs({
  crumbs,
  disabled,
  onOpen,
}: {
  crumbs: HostFolder[];
  disabled: boolean;
  onOpen(path: string): void;
}) {
  const theme = useDesignTheme();
  return (
    <View
      accessibilityRole="toolbar"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.x2,
        paddingHorizontal: space.x5,
        paddingVertical: space.x2,
      }}
    >
      {crumbs.map((crumb, index) => {
        const current = index === crumbs.length - 1;
        return (
          <Pressable
            key={crumb.path}
            accessibilityRole="button"
            accessibilityLabel={crumb.name}
            accessibilityState={{ selected: current, disabled }}
            disabled={disabled}
            onPress={() => onOpen(crumb.path)}
            style={({ pressed }) => ({
              paddingHorizontal: space.x4,
              paddingVertical: space.x3,
              borderRadius: radius.round,
              backgroundColor: pressed
                ? theme.layer.sheet.pressed
                : current
                  ? theme.layer.sheet.selected
                  : theme.layer.sheet.fill,
            })}
          >
            <Text variant="meta" tone={current ? 'fg' : 'muted'} numberOfLines={1}>
              {crumb.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SheetActions({ children }: { children: ReactNode }) {
  return (
    <View style={{ gap: space.x3, paddingHorizontal: space.x5, paddingTop: space.x3 }}>
      {children}
    </View>
  );
}

export function WorkspaceSheet({
  visible,
  botName,
  settings,
  grants,
  access,
  templates,
  onRetryGrants,
  onGrantsChanged,
  onAccess,
  onTemplates,
  onClose,
}: {
  visible: boolean;
  botName: string;
  settings: BotSettings | undefined;
  grants: Loadable<WorkspaceGrant[]>;
  access: Loadable<AssignmentAccess>;
  templates: Loadable<ApprovalTemplates>;
  onRetryGrants(): void;
  onGrantsChanged(): void;
  onAccess(access: AssignmentAccess): void;
  onTemplates(templates: ApprovalTemplates): void;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  const [mode, setMode] = useState<Mode>('main');
  const [listing, setListing] = useState<Loadable<HostFolderListing>>({ status: 'loading' });
  const [options, setOptions] = useState<WorkspaceOption[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const mutate = (key: string, work: () => Promise<void>, after?: () => void) => {
    if (busy !== undefined) return;
    setBusy(key);
    setError(undefined);
    void work()
      .then(
        () => after?.(),
        (cause: unknown) => setError(`${t.settingFailed} ${errorText(cause)}`),
      )
      .finally(() => setBusy(undefined));
  };

  const close = () => {
    if (busy !== undefined) return;
    onClose();
  };

  if (settings === undefined)
    return (
      <Sheet
        visible={visible}
        label={t.workspaceTitle(botName)}
        title={t.workspaceTitle(botName)}
        onClose={close}
      >
        <SheetLoading />
      </Sheet>
    );

  const granted = grants.status === 'ready' ? grants.value : [];

  const browse = (path?: string) => {
    setListing({ status: 'loading' });
    void settings.listFolders(path).then(
      (value) => setListing({ status: 'ready', value }),
      (cause: unknown) =>
        setListing({
          status: 'failed',
          error: folderBrowsingUnavailable(cause) ? t.browseUnavailable : errorText(cause),
        }),
    );
  };

  const startBrowse = () => {
    setError(undefined);
    setMode('browse');
    setOptions([]);
    void settings.loadWorkspaceOptions().then(setOptions, () => undefined);
    browse();
  };

  const choose = (path: string, workspaceId?: string) =>
    mutate('resolve', async () => {
      const resolved = await settings.resolveFolder(path);
      setPending({
        path: resolved.path,
        ...(workspaceId === undefined ? {} : { workspaceId }),
      });
      setMode('confirm');
    });

  const remove = (grant: WorkspaceGrant) =>
    mutate(
      `grant:${grant.id}`,
      async () => {
        await settings.revokeGrant(grant.id);
      },
      onGrantsChanged,
    );

  const confirmGrant = () => {
    if (pending === undefined) return;
    mutate(
      'confirm',
      async () => {
        await settings.authorizeFolder(pending.path, pending.workspaceId);
      },
      () => {
        setPending(undefined);
        setMode('main');
        onGrantsChanged();
      },
    );
  };

  const changeAccess = (key: string, work: () => Promise<AssignmentAccess>) =>
    mutate(key, async () => {
      const next = await work();
      onAccess(next);
      setConfirmDanger(false);
    });

  const chooseTemplate = (name: string | null) => {
    if (templates.status !== 'ready') return;
    const previous = templates.value;
    onTemplates({ ...previous, selected: name });
    mutate(`template:${name ?? OFF}`, async () => {
      try {
        await settings.setTemplate(name);
      } catch (cause) {
        onTemplates(previous);
        throw cause;
      }
    });
  };

  const trailingCheck = (key: string, selected: boolean) =>
    busy === key ? (
      <ActivityIndicator />
    ) : selected ? (
      <CheckIcon color={theme.color.accent} size={theme.type.title.line} />
    ) : undefined;

  const notice = (
    <>
      {busy === undefined ? null : <SheetNote>{t.workspaceWorking}</SheetNote>}
      {error === undefined ? null : <SheetNote tone="danger">{error}</SheetNote>}
    </>
  );

  if (mode === 'confirm' && pending !== undefined)
    return (
      <Sheet
        visible={visible}
        label={t.confirmGrant(botName)}
        title={t.confirmGrant(botName)}
        onClose={close}
      >
        <Text style={{ paddingHorizontal: space.x5 }}>{t.grantScope(pending.path)}</Text>
        {notice}
        <SheetActions>
          <Button
            label={t.authorize}
            tone="primary"
            on="sheet"
            busy={busy === 'confirm'}
            disabled={busy !== undefined}
            onPress={confirmGrant}
          />
          <Button
            label={t.cancel}
            on="sheet"
            disabled={busy !== undefined}
            onPress={() => {
              setPending(undefined);
              setMode('browse');
            }}
          />
        </SheetActions>
      </Sheet>
    );

  if (mode === 'browse') {
    const grantedIds = new Set(granted.map((grant) => grant.workspaceId));
    const registered = options.filter((option) => !grantedIds.has(option.id));
    const folders =
      listing.status === 'ready' ? listing.value.entries.filter((entry) => !entry.hidden) : [];
    const sections = [
      ...(registered.length === 0
        ? []
        : [
            {
              kind: 'registered' as const,
              title: t.registeredFolders,
              data: registered.map((option): BrowseRow => ({
                kind: 'registered',
                key: `option:${option.id}`,
                option,
              })),
            },
          ]),
      {
        kind: 'folders' as const,
        title: t.browseTitle,
        data: folders.map((folder): BrowseRow => ({
          kind: 'folder',
          key: `folder:${folder.path}`,
          folder,
        })),
      },
    ];
    return (
      <Sheet visible={visible} label={t.browseTitle} title={t.addFolder} onClose={close}>
        <SectionList<BrowseRow, { kind: 'registered' | 'folders'; title: string }>
          style={{ flexShrink: 1 }}
          sections={sections}
          keyExtractor={(row) => row.key}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <>
              <SheetNote>{t.browseHint}</SheetNote>
              {notice}
            </>
          }
          renderSectionHeader={({ section }) =>
            section.kind === 'registered' ? (
              <SheetHeading>{section.title}</SheetHeading>
            ) : listing.status === 'ready' ? (
              <Crumbs
                crumbs={listing.value.crumbs}
                disabled={busy !== undefined}
                onOpen={(path) => browse(path)}
              />
            ) : null
          }
          renderSectionFooter={({ section }) =>
            section.kind === 'registered' ? null : listing.status === 'loading' ? (
              <SheetLoading />
            ) : listing.status === 'failed' ? (
              <SheetNote tone="warning">{listing.error}</SheetNote>
            ) : folders.length === 0 ? (
              <SheetNote>{t.browseEmpty}</SheetNote>
            ) : listing.value.truncated ? (
              <SheetNote>{t.browseTruncated}</SheetNote>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === 'registered' ? (
              <SettingsRow
                title={item.option.title}
                detail={item.option.path}
                onPress={
                  busy === undefined ? () => choose(item.option.path, item.option.id) : undefined
                }
              />
            ) : (
              <SettingsRow
                title={item.folder.name}
                onPress={busy === undefined ? () => browse(item.folder.path) : undefined}
              />
            )
          }
        />
        <SheetActions>
          <Button
            label={t.authorizeHere}
            tone="primary"
            on="sheet"
            busy={busy === 'resolve'}
            disabled={busy !== undefined || listing.status !== 'ready'}
            onPress={() => {
              if (listing.status === 'ready') choose(listing.value.path);
            }}
          />
          <Button
            label={t.back}
            on="sheet"
            disabled={busy !== undefined}
            onPress={() => {
              setError(undefined);
              setMode('main');
            }}
          />
        </SheetActions>
      </Sheet>
    );
  }

  const folderRows: MainRow[] =
    grants.status === 'loading'
      ? [{ kind: 'loading', key: 'grants-loading' }]
      : grants.status === 'failed'
        ? [{ kind: 'note', key: 'grants-failed', text: t.workspaceFailed, tone: 'danger' }]
        : grants.value.length === 0
          ? [{ kind: 'note', key: 'grants-empty', text: t.workspaceNoFolders }]
          : grants.value.map((grant): MainRow => ({
              kind: 'grant',
              key: `grant:${grant.id}`,
              grant,
            }));

  const accessRows: MainRow[] =
    access.status === 'loading'
      ? [{ kind: 'loading', key: 'access-loading' }]
      : access.status === 'failed'
        ? [{ kind: 'note', key: 'access-failed', text: access.error, tone: 'danger' }]
        : [
            { kind: 'access', key: 'access', access: access.value },
            ...(confirmDanger ? [{ kind: 'danger', key: 'danger' } as const] : []),
            ...(access.value.mode === 'danger-full-access'
              ? [
                  {
                    kind: 'note',
                    key: 'access-on',
                    text:
                      access.value.scope === 'assignments'
                        ? t.fullAccessOnAssignments
                        : t.fullAccessOn,
                    tone: 'warning',
                  } as const,
                  ...(['chat', 'assignments'] as const).map((scope): MainRow => ({
                    kind: 'scope',
                    key: `scope:${scope}`,
                    scope,
                    selected: access.value.scope === scope,
                  })),
                ]
              : [{ kind: 'note', key: 'access-hint', text: t.fullAccessHint } as const]),
          ];

  const chosen =
    templates.status === 'ready'
      ? templates.value.templates.find((template) => template.name === templates.value.selected)
      : undefined;
  const templateRows: MainRow[] =
    templates.status === 'loading'
      ? [{ kind: 'loading', key: 'templates-loading' }]
      : templates.status === 'failed'
        ? [{ kind: 'note', key: 'templates-failed', text: templates.error, tone: 'danger' }]
        : [
            {
              kind: 'template',
              key: `template:${OFF}`,
              name: null,
              title: t.autoApprovalOff,
              selected: templates.value.selected === null,
            },
            ...templates.value.templates.map((template): MainRow => ({
              kind: 'template',
              key: `template:${template.name}`,
              name: template.name,
              title: templateTitle(template),
              selected: templates.value.selected === template.name,
            })),
            {
              kind: 'note',
              key: 'template-hint',
              text:
                chosen === undefined
                  ? t.autoApprovalHintOff
                  : t.autoApprovalHintOn(templateDescription(chosen)),
            },
          ];

  const sections = [
    {
      kind: 'folders' as const,
      title: t.workspaceFolders,
      data: [
        ...folderRows,
        ...(grants.status === 'ready' ? [{ kind: 'add', key: 'add' } as const] : []),
      ],
    },
    { kind: 'access' as const, title: '', data: accessRows },
    { kind: 'templates' as const, title: t.autoApproval, data: templateRows },
  ];

  return (
    <Sheet
      visible={visible}
      label={t.workspaceTitle(botName)}
      title={t.workspaceTitle(botName)}
      onClose={close}
    >
      <SectionList<MainRow, { kind: 'folders' | 'access' | 'templates'; title: string }>
        style={{ flexShrink: 1 }}
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={notice}
        renderSectionHeader={({ section }) =>
          section.kind === 'access' ? (
            <View style={{ height: space.x4 }} />
          ) : (
            <SheetHeading>{section.title}</SheetHeading>
          )
        }
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'loading':
              return <SheetLoading />;
            case 'note':
              return item.key === 'grants-failed' ? (
                <SheetFailed message={item.text} onRetry={onRetryGrants} />
              ) : (
                <SheetNote {...(item.tone === undefined ? {} : { tone: item.tone })}>
                  {item.text}
                </SheetNote>
              );
            case 'grant':
              return (
                <SettingsRow
                  title={item.grant.workspaceTitle}
                  detail={`${item.grant.orchestratorWrite ? t.folderCanEdit : t.folderReadOnly} · ${item.grant.workspacePath}`}
                  trailing={
                    busy === item.key ? (
                      <ActivityIndicator />
                    ) : (
                      <RemoveButton
                        label={t.removeFolder(item.grant.workspaceTitle)}
                        disabled={busy !== undefined}
                        onPress={() => remove(item.grant)}
                      />
                    )
                  }
                />
              );
            case 'add':
              return (
                <SettingsRow
                  title={t.addFolder}
                  tone="accent"
                  {...(busy === undefined ? { onPress: startBrowse } : {})}
                />
              );
            case 'access':
              return (
                <SettingsRow
                  title={t.fullAccess}
                  detail={t.fullAccessDetail}
                  trailing={
                    <Switch
                      accessibilityLabel={t.fullAccess}
                      value={item.access.mode === 'danger-full-access' || confirmDanger}
                      disabled={busy !== undefined}
                      trackColor={{ true: theme.color.danger }}
                      onValueChange={(on) => {
                        if (on) setConfirmDanger(true);
                        else if (confirmDanger) setConfirmDanger(false);
                        else
                          changeAccess('safe-access', () =>
                            settings.setAccess('workspace-write', false),
                          );
                      }}
                    />
                  }
                />
              );
            case 'danger':
              return (
                <View
                  accessibilityRole="alert"
                  style={{
                    gap: space.x3,
                    marginHorizontal: space.x5,
                    marginVertical: space.x2,
                    padding: space.x4,
                    borderRadius: radius.md,
                    backgroundColor: theme.layer.sheet.inset,
                  }}
                >
                  <Text strong>{t.fullAccessConfirmTitle}</Text>
                  <Text variant="meta">{t.fullAccessConfirmRisk}</Text>
                  <Button
                    label={t.fullAccessConfirm}
                    tone="danger"
                    on="sheet"
                    busy={busy === 'danger-access'}
                    disabled={busy !== undefined}
                    onPress={() =>
                      changeAccess('danger-access', () =>
                        settings.setAccess('danger-full-access', true),
                      )
                    }
                  />
                  <Button
                    label={t.cancel}
                    on="sheet"
                    disabled={busy !== undefined}
                    onPress={() => setConfirmDanger(false)}
                  />
                </View>
              );
            case 'scope':
              return (
                <SettingsRow
                  title={
                    item.scope === 'chat' ? t.fullAccessScopeChat : t.fullAccessScopeAssignments
                  }
                  selected={item.selected}
                  trailing={trailingCheck(item.key, item.selected)}
                  {...(busy === undefined && !item.selected
                    ? {
                        onPress: () =>
                          changeAccess(item.key, () =>
                            settings.setAccess('danger-full-access', true, item.scope),
                          ),
                      }
                    : {})}
                />
              );
            case 'template':
              return (
                <SettingsRow
                  title={item.title}
                  selected={item.selected}
                  trailing={trailingCheck(item.key, item.selected)}
                  {...(busy === undefined && !item.selected
                    ? { onPress: () => chooseTemplate(item.name) }
                    : {})}
                />
              );
          }
        }}
      />
    </Sheet>
  );
}

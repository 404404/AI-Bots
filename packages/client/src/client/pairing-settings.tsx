import { useId, useState, type ReactElement } from 'react';
import { Button, Checkbox, Input, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
import { MessagingHelp } from './messaging-help.js';
import { Modal } from './modal.js';
import { PairingTable } from './pairing-table.js';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ExternalUserRole,
  SenderAccessInput,
  SenderPolicy,
} from '../../../core/src/messaging/sender-access.js';
import type {
  PairingCapability,
  PairingRequest,
  PairingReviewInput,
} from '../../../core/src/messaging/pairing.js';
import type { BotHarnessTranslate } from './locale.js';

const capabilities = ['approve', 'reject', 'answer', 'save-rules'] as const;
const labels = {
  approve: 'pairing.approveCapability',
  reject: 'pairing.rejectCapability',
  answer: 'pairing.answerCapability',
  'save-rules': 'pairing.rulesCapability',
} as const;
export function PairingSettings({
  requests,
  receivers = [],
  roles = [],
  policy,
  senderAccess,
  busy,
  failed = false,
  refresh,
  review,
  t,
}: {
  requests: PairingRequest[];
  roles?: ExternalUserRole[];
  policy?: SenderPolicy;
  senderAccess?(input: SenderAccessInput): Promise<void>;
  receivers?: { name: string; status: 'off' | 'connecting' | 'receiving' | 'unavailable' }[];
  busy: boolean;
  failed?: boolean;
  refresh(): Promise<void>;
  review(input: PairingReviewInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [tab, setTab] = useState<'people' | 'roles' | 'requests'>(
    requests.some((request) => request.status === 'pending') ? 'requests' : 'people',
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const people = requests.filter(
    (request) =>
      request.status === 'approved' ||
      (request.status === 'unavailable' && (!!request.roleId || request.capabilities.length > 0)),
  );
  const entries =
    tab === 'people' ? people : requests.filter((request) => !people.includes(request));
  const selected = entries.find((request) => request.id === selectedId) ?? entries[0];
  const selectedRole = roles.find((role) => role.id === selectedId) ?? roles[0];
  const requestColumns: ColumnDef<PairingRequest>[] = [
    {
      id: 'name',
      accessorFn: (request) => request.actorName ?? request.actorId,
      header: t('pairing.actor'),
    },
    { id: 'app', accessorKey: 'accountName', header: t('pairing.account') },
    {
      id: 'role',
      accessorFn: (request) =>
        request.purpose === 'conversation'
          ? (roles.find((role) => role.id === request.roleId)?.name ??
            t('pairing.conversationAccess'))
          : t('pairing.management'),
      header: t('pairing.role'),
    },
    {
      id: 'status',
      accessorFn: (request) => t(`pairing.${request.status}`),
      header: t('pairing.status'),
      cell: (cell) => <Tag>{String(cell.getValue())}</Tag>,
    },
  ];
  const roleColumns: ColumnDef<ExternalUserRole>[] = [
    { id: 'name', accessorKey: 'name', header: t('pairing.roleName') },
    {
      id: 'behavior',
      accessorKey: 'behavior',
      header: t('pairing.behavior'),
      cell: (cell) => <span className="bh-pairing-policy-preview">{String(cell.getValue())}</span>,
    },
    {
      id: 'people',
      accessorFn: (role) => people.filter((person) => person.roleId === role.id).length,
      header: t('pairing.people'),
    },
  ];
  return (
    <section className="bh-im-pairing" aria-label={t('pairing.title')}>
      <div className="bh-im-actions">
        <MessagingHelp title={t('pairing.title')} text={t('pairing.hint')} t={t} />
        <span className="bh-pairing-toolbar-gap" />
        <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void refresh()}>
          {t('pairing.refresh')}
        </Button>
      </div>
      {senderAccess && policy ? (
        <div className="bh-im-actions">
          <Checkbox
            label={t('pairing.restricted')}
            checked={policy.restricted}
            disabled={busy}
            onChange={(restricted) =>
              void senderAccess({
                kind: 'policy',
                restricted,
                expectedRevision: policy.revision,
              }).catch(() => undefined)
            }
          />
          <MessagingHelp title={t('pairing.restricted')} text={t('pairing.policyLimit')} t={t} />
        </div>
      ) : null}
      {failed ? (
        <p className="bh-error" role="alert">
          {t('pairing.error')}
        </p>
      ) : null}
      {receivers.map((receiver) => (
        <p className="bh-muted bh-pairing-receiver" key={receiver.name} role="status">
          {receiver.name} · {t(`pairing.receiver.${receiver.status}`)}
        </p>
      ))}
      <SegmentedTabs
        label={t('pairing.title')}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setSelectedId(undefined);
        }}
        items={[
          {
            value: 'people',
            label: `${t('pairing.people')} (${people.length})`,
            id: `${id}-people`,
            panelId: `${id}-panel-people`,
          },
          {
            value: 'roles',
            label: `${t('pairing.roles')} (${roles.length})`,
            id: `${id}-roles`,
            panelId: `${id}-panel-roles`,
          },
          {
            value: 'requests',
            label: `${t('pairing.requests')} (${requests.filter((request) => request.status === 'pending').length})`,
            id: `${id}-requests`,
            panelId: `${id}-panel-requests`,
          },
        ]}
      />
      <div
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-${tab}`}
        className="bh-pairing-panel"
      >
        <div className="bh-im-actions">
          <strong>{t(`pairing.${tab}`)}</strong>
          <MessagingHelp
            title={t(`pairing.${tab}`)}
            text={t(
              tab === 'people'
                ? 'pairing.scope'
                : tab === 'roles'
                  ? 'pairing.policyLimit'
                  : 'pairing.hint',
            )}
            t={t}
          />
          <span className="bh-pairing-toolbar-gap" />
          {senderAccess ? (
            <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setCreating(true)}>
              {t('pairing.createRole')}
            </Button>
          ) : null}
        </div>
        <div className="bh-pairing-workspace">
          {tab === 'roles' ? (
            <PairingTable
              key="roles"
              data={roles}
              columns={roleColumns}
              selectedId={selectedRole?.id}
              select={(role) => setSelectedId(role.id)}
              label={t('pairing.roles')}
              empty={t('pairing.noRoles')}
              t={t}
            />
          ) : (
            <PairingTable
              key={tab}
              data={entries}
              columns={requestColumns}
              selectedId={selected?.id}
              select={(request) => setSelectedId(request.id)}
              label={t(`pairing.${tab}`)}
              empty={t(tab === 'people' ? 'pairing.noPeople' : 'pairing.noRequests')}
              t={t}
            />
          )}
          <aside className="bh-pairing-detail" aria-label={t('pairing.details')}>
            {tab === 'roles' ? (
              selectedRole ? (
                <RoleDetails role={selectedRole} busy={busy} change={senderAccess} t={t} />
              ) : (
                <p className="bh-muted">{t('pairing.noRoles')}</p>
              )
            ) : selected ? (
              <PairingRow
                key={`${selected.id}:${selected.revision}`}
                request={selected}
                roles={roles}
                busy={busy}
                review={review}
                t={t}
              />
            ) : (
              <p className="bh-muted">{t('pairing.selectPerson')}</p>
            )}
          </aside>
        </div>
      </div>
      {creating && senderAccess ? (
        <RoleDialog
          key={roles.map((role) => `${role.id}:${role.revision}`).join(',')}
          busy={busy}
          change={senderAccess}
          close={() => setCreating(false)}
          t={t}
        />
      ) : null}
    </section>
  );
}
function PairingRow({
  request,
  roles,
  busy,
  review,
  t,
}: {
  request: PairingRequest;
  roles: ExternalUserRole[];
  busy: boolean;
  review(input: PairingReviewInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [selected, setSelected] = useState<PairingCapability[]>([]);
  const [roleId, setRoleId] = useState('');
  const selectedRole = roles.find((role) => role.id === roleId);
  const assignedRole = roles.find((role) => role.id === request.roleId);
  const input = { id: request.id, expectedRevision: request.revision };
  return (
    <article className="bh-im-pairing-request">
      <div className="bh-im-actions">
        <strong>{request.actorName ?? t('pairing.unknownName')}</strong>
        <Tag>{t(`pairing.${request.status}`)}</Tag>
      </div>
      <dl>
        <div>
          <dt>{t('pairing.actor')}</dt>
          <dd>
            <details>
              <summary>
                <code>
                  {request.actorId.slice(0, 3)}…{request.actorId.slice(-6)}
                </code>
              </summary>
              <code>{request.actorId}</code>
            </details>
          </dd>
        </div>
        <div>
          <dt>{t('pairing.account')}</dt>
          <dd>{request.accountName}</dd>
        </div>
        <div>
          <dt>{t('pairing.reference')}</dt>
          <dd>{request.reference}</dd>
        </div>
        {request.status === 'pending' ? (
          <div>
            <dt>{t('pairing.expires')}</dt>
            <dd>
              <time dateTime={request.expiresAt}>
                {new Date(request.expiresAt).toLocaleString()}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      <MessagingHelp title={t('pairing.actor')} text={t('pairing.scope')} t={t} />
      {request.purpose === 'conversation' ? (
        <p>{assignedRole?.name ?? t('pairing.conversationAccess')}</p>
      ) : (
        <div className="bh-im-actions">
          <span>{t('pairing.management')}</span>
          <MessagingHelp
            title={t('pairing.management')}
            text={t('pairing.managementAccess')}
            t={t}
          />
        </div>
      )}
      {request.notifications?.some(
        (item) => item.key.startsWith('approved:') && item.outcome !== 'accepted',
      ) ? (
        <p role="status">{t('pairing.noticeUnconfirmed')}</p>
      ) : null}
      {request.status === 'pending' ? (
        <>
          {request.purpose === 'conversation' ? (
            <Combobox
              label={t('pairing.role')}
              toggleLabel={t('pairing.role')}
              value={roleId}
              fallbackValue=""
              disabled={busy}
              searchable={false}
              onSelect={setRoleId}
              options={[
                { value: '', label: t('pairing.selectRole') },
                ...roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                  hint: t('pairing.ordinary'),
                })),
              ]}
            />
          ) : (
            <fieldset disabled={busy} className="bh-im-pairing-capabilities">
              <legend>{t('pairing.approve')}</legend>
              {capabilities.map((capability) => (
                <Checkbox
                  key={capability}
                  label={t(labels[capability])}
                  checked={selected.includes(capability)}
                  disabled={busy}
                  onChange={(checked) =>
                    setSelected((value) =>
                      checked
                        ? [...value, capability]
                        : value.filter((item) => item !== capability),
                    )
                  }
                />
              ))}
            </fieldset>
          )}
          <div className="bh-im-actions">
            <Button
              size="sm"
              variant="primary"
              disabled={
                busy || (request.purpose === 'conversation' ? !selectedRole : selected.length === 0)
              }
              onClick={() =>
                void review(
                  request.purpose === 'conversation' && selectedRole
                    ? {
                        ...input,
                        kind: 'approve',
                        roleId: selectedRole.id,
                        expectedRoleRevision: selectedRole.revision,
                      }
                    : { ...input, kind: 'approve', capabilities: selected },
                )
              }
            >
              {t(request.purpose === 'conversation' ? 'pairing.approveRole' : 'pairing.approve')}
            </Button>
            <Button
              size="sm"
              variant="toolbar"
              disabled={busy}
              onClick={() => void review({ ...input, kind: 'reject' })}
            >
              {t('pairing.reject')}
            </Button>
          </div>
        </>
      ) : request.status === 'approved' ||
        (request.status === 'unavailable' &&
          (request.capabilities.length > 0 || !!request.roleId)) ? (
        <>
          <div className="bh-im-pairing-capabilities">
            {request.capabilities.map((capability) => (
              <Tag key={capability}>{t(labels[capability])}</Tag>
            ))}
          </div>
          <Button
            size="sm"
            variant="toolbar"
            disabled={busy}
            onClick={() => void review({ ...input, kind: 'revoke' })}
          >
            {t('pairing.revoke')}
          </Button>
        </>
      ) : null}
    </article>
  );
}

function RoleDetails({
  role,
  t,
}: {
  role: ExternalUserRole;
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <article className="bh-im-pairing-request">
      <strong>{role.name}</strong>
      <div className="bh-im-actions">
        <span>{t('pairing.behavior')}</span>
        <MessagingHelp title={t('pairing.behavior')} text={t('pairing.policyLimit')} t={t} />
      </div>
      <p className="bh-pairing-behavior">{role.behavior}</p>
      <Tag>{t('pairing.ordinary')}</Tag>
    </article>
  );
}

function RoleDialog({
  busy,
  change,
  close,
  t,
}: {
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  close(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [name, setName] = useState('');
  const [behavior, setBehavior] = useState('');
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setFailed(false);
    try {
      await change({ kind: 'create-role', name, behavior });
      close();
    } catch {
      setFailed(true);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={t('pairing.createRole')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal bh-pairing-role-modal"
      contentClassName="bh-pairing-content"
      footer={
        <div className="bh-modal-footer">
          <Button size="sm" variant="toolbar" disabled={busy} onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !name.trim() || !behavior.trim()}
            onClick={() => void submit()}
          >
            {t('pairing.createRole')}
          </Button>
        </div>
      }
    >
      <fieldset disabled={busy} className="bh-im-role-form">
        <label className="bh-im-field">
          <span>{t('pairing.roleName')}</span>
          <Input
            data-modal-autofocus
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="bh-im-field">
          <span className="bh-im-actions">
            {t('pairing.behavior')}
            <MessagingHelp title={t('pairing.behavior')} text={t('pairing.policyLimit')} t={t} />
          </span>
          <textarea
            value={behavior}
            maxLength={2000}
            onChange={(event) => setBehavior(event.target.value)}
          />
        </label>
        <div className="bh-im-actions">
          <Tag>{t('pairing.ordinary')}</Tag>
          <MessagingHelp
            title={t('pairing.createRole')}
            text={t('pairing.managementAccess')}
            t={t}
          />
        </div>
        {failed ? (
          <p className="bh-error" role="alert">
            {t('pairing.error')}
          </p>
        ) : null}
      </fieldset>
    </Modal>
  );
}

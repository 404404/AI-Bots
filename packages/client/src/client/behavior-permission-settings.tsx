import { useState, type ReactElement } from 'react';
import { Button, Checkbox, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ColumnDef } from '@tanstack/react-table';
import {
  resolveBehaviorPermissions,
  type BehaviorPermission,
  type BehaviorChoices,
  type EffectiveBehaviorPermission,
} from '../../../core/src/messaging/behavior-policy.js';
import type { ExternalPermissionGroup } from '../../../core/src/messaging/permission-groups.js';
import type { PairingRequest } from '../../../core/src/messaging/pairing.js';
import type { SenderAccessInput } from '../../../core/src/messaging/sender-access.js';
import type { BotHarnessTranslate } from './locale.js';
import { PairingTable } from './pairing-table.js';
import { Modal } from './modal.js';
import { MessagingHelp } from './messaging-help.js';

export function BehaviorResult({
  items,
  selectGroup,
  t,
}: {
  items: EffectiveBehaviorPermission[];
  selectGroup?: ((id: string) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-im-role-form">
      {items.map((item) => (
        <article key={item.id} className="bh-im-pairing-request">
          <div className="bh-im-actions">
            <strong>{item.name}</strong>
            <Tag>{t(item.effect === 'deny' ? 'pairing.deny' : 'pairing.allow')}</Tag>
            {item.conflict ? <Tag>{t('pairing.behaviorConflict')}</Tag> : null}
          </div>
          <p className="bh-pairing-behavior">{item.behavior}</p>
          <div className="bh-muted">
            r{item.revision} ·{' '}
            {item.sources.map((source) => (
              <span key={`${source.id}:${source.effect}`}>
                {selectGroup ? (
                  <Button size="sm" variant="toolbar" onClick={() => selectGroup(source.id)}>
                    {source.name}
                  </Button>
                ) : (
                  source.name
                )}{' '}
                (r{source.revision},{' '}
                {t(source.effect === 'deny' ? 'pairing.deny' : 'pairing.allow')}) ·{' '}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function BehaviorSelection({
  items,
  value,
  change,
  busy,
  t,
}: {
  items: BehaviorPermission[];
  value: BehaviorChoices;
  change(value: BehaviorChoices): void;
  busy: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const columns: ColumnDef<BehaviorPermission>[] = [
    { id: 'name', accessorKey: 'name', header: t('pairing.behaviorName') },
    ...(['allow', 'deny'] as const).map((effect) => ({
      id: effect,
      header: t(effect === 'allow' ? 'pairing.allow' : 'pairing.deny'),
      enableSorting: false,
      cell: ({ row }: { row: { original: BehaviorPermission } }) => {
        const key = effect === 'allow' ? 'behaviorAllow' : 'behaviorDeny';
        const opposite = effect === 'allow' ? 'behaviorDeny' : 'behaviorAllow';
        return (
          <Checkbox
            label={`${t(effect === 'allow' ? 'pairing.allow' : 'pairing.deny')} · ${row.original.name}`}
            checked={(value[key] ?? []).includes(row.original.id)}
            disabled={busy}
            onChange={(checked) =>
              change({
                ...value,
                [key]: checked
                  ? [...(value[key] ?? []), row.original.id]
                  : (value[key] ?? []).filter((id) => id !== row.original.id),
                ...(checked
                  ? { [opposite]: (value[opposite] ?? []).filter((id) => id !== row.original.id) }
                  : {}),
              })
            }
          />
        );
      },
    })),
  ];
  return (
    <section className="bh-im-role-form">
      <div className="bh-im-actions">
        <strong>{t('pairing.behaviorPermissions')}</strong>
        <MessagingHelp
          title={t('pairing.behaviorPermissions')}
          text={t('pairing.behaviorHelp')}
          t={t}
        />
      </div>
      <PairingTable
        data={items}
        columns={columns}
        select={() => {}}
        disabled={busy}
        label={t('pairing.behaviorPermissions')}
        empty={t('pairing.noBehaviorPermissions')}
        t={t}
      />
    </section>
  );
}

export function BehaviorPreview({
  items,
  groups,
  people,
  t,
}: {
  items: BehaviorPermission[];
  groups: ExternalPermissionGroup[];
  people: PairingRequest[];
  t: BotHarnessTranslate;
}): ReactElement {
  const results = people
    .filter((person) => person.status === 'approved' && person.purpose === 'conversation')
    .map((person) => ({
      person,
      result: resolveBehaviorPermissions(
        items,
        groups.filter(
          (group) =>
            group.available !== false &&
            group.bindingId === person.bindingId &&
            group.memberIds.includes(person.id),
        ),
      ),
    }));
  return (
    <section className="bh-im-role-form">
      <div className="bh-im-actions">
        <strong>{t('pairing.behaviorPreview')}</strong>
        <MessagingHelp
          title={t('pairing.behaviorPreview')}
          text={t('pairing.behaviorHelp')}
          t={t}
        />
      </div>
      {results.length ? (
        results.map(({ person, result }) => (
          <details key={person.id}>
            <summary>
              {person.actorName ?? person.actorId} ·{' '}
              {result.filter((item) => item.conflict).length
                ? t('pairing.behaviorConflict')
                : t('pairing.behaviorNoConflict')}
            </summary>
            {result.length ? (
              <BehaviorResult items={result} t={t} />
            ) : (
              <span className="bh-muted">{t('pairing.noBehaviorPermissions')}</span>
            )}
          </details>
        ))
      ) : (
        <span className="bh-muted">{t('pairing.behaviorNoAffectedPeople')}</span>
      )}
    </section>
  );
}

export function BehaviorPermissionsPanel({
  items,
  groups,
  people,
  busy,
  change,
  t,
}: {
  items: BehaviorPermission[];
  groups: ExternalPermissionGroup[];
  people: PairingRequest[];
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<'new' | 'edit'>();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const [failed, setFailed] = useState(false);
  const inUse =
    selected &&
    groups.some((group) =>
      [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(selected.id),
    );
  const columns: ColumnDef<BehaviorPermission>[] = [
    { id: 'name', accessorKey: 'name', header: t('pairing.behaviorName') },
    {
      id: 'behavior',
      accessorKey: 'behavior',
      header: t('pairing.behavior'),
      cell: (cell) => <span className="bh-pairing-policy-preview">{String(cell.getValue())}</span>,
    },
    { id: 'revision', accessorKey: 'revision', header: t('pairing.behaviorRevision') },
    {
      id: 'time',
      accessorFn: (item) => Date.parse(item.updatedAt),
      header: t('pairing.time'),
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <div className="bh-pairing-times">
          {(['createdAt', 'updatedAt'] as const).map((key) => (
            <span key={key} title={new Date(row.original[key]).toLocaleString()}>
              <span className="bh-muted">
                {t(key === 'createdAt' ? 'pairing.created' : 'pairing.modified')}
              </span>{' '}
              <time dateTime={row.original[key]}>
                {new Date(row.original[key]).toLocaleDateString(undefined, {
                  month: '2-digit',
                  day: '2-digit',
                })}
              </time>
            </span>
          ))}
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="bh-im-actions">
        <MessagingHelp
          title={t('pairing.behaviorPermissions')}
          text={t('pairing.behaviorHelp')}
          t={t}
        />
        <span className="bh-pairing-toolbar-gap" />
        {change ? (
          <Button size="sm" variant="toolbar" disabled={busy} onClick={() => setEditing('new')}>
            {t('pairing.createBehaviorPermission')}
          </Button>
        ) : null}
      </div>
      <div className="bh-pairing-workspace">
        <PairingTable
          data={items}
          columns={columns}
          selectedId={selected?.id}
          select={(item) => setSelectedId(item.id)}
          label={t('pairing.behaviorPermissions')}
          empty={t('pairing.noBehaviorPermissions')}
          t={t}
        />
        <aside className="bh-pairing-detail" aria-label={t('pairing.details')}>
          {selected ? (
            <>
              <strong>{selected.name}</strong>
              <p className="bh-pairing-behavior">{selected.behavior}</p>
              <div className="bh-muted">
                r{selected.revision} · {new Date(selected.updatedAt).toLocaleString()}
              </div>
              {change ? (
                <div className="bh-im-actions">
                  <Button
                    size="sm"
                    variant="toolbar"
                    disabled={busy}
                    onClick={() => setEditing('edit')}
                  >
                    {t('pairing.editBehaviorPermission')}
                  </Button>
                  <Button
                    size="sm"
                    variant="toolbar"
                    disabled={busy || !!inUse}
                    onClick={() => {
                      setFailed(false);
                      void change({
                        kind: 'delete-behavior-permission',
                        id: selected.id,
                        expectedRevision: selected.revision,
                      }).catch(() => setFailed(true));
                    }}
                  >
                    {t('pairing.deleteBehaviorPermission')}
                  </Button>
                  <MessagingHelp
                    title={t('pairing.deleteBehaviorPermission')}
                    text={t('pairing.behaviorDeleteHelp')}
                    t={t}
                  />
                </div>
              ) : null}
              <BehaviorPreview
                items={[selected]}
                groups={groups}
                people={people.filter((person) =>
                  groups.some(
                    (group) =>
                      group.memberIds.includes(person.id) &&
                      [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(
                        selected.id,
                      ),
                  ),
                )}
                t={t}
              />
            </>
          ) : (
            <span className="bh-muted">{t('pairing.noBehaviorPermissions')}</span>
          )}
          {failed ? (
            <p className="bh-error" role="alert">
              {t('pairing.error')}
            </p>
          ) : null}
        </aside>
      </div>
      {editing && change ? (
        <BehaviorPermissionDialog
          key={`${editing}:${selected?.id}:${selected?.revision}`}
          {...(editing === 'edit' && selected ? { item: selected } : {})}
          groups={groups}
          people={people}
          busy={busy}
          change={change}
          close={() => setEditing(undefined)}
          t={t}
        />
      ) : null}
    </>
  );
}

function BehaviorPermissionDialog({
  item,
  groups,
  people,
  busy,
  change,
  close,
  t,
}: {
  item?: BehaviorPermission;
  groups: ExternalPermissionGroup[];
  people: PairingRequest[];
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  close(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [name, setName] = useState(item?.name ?? '');
  const [behavior, setBehavior] = useState(item?.behavior ?? '');
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={t(item ? 'pairing.editBehaviorPermission' : 'pairing.createBehaviorPermission')}
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
            onClick={() => {
              setFailed(false);
              void change(
                item
                  ? {
                      kind: 'edit-behavior-permission',
                      id: item.id,
                      expectedRevision: item.revision,
                      name,
                      behavior,
                    }
                  : { kind: 'create-behavior-permission', name, behavior },
              )
                .then(close)
                .catch(() => setFailed(true));
            }}
          >
            {t('pairing.saveBehaviorPermission')}
          </Button>
        </div>
      }
    >
      <label className="bh-im-field">
        <span>{t('pairing.behaviorName')}</span>
        <Input
          data-modal-autofocus
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="bh-im-field">
        <span className="bh-im-actions">
          {t('pairing.behavior')}
          <MessagingHelp title={t('pairing.behavior')} text={t('pairing.behaviorHelp')} t={t} />
        </span>
        <textarea
          className="bh-im-textarea"
          value={behavior}
          maxLength={1000}
          rows={4}
          disabled={busy}
          onChange={(event) => setBehavior(event.target.value)}
        />
      </label>
      {item ? (
        <BehaviorPreview
          items={[{ ...item, name, behavior }]}
          groups={groups.filter((group) =>
            [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(item.id),
          )}
          people={people.filter((person) =>
            groups.some(
              (group) =>
                group.memberIds.includes(person.id) &&
                [...(group.behaviorAllow ?? []), ...(group.behaviorDeny ?? [])].includes(item.id),
            ),
          )}
          t={t}
        />
      ) : null}
      {failed ? (
        <p role="alert" className="bh-error">
          {t('pairing.error')}
        </p>
      ) : null}
    </Modal>
  );
}

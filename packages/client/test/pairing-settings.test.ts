// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  SegmentedTabs: ({
    items,
    value,
    onChange,
  }: {
    items: { value: string; label: string; id: string; panelId: string }[];
    value: string;
    onChange(value: string): void;
  }) =>
    createElement(
      'div',
      { role: 'tablist' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.value,
            role: 'tab',
            'aria-selected': item.value === value,
            onClick: () => onChange(item.value),
          },
          item.label,
        ),
      ),
    ),
  Checkbox: ({
    checked,
    label,
    disabled,
    onChange,
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement(
      'label',
      null,
      createElement('input', {
        type: 'checkbox',
        checked,
        disabled,
        onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
      }),
      label,
    ),
}));
vi.mock('../src/client/messaging-help.js', () => ({
  MessagingHelp: ({ title }: { title: string }) =>
    createElement('button', { 'aria-label': `Info: ${title}` }, 'ⓘ'),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
    onClose,
  }: PropsWithChildren<{ open: boolean; title: string; footer: ReactNode; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children,
          createElement('button', { onClick: onClose }, 'Close'),
          footer,
        )
      : null,
}));
vi.mock('../src/client/combobox.js', () => ({
  Combobox: ({
    label,
    value,
    options,
    onSelect,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onSelect(value: string): void;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        onChange: (event: { target: { value: string } }) => onSelect(event.target.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
import { PairingSettings } from '../src/client/pairing-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { PairingRequest } from '../../core/src/messaging/pairing.js';
const request: PairingRequest = {
  id: 'qa-request',
  reference: 'PAIRTEST',
  botSlug: 'ada',
  bindingId: 'lark-qa',
  accountName: 'QA Lark',
  actorId: 'ou_demo',
  actorName: 'Alice QA',
  conversationId: 'oc_demo',
  status: 'pending',
  capabilities: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  expiresAt: '2026-10-06T00:10:00.000Z',
  revision: 1,
  attempts: 1,
};
it('selecting a different request cannot carry over approval capabilities or review the old person', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const review = vi.fn(async () => {});
  const second = { ...request, id: 'second', actorName: 'Bob QA', actorId: 'ou_bob', revision: 7 };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request, second],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.bh-pairing-name')[1]!.click());
    expect(review).not.toHaveBeenCalled();
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approve'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(host.querySelectorAll('tr[data-selected]')).toHaveLength(1);
    expect(host.querySelector('.bh-pairing-detail')!.textContent).toContain('Bob QA');
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: second.id,
      expectedRevision: 7,
      capabilities: ['approve'],
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('role creation opens separately and retains the input when the Host refuses it', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(async () => {
    throw new Error('conflict');
  });
  const fill = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [],
          roles: [],
          policy: { restricted: false, revision: 1 },
          senderAccess: change,
          busy: false,
          refresh: async () => {},
          review: async () => {},
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.createRole'))!
        .click(),
    );
    const dialog = host.querySelector('[role=dialog]')!;
    await act(async () => {
      fill(dialog.querySelector('input')!, 'Documentation');
      fill(dialog.querySelector('textarea')!, 'Read the documentation.');
    });
    await act(async () =>
      Array.from(dialog.querySelectorAll('button'))
        .find((button) => button.textContent === zhTranslate('pairing.createRole'))!
        .click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith({
      kind: 'create-role',
      name: 'Documentation',
      behavior: 'Read the documentation.',
    });
    expect(dialog.querySelector('[role=alert]')).not.toBeNull();
    expect(dialog.querySelector('textarea')!.value).toBe('Read the documentation.');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('ordinary role review selects one role without management powers and shows failed success notices truthfully', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  const role = {
    id: 'role-id',
    botSlug: 'ada',
    name: 'Colleague',
    behavior: 'Read public docs only.',
    capabilities: [],
    revision: 3,
  };
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, purpose: 'conversation' }],
          roles: [role],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approveRole'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(host.querySelectorAll('.bh-pairing-detail input[type=checkbox]')).toHaveLength(0);
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = role.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      roleId: role.id,
      expectedRoleRevision: 3,
    });
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [
            {
              ...request,
              purpose: 'conversation',
              status: 'approved',
              roleId: role.id,
              revision: 2,
              notifications: [{ key: 'approved:2', attempts: 1, outcome: 'unconfirmed' }],
            },
          ],
          roles: [role],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
        .find((button) => button.textContent?.startsWith(zhTranslate('pairing.people')))!
        .click(),
    );
    expect(host.textContent).toContain(role.name);
    expect(host.textContent).toContain(zhTranslate('pairing.noticeUnconfirmed'));
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.revoke'),
    )!;
    await act(async () => revoke.click());
    expect(review).toHaveBeenLastCalledWith({
      kind: 'revoke',
      id: request.id,
      expectedRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('no capability is preselected; Web submits only explicit capabilities with the exact request revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approve'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>('.bh-pairing-detail input')).every(
        (input) => !input.checked,
      ),
    ).toBe(true);
    await act(async () =>
      host.querySelector<HTMLInputElement>('.bh-pairing-detail input')!.click(),
    );
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['approve'],
    });
    expect(host.textContent).toContain('ou_demo');
    expect(host.textContent).toContain('QA Lark');
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, revision: 2 }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(
      Array.from(host.querySelectorAll<HTMLInputElement>('.bh-pairing-detail input')).every(
        (input) => !input.checked,
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('approved authority lists only the granted capabilities and offers revocation with an exact revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, status: 'approved', revision: 2, capabilities: ['answer'] }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelectorAll('.bh-pairing-detail input')).toHaveLength(0);
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.revoke'),
    )!;
    await act(async () => revoke.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'revoke',
      id: request.id,
      expectedRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

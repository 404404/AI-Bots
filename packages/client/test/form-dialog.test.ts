// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});
import { FormDialog } from '../src/client/ds/form-dialog.js';

for (const presentation of ['dialog', 'embedded'] as const)
  describe(`${presentation} form submission`, () => {
    it('associates the footer submit with its own form and preserves cancellation', async () => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const submit = vi.fn();
      const cancel = vi.fn();
      try {
        await act(async () =>
          root.render(
            createElement(
              FormDialog,
              {
                title: 'Create Bot',
                presentation,
                labels: { close: 'Close', cancel: 'Back' },
                submitLabel: 'Create',
                onSubmit: submit,
                onCancel: cancel,
              },
              createElement('input', { name: 'name', defaultValue: 'Ada' }),
            ),
          ),
        );
        expect(host.querySelector('[role="dialog"]') !== null).toBe(presentation === 'dialog');
        expect(host.querySelector('[data-embedded-form]') !== null).toBe(
          presentation === 'embedded',
        );
        const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        expect(button.form).toBe(host.querySelector('form'));
        await act(async () => button.click());
        expect(submit).toHaveBeenCalledOnce();
        const back = [...host.querySelectorAll('button')].find(
          (item) => item.textContent === 'Back',
        )!;
        await act(async () => back.click());
        expect(cancel).toHaveBeenCalledOnce();
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    });
    it('blocks both footer clicks and direct form submission while busy or invalid', async () => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const submit = vi.fn();
      try {
        for (const state of [
          { busy: true, submitDisabled: false },
          { busy: false, submitDisabled: true },
        ]) {
          await act(async () =>
            root.render(
              createElement(FormDialog, {
                title: 'Create Bot',
                presentation,
                labels: { close: 'Close', cancel: 'Back' },
                submitLabel: 'Create',
                onSubmit: submit,
                onCancel: vi.fn(),
                ...state,
              }),
            ),
          );
          const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
          expect(button.disabled).toBe(true);
          await act(async () => {
            button.click();
            host.querySelector('form')!.requestSubmit();
          });
        }
        expect(submit).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    });
  });

// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  View: (props: {
    children?: ReactNode;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityValue?: { text?: string };
    importantForAccessibility?: string;
    onAccessibilityAction?(event: { nativeEvent: { actionName: string } }): void;
  }) =>
    createElement(
      'div',
      {
        role: props.accessibilityRole,
        'aria-label': props.accessibilityLabel,
        'aria-valuetext': props.accessibilityValue?.text,
        'aria-hidden': props.importantForAccessibility === 'no-hide-descendants',
        onKeyDown: (event: { key: string }) =>
          props.onAccessibilityAction?.({
            nativeEvent: { actionName: event.key === 'ArrowUp' ? 'increment' : 'decrement' },
          }),
      },
      props.children,
    ),
}));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
  Text: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  SingleChoiceSegmentedButtonRow: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'segmented-row' }, children),
  SegmentedButton: Object.assign(
    (props: { selected: boolean; onClick(): void; children: ReactNode }) =>
      createElement(
        'button',
        { 'data-testid': 'segment', 'aria-pressed': props.selected, onClick: props.onClick },
        props.children,
      ),
    { Label: ({ children }: { children: ReactNode }) => children },
  ),
  Slider: (props: { value: number; onValueChange(value: number): void }) =>
    createElement('input', {
      'data-testid': 'native-slider',
      value: props.value,
      onChange: (event: { target: { value: string } }) =>
        props.onValueChange(Number(event.target.value)),
    }),
  RadioButton: (props: { selected: boolean }) =>
    createElement('i', { 'data-testid': 'native-radio', 'data-selected': props.selected }),
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));

import { PercentageSlider } from '../src/ui/primitives/percentage-slider.android';
import { RadioMark } from '../src/ui/primitives/radio-mark.android';
import { Segmented } from '../src/ui/primitives/segmented.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it('renders Segmented as Material segmented buttons and only reports a new choice', async () => {
  const changed = vi.fn();
  function Period() {
    const [value, setValue] = useState<'day' | 'week'>('day');
    return (
      <Segmented
        label="Period"
        value={value}
        options={[
          { value: 'day', label: 'Today' },
          { value: 'week', label: '7 days' },
        ]}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  const view = await mount(<Period />);
  expect(view.querySelector('[role="radiogroup"][aria-label="Period"]')).not.toBeNull();
  const [today, week] = [...view.querySelectorAll<HTMLButtonElement>('[data-testid="segment"]')];
  expect(today!.getAttribute('aria-pressed')).toBe('true');
  await act(async () => today!.click());
  expect(changed).not.toHaveBeenCalled();
  await act(async () => week!.click());
  expect(changed.mock.calls).toEqual([['week']]);
  expect(week!.getAttribute('aria-pressed')).toBe('true');
});

it('drives PercentageSlider from the native slider and from accessibility steps', async () => {
  const changed = vi.fn();
  function Dim() {
    const [value, setValue] = useState(40);
    return (
      <PercentageSlider
        label="Dim"
        value={value}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  const view = await mount(<Dim />);
  const control = view.querySelector<HTMLElement>('[role="adjustable"][aria-label="Dim"]')!;
  expect(control.getAttribute('aria-valuetext')).toBe('40%');
  await act(async () =>
    control.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })),
  );
  expect(control.getAttribute('aria-valuetext')).toBe('45%');
  expect(
    view.querySelector('[data-testid="native-slider"]')!.closest('[aria-hidden="true"]'),
  ).not.toBeNull();
  expect(changed.mock.calls).toEqual([[45]]);
});

it('hides the decorative Material radio from accessibility', async () => {
  const view = await mount(<RadioMark selected />);
  const radio = view.querySelector('[data-testid="native-radio"]')!;
  expect(radio.getAttribute('data-selected')).toBe('true');
  expect(radio.closest('[aria-hidden="true"]')).not.toBeNull();
});

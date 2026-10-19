// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => {
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const SegmentedButton = ({
    selected,
    onClick,
    children,
  }: {
    selected: boolean;
    onClick(): void;
    children: ReactNode;
  }) => createElement('button', { 'aria-pressed': String(selected), onClick }, children);
  SegmentedButton.Label = pass;
  return { Host: pass, SingleChoiceSegmentedButtonRow: pass, SegmentedButton, Text: pass };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxWidth: () => ({}) }));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children?: ReactNode }) => children ?? null,
  Picker: ({
    selection,
    onSelectionChange,
    children,
  }: {
    selection: string;
    onSelectionChange(value: string): void;
    children: ReactNode;
  }) =>
    createElement(
      'select',
      {
        value: selection,
        onChange: (event: { target: { value: string } }) => onSelectionChange(event.target.value),
      },
      children,
    ),
  Text: ({ children, modifiers }: { children: ReactNode; modifiers: { tag: string }[] }) =>
    createElement('option', { value: modifiers[0]!.tag }, children),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: () => ({}),
  pickerStyle: () => ({}),
  tag: (tag: string) => ({ tag }),
}));

import { Segmented as AndroidSegmented } from '../src/ui/primitives/segmented.android';
import { Segmented as IosSegmented } from '../src/ui/primitives/segmented.ios';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

describe('native segmented control', () => {
  it('uses Material 3 segmented buttons on Android and reports only a new choice', () => {
    const onChange = vi.fn();
    const view = render(
      createElement(AndroidSegmented, { label: 'Preview', options, value: 'light', onChange }),
    );
    const buttons = [...view.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    act(() => buttons[0]!.click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => buttons[1]!.click());
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('uses a SwiftUI segmented picker on iOS with one tagged segment per option', () => {
    const view = render(
      createElement(IosSegmented, { label: 'Preview', options, value: 'dark', onChange: vi.fn() }),
    );
    const segments = [...view.querySelectorAll('option')];
    expect(segments.map((segment) => [segment.value, segment.textContent])).toEqual([
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]);
  });
});

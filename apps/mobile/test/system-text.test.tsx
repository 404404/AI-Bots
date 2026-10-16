// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ os: 'ios', scale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return device.os;
    },
  },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: device.scale }),
  Text: ({ style, allowFontScaling, children }: Record<string, unknown>) => (
    <span data-metrics={JSON.stringify(style)} data-native-scaling={String(allowFontScaling)}>
      {children as string}
    </span>
  ),
  TextInput: ({ style, allowFontScaling, value, onChangeText }: Record<string, unknown>) => (
    <textarea
      data-metrics={JSON.stringify(style)}
      data-native-scaling={String(allowFontScaling)}
      value={value as string}
      onChange={(event) => (onChangeText as (text: string) => void)(event.target.value)}
    />
  ),
}));

import { Text, TextInput } from '../src/ui/primitives/system-text';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  device.os = 'ios';
  device.scale = 1;
});
function render(node: React.ReactNode) {
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(node));
  return host!;
}

describe('system text size', () => {
  it('updates final overridden metrics at live maximum and minimum sizes without double scaling', () => {
    let initial: HTMLSpanElement | undefined;
    for (const scale of [1, 3.571, 0.823, 1]) {
      device.scale = scale;
      const span = render(
        <Text style={[{ fontSize: 17, lineHeight: 22 }, { fontSize: 20 }]}>Launch</Text>,
      ).querySelector('span')!;
      initial ??= span;
      expect(span).toBe(initial);
      expect(JSON.parse(span.dataset.metrics!)).toEqual({
        fontSize: 20 * scale,
        lineHeight: 22 * scale,
      });
      expect(span.dataset.nativeScaling).toBe('false');
    }
  });

  it('scales legacy root labels and default inputs without forcing nested font sizes', () => {
    device.scale = 2;
    const host = render(
      <>
        <Text>Paste link</Text>
        <TextInput value="draft" />
      </>,
    );
    expect(JSON.parse(host.querySelector('span')!.dataset.metrics!)).toEqual({ fontSize: 34 });
    expect(JSON.parse(host.querySelector('textarea')!.dataset.metrics!)).toEqual({ fontSize: 34 });
  });

  it('inherits an explicit ancestor maximum while zero opts back into the system size', () => {
    device.scale = 3.571;
    const spans = render(
      <Text maxFontSizeMultiplier={2} style={{ fontSize: 17 }}>
        <Text style={{ fontSize: 10 }}>Inherited</Text>
        <Text maxFontSizeMultiplier={0} style={{ fontSize: 12 }}>
          Unbounded
        </Text>
      </Text>,
    ).querySelectorAll('span');
    expect(JSON.parse(spans[1]!.dataset.metrics!)).toEqual({ fontSize: 20 });
    expect(JSON.parse(spans[2]!.dataset.metrics!)).toEqual({ fontSize: 12 * device.scale });
  });

  it('leaves Android nonlinear scaling to the native view', () => {
    device.os = 'android';
    device.scale = 2;
    const span = render(<Text style={{ fontSize: 17, lineHeight: 22 }}>Launch</Text>).querySelector(
      'span',
    )!;
    expect(JSON.parse(span.dataset.metrics!)).toEqual({ fontSize: 17, lineHeight: 22 });
    expect(span.dataset.nativeScaling).toBe('undefined');
  });

  it('keeps the input node, draft and focus through a live size change', () => {
    function Draft({ revision }: { revision: number }) {
      const [draft, setDraft] = useState('你好 Ocean');
      return (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            style={{ fontSize: 17, lineHeight: 22 }}
          />
          {revision}
        </>
      );
    }
    const input = render(<Draft revision={0} />).querySelector('textarea')!;
    input.focus();
    input.setSelectionRange(3, 8);
    device.scale = 3.571;
    render(<Draft revision={1} />);
    expect(host!.querySelector('textarea')).toBe(input);
    expect(input.value).toBe('你好 Ocean');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(8);
    expect(JSON.parse(input.dataset.metrics!)).toEqual({
      fontSize: 17 * device.scale,
      lineHeight: 22 * device.scale,
    });
  });

  it('keeps decorative initials unscaled and nested text metrics inherited', () => {
    device.scale = 3.571;
    const nodes = render(
      <>
        <Text allowFontScaling={false} style={{ fontSize: 17 }}>
          H
        </Text>
        <Text style={{ fontSize: 20 }}>
          <Text>nested</Text>
        </Text>
      </>,
    ).querySelectorAll('span');
    expect(JSON.parse(nodes[0]!.dataset.metrics!)).toEqual({ fontSize: 17 });
    expect(JSON.parse(nodes[1]!.dataset.metrics!)).toEqual({ fontSize: 20 * device.scale });
    expect(nodes[2]!.dataset.metrics).toBeUndefined();
  });
});

import { createElement } from 'react';

import type { FullClientViewProps } from './full-client-view';

export function FullClientView({ source, onLoaded }: FullClientViewProps) {
  return createElement('iframe', {
    src: source.uri,
    title: 'DeepSeekBot',
    onLoad: onLoaded,
    style: { flex: 1, border: 0, width: '100%', height: '100%' },
  });
}

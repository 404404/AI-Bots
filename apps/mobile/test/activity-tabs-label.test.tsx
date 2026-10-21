import { expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('./react-native-shim'));
import { tabLabelFit } from '../src/ui/shell/tab-label-fit';
import { navigationBar } from '../src/ui/design/tokens';

it('keeps Android Activity tab labels on one line and shrinks them at large text', () => {
  expect(tabLabelFit('android')).toEqual({
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: navigationBar.labelMinScale,
  });
});

it('leaves iOS Activity tab labels free to wrap', () => {
  expect(tabLabelFit('ios')).toEqual({});
});

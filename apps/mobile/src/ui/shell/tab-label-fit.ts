import { Platform } from 'react-native';
import { navigationBar } from '../design/tokens';

export function tabLabelFit(os: string = Platform.OS) {
  return os === 'android'
    ? {
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        minimumFontScale: navigationBar.labelMinScale,
      }
    : {};
}

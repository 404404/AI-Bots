export interface DesktopZoomThemeProvenance {
  adapterVersion: number;
  sourceVersion: string;
  clientBefore: string;
  clientAfter: string;
  hostBefore: string;
  sourceModified: boolean;
  platforms: string[];
  changes: string[];
}
export function preparePackagedDesktopZoomTheme(options: {
  source: string;
  target: string;
}): DesktopZoomThemeProvenance;

import {
  APPEARANCE_KEY,
  APPEARANCE_PRIMARY,
  Appearance,
  type AppearanceSnapshot,
} from './appearance.js';
import { NATIVE_LIGHT, NATIVE_DARK } from './appearance-native-tokens.js';
export const APPEARANCE_CLASS = 'bh-appearance-scope';
export function appearanceCss(snapshot: AppearanceSnapshot): string {
  const { config, mode } = snapshot;
  const selected = config.modes[mode];
  const primary = selected.primary ?? APPEARANCE_PRIMARY[selected.preset][mode];
  const tokens: Record<string, string> = {
    ...NATIVE_LIGHT,
    ...(mode === 'dark' ? NATIVE_DARK : {}),
  };
  tokens['--dsw-alias-state-business-primary'] = primary;
  tokens['--dsw-alias-state-business-secondary'] =
    `color-mix(in srgb, ${primary} 45%, transparent)`;
  tokens['--dsw-alias-state-business-tertiary'] = `color-mix(in srgb, ${primary} 14%, transparent)`;
  tokens['--dsw-specific-sidebar-nav-item-active'] =
    `color-mix(in srgb, ${primary} 14%, transparent)`;
  return `.bh-root,.bh-workspace-mount[data-workspace-enabled],.${APPEARANCE_CLASS},[data-bh-appearance-owned]{color:var(--dsw-alias-label-primary);color-scheme:${mode};${Object.entries(
    tokens,
  )
    .map(([k, v]) => `${k}:${v}`)
    .join(
      ';',
    )}}:root [data-bh-appearance-owned][data-menu-material],:root .${APPEARANCE_CLASS}[data-menu-material],:root .${APPEARANCE_CLASS} [data-menu-material]{--dsw-elevation-stroke-color:var(--dsw-alias-border-${mode === 'dark' ? 'l3' : 'l4'})}`;
}

export function mountAppearance(owner: Appearance): () => void {
  const style = document.createElement('style');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/appearance';
  const update = () => {
    style.textContent = appearanceCss(owner.getSnapshot());
    style.dataset.bhAppearance = owner.getSnapshot().mode;
  };
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) owner.refresh();
  };
  update();
  document.head.appendChild(style);
  const off = owner.subscribe(update);
  media.addEventListener('change', owner.refresh);
  window.addEventListener('storage', onStorage);
  return () => {
    off();
    style.remove();
    media.removeEventListener('change', owner.refresh);
    window.removeEventListener('storage', onStorage);
  };
}

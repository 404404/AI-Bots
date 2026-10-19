import type { Wallpaper } from './wallpaper.js';
import { wallpaperPlacement } from './wallpaper-store.js';
export function mountWallpaper(owner: Wallpaper): () => void {
  const layer = document.createElement('div');
  layer.dataset.bhWallpaper = '';
  layer.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  layer.append(image);
  let frame: HTMLElement | undefined;
  const style = document.createElement('style');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/wallpaper';
  style.textContent = `
:root .bh-workspace-mount[data-workspace-enabled][data-wallpaper-active] { position:relative; isolation:isolate; }
:root [data-bh-wallpaper] { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:-1; }
:root [data-bh-wallpaper] img { position:absolute; max-width:none; max-height:none; }
:root .bh-workspace-mount[data-wallpaper-active] .bh-dock[data-workspace-dock],
:root .bh-workspace-mount[data-wallpaper-active] .bh-dock[data-workspace-dock] .dv-dockview,
:root .bh-workspace-mount[data-wallpaper-active] .bh-channel-session-divider,
:root .bh-workspace-mount[data-wallpaper-active] .bh-message-member-divider { background:transparent; }
:root .bh-workspace-mount[data-wallpaper-active] .dv-tabs-and-actions-container { border-bottom-color:transparent; }
:root .bh-workspace-mount[data-wallpaper-active] > .bh-workspace-chrome { background:var(--bh-global-body-fill); backdrop-filter:blur(var(--bh-global-body-blur)); }
`;
  document.head.append(style);
  const resize = new ResizeObserver(() => paint());
  const paint = () => {
    const current = owner.getSnapshot().current;
    const next = current
      ? (document.querySelector<HTMLElement>('.bh-workspace-mount[data-workspace-enabled]') ??
        undefined)
      : undefined;
    if (frame !== next) {
      frame?.removeAttribute('data-wallpaper-active');
      resize.disconnect();
      layer.remove();
      frame = next;
      if (frame) {
        frame.setAttribute('data-wallpaper-active', '');
        frame.prepend(layer);
        resize.observe(frame);
      }
    }
    if (!frame || !current) return;
    if (image.src !== current.url) image.src = current.url;
    const box = frame.getBoundingClientRect();
    const placement = wallpaperPlacement(
      current.width,
      current.height,
      box.width,
      box.height,
      current.crop,
    );
    for (const [key, value] of Object.entries(placement))
      image.style.setProperty(key, `${value}px`);
  };
  const observer = new MutationObserver(paint);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-workspace-enabled'],
  });
  const off = owner.subscribe(paint);
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('botharness-wallpaper')
      : undefined;
  let revision = owner.getSnapshot().revision;
  const broadcast = owner.subscribe(() => {
    const next = owner.getSnapshot().revision;
    if (next !== revision) {
      revision = next;
      channel?.postMessage({ changed: true });
    }
  });
  const refresh = () => {
    void owner.refresh().catch(() => {});
  };
  if (channel) channel.onmessage = refresh;
  window.addEventListener('focus', refresh);
  refresh();
  paint();
  return () => {
    off();
    broadcast();
    observer.disconnect();
    resize.disconnect();
    window.removeEventListener('focus', refresh);
    channel?.close();
    frame?.removeAttribute('data-wallpaper-active');
    layer.remove();
    style.remove();
    owner.dispose();
  };
}

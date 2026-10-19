# DeepSeekBot image wallpaper (T5)

## Sub-features

- Local image upload, drag/zoom preview, cancellation, recrop and removal.
- One continuous sidebar/panel layer, cover geometry across resizing, no input interception and no native DSH wallpaper.
- Original bytes and crop survive deletion of the source and refresh; light/dark modes share the media.
- Decode/storage failures preserve the accepted image; targeted CLI uses the same Client owner.

## How to get to it (user POV)

Bot mode → Bot settings → Appearance → Wallpaper. Upload an image up to 20 MB, drag its preview and adjust Zoom, then choose Use. Adjust crop reuses the stored original; Remove wallpaper returns to the existing theme.

## Driving it with verify-app

Launch and doctor a task-owned Host, then run:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-image-wallpaper.mjs
```

The journey uploads a generated PNG through the real file input, cancels and commits previews, checks original IndexedDB bytes, deletes the source, reloads, resizes, changes theme, injects a quota failure and tries corrupt media. It calls the built CLI to import/crop/remove, checks unrelated preferences, then exits Bot mode. Screenshots, ARIA and sanitized proof remain in its unique attempt directory. `--baseline` captures the previous settings/workspace on a separate base Host.

Desktop qualification requires a task-owned official application and user-data directory. Verify native upload and recrop, restart that same application directory into a different isolated linked Host Profile, compare the saved original/crop and confirm Web storage remains independent. This is a native different-Host restart, not an interactive connection-switch test.

## Gotchas

- Use the rendered button name **Use**, not a longer invented name. The file input is **Upload image or video**.
- A UI upload is not committed until Use. Failed writes must keep the old record and URL; do not mistake a preview for accepted storage.
- The media revision is independent of the appearance preference revision. Reload changes the transient Client id; rediscover and select the right Client before CLI writes.
- Pixel content is under translucent panels only when their materials allow it. The wallpaper layer itself never applies opacity to messages or controls.
- Video is covered by [video-wallpaper.md](video-wallpaper.md); aggregate reset/recovery, Windows native and Human QA are separate gates.

Zoom regression: `node scripts/check-wallpaper-zoom.mjs` bundles the actual wallpaper layer into a Chromium fixture and checks full coverage and stable screen-space crop at all 17 desktop zoom levels in wide and narrow viewports. `--baseline` runs the current `origin/main` layer and retains a failure screenshot when it reproduces. This fixture does not qualify native window controls or media codecs; the mount regression separately covers video/poster geometry and resource identity. In Desktop, reuse the existing isolated Profile, import a generated grid through `wallpaper-import`, change zoom through `window-zoom-set`, then compare the native window before/after at the same size. Preserve and restore any existing local media and preferences.

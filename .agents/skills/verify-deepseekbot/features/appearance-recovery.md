# DeepSeekBot appearance recovery (T7)

## Sub-features

- Clear only the current mode's entire functional Panel override map, preserving globals, other mode, media and layout.
- Readable global recovery controls and an explicit full-scope confirmation; cancellation changes nothing.
- Preference failure preserves both stores; media failure reports committed defaults plus retained media and allows retry.
- Full image/video reset releases accepted and preview resources, including an uncommitted preview with no saved wallpaper.
- Targeted CLI confirmation/revision semantics, independent Client isolation, restart and native DSH isolation.

## How to get to it (user POV)

Bot mode → Bot settings → Appearance → Appearance recovery. Clear all Panel overrides in this mode acts immediately on the displayed mode. Restore all default appearance opens a scope confirmation before resetting both modes and shared wallpaper. Partial cleanup shows an explicit retry message.

## Driving it with verify-app

Launch and doctor a task-owned Host. The generated image/video fixture requires `ffmpeg` with `libvpx-vp9`:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-appearance-recovery.mjs
```

The journey creates one task Bot, opens Messages and nested Memory, seeds two different palettes/Primary values and parent/child overrides, and verifies clear, confirmation cancellation, rejected preference writes, failed media deletion and retry. It resets image/video and active previews, checks CLI confirmation and unknown targets, a separate browser-context Client, native DSH attributes, layout/business state, reload and reentry. Screenshots, ARIA, console output and bounded proof remain private until selected sanitized evidence is published. `--baseline` uses the separate T6 Host.

Native macOS uses a task-owned official Desktop and application directory. Perform both recovery scopes, confirmation cancellation, media cleanup failure/retry, image and video reset with an active crop preview. Compare default configuration, no media record, layout and DSH attributes. Flush the task app's storage and restart the same directory; defaults and absent media must persist. Keep credentials and original media bytes private.

## Gotchas

- Full recovery deliberately spans two existing stores: a partial media failure is not success and does not roll back another writer.
- Wallpaper removal advances the preview resource generation even when the accepted store was already empty.
- Layout is byte-for-byte unchanged during recovery. Dock reload can reorder JSON keys and round leaf sizes by less than one pixel; compare topology/fields and bounded geometry after reload rather than raw serialized text.
- Current-mode clear is not a list of per-Panel editors; individual edits remain Header context-menu-only.
- Human QA and Windows native are separate gates; this journey is not a substitute for earlier slices' individual runtime proofs.

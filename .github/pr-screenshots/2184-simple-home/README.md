# Home #2184 — macOS Desktop evidence

Captured in an isolated synthetic Profile on official DSH Desktop 0.2.1-rc.2. All interaction and captures used native macOS accessibility/mouse/keyboard. No browser automation, DOM injection, or browser screenshots.

## Observable results

- Wide Home: shared composer and four draft-only starters; below it only Token history and Bot activity, in two borderless solid-color cards. TanStack Charts 1.1.0 renders real Host usage.
- Narrow native window/Home: cards stack; ranges remain operable and Bot names truncate. Below the existing Dock breakpoint, the existing compact chat shell remains in control; this change does not replace that shell.
- Light and dark captures show the final removal of the redundant date/timezone summary, overall total, daily subtitle and Details disclosure. Date-axis endpoints and partial/error notices remain.
- Starter prompt fills the existing Home draft. A real synthetic Home prompt returned `Home 2184 ready.` in the original Tob DM. A second Bot returned `Second Bot ready.`. Canonical week read-back after both replies: 212,620 tokens. Dashboard reads themselves do not call a model.
- Bot rows select the existing DM and reveal Messages when hidden. No duplicate DM was created.
- Home name opens the existing Messaging setting; `Home QA` was saved and restored. The compact trigger's tooltip is directly below it. Default Chinese Tob is 托布 and its uncustomized avatar follows the selected system icon.
- Home hide/reopen preserves the unsent draft, surrounding column width, row height and the Messages Session split (70%). The before/after-toggle images show the same geometry. Native testing found and fixed another edge: resize a column while Messages is hidden, then reopen Messages; the remembered height no longer overwrites that new width.
- Desktop restart retained the test Profile's selected Tob DM, Home draft, global layout and Session split. Model-ready Home has no redundant Configure button.

## Evidence boundaries

`before-wide.png` is the actual base Desktop before these changes (English, default identity, before the two test replies). After images are Chinese after name/icon editing and genuine model activity. They demonstrate the same entry and its replacement, but are not pixel-identical fixture pairs. Capture dimensions differ after native window resizing.

Empty usage was observed on the isolated Profile before generating usage. Partial/error, stale/deleted activity, model-setup cancellation and draft migration have focused automated coverage; the final native pass does **not** claim injected partial/error data or a model-not-ready cancellation journey. Custom/disabled shortcut persistence is covered by existing source contracts; the native pass exercised the default Home/Messages shortcuts. These remain explicit native acceptance gaps for #2184.

Screenshots contain only synthetic names/prompts. No provider keys, login URLs, private conversations or raw Profile data are included. This evidence is not old/new DSH final-package installation proof, Human approval, merge permission or release qualification.

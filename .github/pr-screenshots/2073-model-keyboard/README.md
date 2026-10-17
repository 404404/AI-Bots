# PR 2073 native evidence

Reviewed PR head: `e1c0de9637004394b9e8e76e7a0adefba079b050`; base `be4a35da8d144b3ca9a7a29121a077a543ef3893`. Final Android runtime code: `c7dc11fddfde5432c597671cce17422fe4283b93`; the later PR commit adds rules and evidence. Android 16 development client, Expo SDK 58, keyboard-controller 1.22.7; portrait 1220×2712 at density 3.25. These JavaScript changes use the existing rebuilt Material/Expo UI native client. iOS still needs a rebuild and runtime checks.

## Comparisons

- `before-model-entry` / `after-model-entry`: same selected disposable QA Host, dark, font 1, Settings root. Before is source `a871e0f752c2c169c98454bfe2295633b8a4a481`; After is `9cfb8db5bfa234a92b0cb4b5a6bc05def1a0bd2a`, whose model UI is unchanged at the reviewed head. The new model entry replaces its prior absence.
- `before-bot-model` / `after-bot-model`: same QA Bot, global inheritance, shared preset fixtures, sheet detent, dark/font 1. Before is the old combined chooser at `a871e0f752c2c169c98454bfe2295633b8a4a481`; After is the separate model plan summary at `9cfb8db5bfa234a92b0cb4b5a6bc05def1a0bd2a`, unchanged at the reviewed head. The baseline was temporarily loaded only in the reserved QA checkout, then restored.
- `keyboard-before-dark-1` / `keyboard-after-dark-1`: same global model and empty preset field, full soft IME, dark/font 1. Before is `1acc8d060`; After is `1862d7a9e76541919eef4c297a70a1e233e78302`, whose form layout is unchanged at the final head. These crops start below the status bar and end at the actual IME top (y1457); they exclude clipboard suggestions. Before hides the field/action; After scrolls both above the IME. The viewport difference is the automatic focus scroll being tested.
- The other five `keyboard-after-*` images and `keyboard-matrix.json` cover light/dark × font 1/1.3/2 on that same form. They are current-layout checks, not six matched baseline pairs.

Other screenshots show real native model search, Bot plan/inheritance, and fresh Activity-count defaults. They are supplementary states, not mockups. Status bars are cropped; unrelated reference-app attachments, raw XML, credentials, Host URLs and private Profiles are excluded.

## Exercised behavior

- Global model write and native preset creation/editing used an isolated writable Host; independent Bot plans stayed unchanged. The normal AX Host correctly refused its launch-Patch-owned global model. No model request was sent for these settings checks.
- `model-native-bot.jsonl`: native save-as-preset retained Assignment policy/notes; preset apply, default change, allowlist add/remove, Orchestrator preservation, and return to global inheritance all passed. `model-cli-live.json` separately proves the existing Host RPC/online CLI retains full Assignment policy.
- `count-fresh-default.json`: first four actionable categories on, mentions/replies and ordinary unread off, using a temporarily moved single preference file. The original preference bytes were restored.
- `keyboard-matrix.json` and `keyboard-pair.json`: real soft-keyboard clearance for the preset field/action and pairing field/action.
- `keyboard-more.json`: Host name, routine title and multiline instruction field clearance; chat composer motion has 13 intermediate positions in the 30fps pixel check. This is not a 120 FPS benchmark.
- `keyboard-activity-answer.json`, `keyboard-inbox-answer.json`, `keyboard-home-search.json` and `keyboard-activity-search.json`: native inline/dedicated answer fields, submit controls, and both searches pass IME clearance. The pending QA question was not answered.
- `keyboard-group-rename.json`: native group rename field and Save remain above the real keyboard; no group mutation was submitted.
- `keyboard-expanded-draft.json` and `keyboard-draft-retention.json`: full-screen editor and Done remain visible; typed content survives closing/reopening and the task draft was cleared without sending. Frame comparisons allow one physical pixel of native rounding at the IME edge.
- `keyboard-original-speed.mp4`: original speed, cropped status bar, no speed change or synthetic frames.

## Limits and next native checks

iOS native rebuild/runtime, TalkBack, push delivery and Release 120 FPS are unrun. The logical mobile suite passed 562 tests with 8 skipped; source tests do not establish native geometry. Required CI checks passed at the reviewed PR head, with skipped checks retaining their skip status.

Remote Browser/Computer input, embedded WebView input and repeated focus changes still need their own native end-to-end qualification; success is not inferred from another form. Repeat failed-save/retry and long caret movement, and default/intermediate/maximum text in light/dark on iOS through the shared Mac queue. Open the relevant form and run `scripts/e2e-mobile-android-interactions.mjs --mode form-keyboard --title <field label> --action <following action label>` with the reserved Windows lane arguments for additional Android geometry checks.

The previously accepted Material settings and navigation evidence remains at commits `7361385a78172629b880c0b8c9e7aae31bcc1ac8` and the existing `2078-navigation-island` directory. Their historical native results are not relabeled as final-head checks. Newly changed interaction still requires Human QA before merge.

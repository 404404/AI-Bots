# Android paragraph bounds during parent relayout

Issue [#2188](https://github.com/BotHarness/DeepSeekBot/issues/2188) originally appeared after sequential font/theme changes. The minimized phone reproduction cold-opens the same committed, 19,221-character paragraph without changing either setting. The canonical message remains complete while the bubble is blank.

## Observed boundary

The original Arena control failed two of three cold opens; its parser-reuse arm passed all three. A standalone pre-reuse main Release also reproduced the failure. These are small reproduction samples, not evidence that parser reuse repairs native layout.

Package-scoped Android view snapshots distinguish the states:

```text
Blank:   StreamRevealView 835 × 69420 → TextView 0 × 0
Visible: StreamRevealView 835 × 69420 → TextView 835 × 69420
```

`StreamRevealView` extends the SDK 58 `ExpoView`, which inherits Android `LinearLayout`. Its inherited parent layout can replace externally assigned child bounds with the child's still-zero measured size. React Native owns those child bounds. Its own [ReactViewGroup implementation](https://github.com/react/react-native/blob/v0.88.0/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/ReactViewGroup.kt) leaves child layout to UIManager.

The fix makes `StreamRevealView.onLayout` a no-op. It does not assign replacement sizes, reparse messages, flush playback, or add layout work on animation frames.

## Regression seam

`StreamRevealViewTest` instantiates the actual container and a native `TextView`, assigns the child bounds as React Native does, then lays out and relays out the parent. Before the fix, the first parent layout changes `Rect(13,17–848,69437)` to `Rect(0,0–0,0)`. After the fix, the bounds survive both parent layouts. All ten native module tests pass, including the existing Unicode, span budget, reduced-motion and cleanup cases.

This regression checks the Android parent/child layout boundary. It does not simulate Fabric scheduling, hardware drawing, text selection or TalkBack.

## Separate tail-only observation

[#2190](https://github.com/BotHarness/DeepSeekBot/issues/2190) remains distinct: its original rich-Markdown reply was complete in the Host but its final paragraph was absent until a cold reopen. Four new rich replies on the previously installed normal build displayed the final marker; three had an automated independent canonical reread of exactly 4,504 characters. The first run's early UI Automator idle failure is a capture failure, not a message failure. No failing tail-only native tree was captured, so this change does not claim its cause or close that issue.

Native phone results and APK provenance are recorded in the PR. A fresh Android build is required; JavaScript reload or OTA alone cannot apply this fix. No new FPS, scrolling, iOS, selection or TalkBack qualification follows from it.

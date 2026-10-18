# Home personalization and layout evidence

Source head: `30f8953566a4fcd08186bf9feb9d779f8277633c`. Base: `be3f833d3f46cb278a8eaea1ceef32d743a446c5` (#2158).

## Capture provenance

- `home-before/after`, `settings-before/after`, `long-expanded/folded`: real isolated Web Client captures taken before the user requested Desktop-only testing. The after source is `4960ff9be41e4bf8e90e4513daae690c5881bc93`; the subsequent source change only narrows username padding and anchors its tooltip below the button. No browser automation was used after the Desktop-only instruction.
- `desktop-home-before`: native macOS Desktop at `4960ff9`; `desktop-home-after`: native macOS Desktop at the source head above. Same 2940 × 1846 capture, showing the tighter username spacing. Draft state differs because Desktop was restarted; restart draft persistence is not claimed.
- `desktop-home-restored`, `desktop-settings`: native Desktop at `4960ff9`, showing Home returned through its shortcut with the unsent draft retained, and the opt-in folding setting. Synthetic isolated Profile only; no personal Profile data copied.

## Verified

- Focused source suite: 17 files / 254 tests passed; tooltip polish: 3 files / 32 tests passed.
- Root TypeScript, lint, format and clean build passed. CLI parity: 186 surfaces passed.
- Broad related suite first run: 430 files passed, 1 skipped, 4 failed (3 timeouts and 1 timing assertion); the four files passed a lower-concurrency rerun (192 tests). This is not an initially green full run.
- Prior Web proof: four panel rectangles identical after Home close/reopen; draft retained; all four chips fill only; long text default-expanded, opt-in folding, manual expansion and persistence verified; final console empty.
- Native Desktop: default localized steward/avatar, starter draft fill, username settings entry, title hide + shortcut restore and draft retention observed. New clean build loaded and username spacing visually inspected; username and folding preference retained after restart.

## Remaining gates

Native hover-tooltip positioning and final long-message rendering could not be completed reliably: native automation returned stale accessibility snapshots and `noWindowsAvailable`; Dock activation timed out. Do not interpret the screenshot without a tooltip as tooltip-position proof. Review path: hover the Home username, then open the synthetic FoldQA DM and toggle Messages → automatic long-message folding. The latest candidate remains open for Human QA. No browser fallback was used.

Remote CI, Human QA and merge are separate gates. No PR has been merged as part of this change.

## Configured Home model follow-up

Source `f6be7dadf69234990914bcf2ca255d1eaf4c9456`: Desktop at 2560 × 1640 shows the usable Home composer without a model-settings button (`desktop-model-ready.png`). Native AX also exposes the Home input and no model-settings button. The prior native Home images show the removed button at a different window size; this is a labeled viewport difference, not pixel geometry evidence. The existing five Home tests and root TypeScript passed; clean build, feature-map and release-fragment checks passed. The missing-model CTA is covered by the existing source test; no model credentials were removed for native testing.

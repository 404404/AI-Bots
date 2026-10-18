# Settings acceptance after current-main integration

PR #2112 / issue #2107. Source and physical QA branch: `c39cdd56b6a00e7d35b98eb4fbaea2f7f6e6a330`, including main `810ae5398`. Reused signed Debug native `baa5777a86b46f39bb1232de214314c5d0ce288f`; native package/config inputs are unchanged. Device: iPhone XS Max, iOS18.1.1, standard text, system-scheduled Light appearance. Date: 2026-10-18 JST.

## Source and CI

The sole merge conflict was Settings route registration. Both intents remain: upstream Default chat background route, and this PR's modal handle plus fixed title without a root X. No other product fix was needed. Mobile596 passed/8 skipped; mobile typecheck, full lint, changed-file formatting and bilingual changelog checks passed. All applicable checks passed in CI39094833502, including three test shards, iOS/Android exports, static/build, docs and isolated Host smoke. Draft CodeRabbit and real-model scenarios were skipped, not qualified.

## Physical checks

- English Light:9/9. Fixed title/final row, statistics disclosure expand/collapse, root handle drag and tap, immediate message-display preference write/reopen/cold readback, original Streaming restoration, Notifications child drag and reopen at root.
- Background child:6/6. Back returns within Settings; unsaved color draft is discarded on Back and on handle dismissal; handle tap and drag close the entire Settings sheet; reopening resets the navigation stack. No background was saved.
- Chinese Light:5/5. Fixed title/final row, statistics expand/collapse, handle tap/drag, root reopen. Inspected screenshots render Chinese glyphs normally with no missing-glyph boxes in the tested views. App-only launch arguments selected the locale; system language was not changed.
- Reduce Motion ON:4/4. Fixed title/final row, handle tap, handle drag and reopen; original OFF restored and visually confirmed. This is behavioral regression, not a measured motion/accessibility comfort assessment.

Previous six Light/Dark × default/intermediate/maximum checks remain tied to the prior application-equivalent79e306f36/db3c29bd3 version. This follow-up does not relabel that matrix as a new-head run.

## First attempts and boundaries

The first English pass used new source through the existing Metro but retained its old startup version label; the new background route and QA checkout proved the source. Metro was subsequently restarted and current screenshots show c39cdd56b. One detached restart did not survive, briefly showing dev-server unavailable; the persistent runner recovered. A background selector assumed button semantics while the real segmented control was an AX other; the corrected retry is recorded separately. The initial Chinese argument substitution left English unchanged; the corrected retry actually showed Chinese. One cold-preference screenshot was black despite successful snapshot/storage checks; it is retained privately, not published as visual evidence. After a final cold launch, a fresh screenshot showed current c39cdd56b, the selected original Streaming value and a readable Settings page; canonical storage also matched.

VoiceOver is explicitly deferred by the Human and was not exercised. Android/TalkBack, iOS26 current-head regression, APNs, Release performance and Human acceptance remain separate. Native screenshots do not qualify push delivery; the Notifications screen correctly reports this development build cannot receive notifications. Existing Router deprecation warnings were observed; no runtime exception was found in the Metro log.

Original Streaming and Reduce Motion OFF were restored and verified. App launch returned to English; system language, automatic appearance schedule and standard font were not changed. VoiceOver stayed OFF. Phone driver closed and independent device lane released; matching8097 Metro retained for Human review.

Private Host information, raw root screenshots and device identifiers remain local. Only sanitized views are published. No native rebuild/install/erase, shared Simulator or Host change, production action or merge.

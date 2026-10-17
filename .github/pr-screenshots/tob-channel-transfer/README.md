# Tob Channel transfer evidence

Captured from the isolated Web Client on 2026-10-17 UTC, dark theme, Chinese locale, 1440 × 900 viewport. All Channels, files and messages are synthetic and task-owned.

The product source was committed and built at `c125e70593f0d75fcc4d6517cbbc4bfcbbe919e5`; subsequent changes contain verification and review assets only. These are before/after states of the new operation on that source, rather than screenshots from two code revisions. Existing approval components render the new command proposals.

| File                         | Observed state                                                                |
| ---------------------------- | ----------------------------------------------------------------------------- |
| group-delete-before.png      | Fresh Group deletion awaiting the Human decision.                             |
| group-delete-after.png       | Approved deletion finishes; the Group leaves the roster.                      |
| group-delete-denied.png      | Denial returns `approval-denied`; the Group remains.                          |
| group-delete-stale.png       | Concurrent Human rename makes the approved snapshot stale; the Group remains. |
| attachment-upload-before.png | Cropped approval metadata: name, byte count, SHA-256 and no-send flag.        |
| attachment-upload-after.png  | Upload completes and returns the retained file identity without sending it.   |

Canonical checks independently verified Group tombstones, retained Source Event bodies, unchanged denial/stale targets, validated attachment references, direct upload replay/conflict, and readback after an actual same-Profile Host restart. The Group runtime fixtures have zero Bot members; member cleanup is covered by owner tests rather than these screenshots.

The approval JSON scroll container clips the Group proposal in the full-frame image. The journey compares the complete rendered JSON with the canonical request before deciding. The attachment crop contains the whole metadata proposal. Published captures contain no credentials, local login URLs, unrelated chats, or private file content.

Four successful Tob turns used `deepseek-official/deepseek-flash`, confirmed by native Session model-selection projection. A prior Go quota failure left an old model label in the Session footer; that label does not identify the later successful turns. First failures and full snapshots remain in private task evidence.

Native Desktop, CI and Human QA were pending when these Web assets were captured. No merge or release is claimed.

## macOS Desktop follow-up

Root's serialized native runner exercised the same product source in the macOS Desktop Client on 2026-10-17 UTC, using the original absolute Profile home. Captures are 2522 × 1640 pixels, except the cropped attachment proposal. All 19 native screenshots were inspected; all 30 JSON records parsed successfully.

`native-group-delete-before.png` shows the actual pending approval, followed by `native-group-delete-after.png`. `native-group-delete-denied.png` and `native-group-delete-stale.png` show successful safety refusals: the Group remains after denial or a concurrent Human rename. `native-attachment-upload-before.png` shows metadata only; `native-attachment-upload-after.png` reports the retained reference and explicitly says no file was sent.

The four completed native turns invoked the real ordinary Shell CLI, with actual approval decisions and independent Human CLI canonical readback. The full run and a subsequent actual same-Profile Desktop restart both recorded `errors: []`; restart readback used the newly created native fixture, not the earlier Web data. Root stopped only its own candidate and restored the main Desktop. No additional product source or build was needed.

Native automation is passed; Human QA remains pending. The reviewed product revision is `6396cbd26d98042898443dda7333781b5f2e7a79`, whose runtime product source matches the committed `c125e7059` build. Later review-asset commits do not change product code.

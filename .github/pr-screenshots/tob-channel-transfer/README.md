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

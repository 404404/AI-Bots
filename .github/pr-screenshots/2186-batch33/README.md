# #2186 — generic RenameSheet keyboard reachability (Batch33)

Actual assigned iOS Simulator screenshots, 402×874, English UI. This is follow-up acceptance evidence for merged PR #2189, not a product-code change.

- Mobile source: `907885c3d29c57f1b7909a6f4e4939fbc205aaa0` (frozen main at assignment).
- Full verify CI: [39146810969](https://github.com/BotHarness/DeepSeekBot/actions/runs/39146810969), success at that source.
- Reused compatible iOS native client: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; no build/install.
- Retained test Host: `2202bef4d744893fddf66cdd0a6b0c58f710dfb6`. This is an older fixture, **not qualification of the latest Host**.
- Two focused source test files, 11 tests passed independently; source tests do not prove native reachability.

## Actual path and result

Pair one temporary Computer through the real native form → open a newly created, zero-Bot/zero-message group → tap group title → Name → RenameSheet. At each size/theme, edit a draft, inspect full Save and Cancel labels above the real keyboard, then tap Cancel and verify canonical name unchanged. Reopen, edit, tap Save and verify Host name equals the actual field value and group details update. Restore the original fixture name between cases.

| System text | Light | Dark |
| --- | --- | --- |
| `large` (default) | Save + Cancel passed | Save + Cancel passed |
| `accessibility-large` | Save + Cancel passed | Save + Cancel passed |
| `accessibility-extra-extra-extra-large` | Save + Cancel passed | Save + Cancel passed |

Files ending `cancel` and `save` are keyboard-open, immediately before the actual action. `saved` shows the resulting details page. All 18 images were visually inspected. Long names can horizontally scroll in the single-line input; this run qualifies action access, not comprehensive text-selection behavior or title typography.

## Driver and proof limits

The native driver omitted default-size action nodes and clipped enlarged-button AX rectangles, although the screenshots showed complete controls. Actions used screenshot-grounded on-screen coordinates, never offscreen element activation. Large-text `fill` sometimes replaced only the visible selected portion of a long name; each Save was checked against the actual field value, not the intended replacement string. A tap immediately after changing text size once missed; that attempt was retained privately, the stable layout was re-read and the real sheet reopened. No product fix is inferred from these driver limitations.

The system keyboard has missing CJK glyphs. App UI was tested in English. VoiceOver/TalkBack were explicitly deferred; button role/label/state and modal escape conventions were reviewed separately, not spoken-output tested. Android, physical iOS, long translated labels, other generic sheets and latest-main Host compatibility remain outside this result. The dev-client floating tools control is visible in captures.

## Cleanup

Only one new empty group and one new pairing were created. Original fixture name restored, then only that group tombstoned; no messages/model calls/invitations. The unique new device matched the App's saved device ID and was revoked/unpaired; all four original device IDs/statuses remained. Original channel records compared equal. Original App runtime, Documents and Preferences restored exactly; light/default text and original launch locale restored. Own driver/Metro stopped, shared checkout and original untracked documents restored, lane explicitly released. No explicit clipboard operations were used; clipboard restoration was not independently snapshotted. No production, deployment or merge.

Task: `codex/local/01a14eca-891c-7d30-84fa-8e4dd7b060b3`; [claim](https://github.com/BotHarness/DeepSeekBot/issues/2186#issuecomment-6252666194). Remaining #2186 gates stay open.

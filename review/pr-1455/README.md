# Exact Lark rule review evidence

- Host PR: https://github.com/BotHarness/DeepSeekBot/pull/1455
- Host head: `9b495bf6705959c668f1f7cac5423f65e1af5760`
- Host base: `5134234e18ffd41d566fd94a0ccd214534f92318`
- Provider PR: https://github.com/DoodleBears/dsh-im/pull/24
- Provider head: `cb7f02a99046217db8e26fc203a4f5dfc3e2befc`
- Provider base: `99df05b7c2a14ebb6c122e4f22d655b6b9cbacc7`
- Generated: 2026-10-12
- Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`

Download `pr-explainer.html` and open it locally. It is a self-contained review explanation,
not an installed product page or execution evidence. Its hidden source draft is included and
public-safe. The generated page was inspected at desktop 1280 × 900 and narrow 390 × 844;
the page fits horizontally, with a scrollable metadata table at narrow width.

The Role editor PNGs are actual isolated DSH runtime captures at 1280 × 800, cropped to the
same 560 × 550 region. Both use English, the same role name/behavior, empty management/delegation
selections and light/dark native themes. Before uses `65bfa22e1bf27840fff5b9b2f198b42c45c7b2ed`;
the newer base `5134234e` did not change the Role editor. After uses the stated Host head.
The additional independent Save approval rules and delegation choices account for the taller
editor. Capture crops exclude unrelated runtime content.

At this evidence revision: current-source typecheck/lint/format/build and 68 focused regressions
passed, Provider 65 regressions passed, and Standards/Spec source reviews have zero remaining
findings. Documentation content build passed. A real Web model reply returned 323. Full Windows
testing did not pass and was stopped before merging main; timeout failures remain unresolved,
and six telemetry cleanup EPERM failures also reproduce on the unmodified base.

CI remains a separate check. No #1033 Lark receiver has started: a new exclusive QA1 window,
initial-card/preview/confirmation/result, matching/mismatching calls, current creator revocation,
restart, native screenshot evidence and first-slice Human acceptance remain required. Neither
Draft PR is merge-ready. All-opaque is explicitly deferred until exact-slice feedback.

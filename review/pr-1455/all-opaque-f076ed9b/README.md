# Current scoped Lark rule source review

- Host PR #1455, head `f076ed9b63d8497f7220ca504605254d22eae930`, base `5134234e18ffd41d566fd94a0ccd214534f92318`.
- Provider PR #24, head `bc795b9cb576c411f0c94997e025b72a94c4f1fb`, base `99df05b7c2a14ebb6c122e4f22d655b6b9cbacc7`.
- Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`; generated 2026-10-12.

Download the self-contained `pr-explainer.html` and open it locally. The draft is public-safe,
with exact-head source links. It explains source behavior, not execution evidence.
The page was rendered by the repository's unchanged answer-me-with-html CLI and inspected
at 1280 × 900 and 390 × 844; no page-level horizontal overflow remains, and the metadata table
scrolls at narrow width. No private login URLs, credentials, raw Profile/database contents or
unrelated conversations are embedded.

Current relevant checks: 91 Host/Client regressions and 86 Provider regressions passed;
typecheck, format, lint, Host/Provider builds and documentation content build passed.
Standards and Spec each reported zero remaining source findings at these heads. The account
qualification finding was fixed: v2 exact-only accounts retain one-call and exact controls;
broad eligibility is account/fingerprint-bound and refreshed through checked operations.
Current CI is separate from the earlier exact head's passed CI and must be checked independently.
Earlier Windows full-suite timeout and baseline telemetry EPERM limits remain recorded.

The Human accepted the exact native slice at Host `9b495bf6` / Provider `cb7f02a`; its screenshots
and [historical native facts](../native-qa.md) remain available and are also in both language
tutorials. That historical QA report predates the Human's acceptance; the feedback is recorded
in [the Issue](https://github.com/BotHarness/DeepSeekBot/issues/1033#issuecomment-6118528641).
The parent folder's older HTML explains that earlier head, not the current source.

The new all-opaque native path is implemented but not platform-qualified. A fresh exclusive QA1
window is required before connecting the new isolated Host, testing broad confirmation,
changed-tool/input automatic matches, scope changes, revocation/restart and capturing current
cards. The prepared Host has zero bindings and cold Client shell-ready diagnostics with no
earlier failures; it reuses the existing review port. Both PRs remain Draft. No receiver lease,
actual broader acceptance, merge, package release or deployment is implied.

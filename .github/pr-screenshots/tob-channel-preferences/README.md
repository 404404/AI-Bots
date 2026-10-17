# Tob Channel personal preferences — PR #2119

These captures show real interaction states on the candidate, not a visual redesign or a mockup.
The prior revision had no Tob-scoped CLI path for this set of personal Channel preferences;
there is no changed visual component to compare against the base revision.

- Final product revision: `058bbf6c22cd3c7a5a3d413242a7798600f4fa91`.
- Web six-turn capture precedes the final removal of one redundant pre-transaction access
  check; the transaction-level check remains. The affected nickname path was repeated on
  the final product revision in both clients. Later commits change tests and evidence only.
- Web: 1440 × 900, English/light, synthetic local Bot/Group fixtures. Before the request,
  the Group is a normal row; after the approved mute-and-pin request, it is pinned and
  the existing context menu offers Unmute. Home transitions to Tob's DM as part of the journey.
- macOS: native dark/Chinese, same synthetic ordinary Bot DM. Existing My nickname dialog
  shows the cleared state and restored personal nickname. Bot identity is unchanged.
- The full Web/macOS six-turn journeys also cover hide/show, denial, and stale approvals.
  Final product-revision supplements cover nickname, direct CLI refusals and restart readback.
- No credentials, login URLs, real conversations, or private filesystem contents are included.

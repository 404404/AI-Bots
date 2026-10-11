# ADR-0175: External tool rules retain current creator authority

Status: Accepted design; #1033 exact-rule private Lark source candidate. Real-platform qualification and first-slice Human feedback remain required.

## Decision

An application-defined Tool Approval Rule saved through IM carries its verified external creator in the existing Operational Database rule record. Saving requires both current `approve` and independent `save-rules` management capabilities. Role, Group and person exceptions use the existing current resolver with Deny precedence. A capability removed from one source does not disable the rule when another current source still grants it.

Every later match and final native execution guard checks the same Bot, current App/Binding fingerprint and original pairing ID. Losing either capability, revoking the pairing, disabling or replacing the Binding, disabling the Bot, or disabling inherited reception permanently revokes the rule. Re-enabling authority or pairing again cannot restore it. The recorded pairing revision is attribution; current effective authorization is checked rather than treating any revision change as revocation. Existing Web Human rules have no external creator and retain their authority.

The Lark first slice offers exact matching only. Allow once remains the default one-call action; saving uses a distinct checked Provider action namespace, previews the complete native tool name/input, Bot execution role and current Workspace Grant scope, then requires a second explicit confirmation bound to the request, private conversation, creator and displayed nonce. Preview and Back create no rule or model request. Confirmation reaches the existing Channel Tool Approval owner, which rechecks the live call and scope, appends its canonical decision and activates the pending rule. Repeated callbacks cannot create another decision or rule. Each later match still emits its own native approval audit. Native session-wide authorization remains Web-only; no Workspace or Service authority is widened.

## Alternatives and consequences

Treating an IM-created rule like an unconditional Web Human rule would let revoked reviewers retain standing execution authority. A separate IM rule store would split Web and native execution decisions. Keeping conditional provenance in the existing rule record avoids both failures, at the cost of checking current creator authority at each use and recording permanent revocation when authority is lost.

Web rule status and native card status read the canonical rule. After creator revocation, a bounded cleanup may update only the already-known card receipt through the same current qualified App/Binding. It carries fixed disabled-rule text, no operation arguments/results or controls, and grants no new messaging destination. Missing, disabled or replaced App identity prevents even this cleanup. A Host restart keeps confirmed rules and their provenance but does not revive a waiting native call. Database generation 82 adds nullable creator provenance; legacy Web rows remain valid. Back up before upgrading; an older writer needs the pre-upgrade backup or a compatible forward repair.

The separate all-opaque IM risk disclosure/confirmation and group destinations remain later slices of their owning issues. See [#1033](https://github.com/BotHarness/DeepSeekBot/issues/1033), [ADR-0067](0067-workspace-grants-bound-personabot-file-access.md) and the [Lark guide](../lark-connection.md#save-an-exact-rule-in-a-management-dm).

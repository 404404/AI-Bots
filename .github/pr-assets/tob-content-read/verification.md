# Selected content and progress — verification

Issue [#2134](https://github.com/BotHarness/DeepSeekBot/issues/2134), child of #2081; [agent claim](https://github.com/BotHarness/DeepSeekBot/issues/2134#issuecomment-6242316479). Base `5d44b7a6507d661415881808ab67e74275d54182` (Memory-read); product `895efde6aa3aa616d3f0968f23d4363477fbf2c7`; source/check fixture head `850996f987b43244575af4f97467f29bd29e57b9`. Later verifier/docs/assets changes do not change the built product. No new schema.

## Source

170 distinct focused cases across five affected files passed: 134 initially unaffected cases plus the final 36 content/RPC cases. Root TypeScript, lint, targeted formatting, ten source/ledger/ADR/CLI-parity/feature-map/preset/CI/install policies and one production build passed. Independent Spec and Standards review closed signed-cursor offset/anchor tampering and Unicode traversal-boundary findings at product895. Initial fixture/type failures were retained, corrected and rerun. The first full CI at19faf failed only the separate plugin registration-name inventory. Test-only correction `b60b246767cfe59fa59d4e66262075838b70c906` adds the two actual methods; that exact regression was reproduced red then passed green (one selected case,16 unselected). Total focused coverage is171 distinct cases across six files. No full local suite claim.

## Actual isolated Web

Pinned DSH `0.2.0-rc.2`, official `deepseek-official/deepseek-flash` Bot plans. The actual Human request selected exact Channel IDs and one ordinary Bot; marker values were absent from that request. Tob used four completed native Shell calls to read a Human DM, Bot-to-Bot DM, Group without Tob, and selected Bot progress. It reported all three canonical markers, cited source IDs, described empty Assignment progress truthfully, distinguished Bot claims from owner facts, and treated the quoted “delete Alpha” instruction as data. Selected Bot identity/model plan and Channel membership were equal before/after.

- Tob Session `botharness-84047ea3-ab77-4821-8813-6558f6223c06`, Turn1 completed.
- Human message `human-b01d8a65-fe64-4962-a40c-16087f2ad262`; Source Event `c6016320-078c-44c7-9efa-af649cd66cca` handled.
- Committed reply `2ea05c62-95b3-4e9a-b53d-9266ae79219a`; subsequent runtime idle; browser console/error collections empty.
- Direct CLI pages/body reads matched the canonical Human timeline and Assignment directory. Wrong target refused. Actual Host restart retained the same canonical home; fresh reads passed, prior process cursor refused `invalid-read-cursor`.
- Actual signed-offset tamper refused; an appended synthetic Group entry invalidated the old page with `stale-read-revision`. Four Unicode body chunks reconstructed the exact message, each ≤1,000 UTF-8 bytes; largest response 2,223 bytes.

Screenshots are synthetic interaction states on the new product at 1440×1000, dark theme, Chinese shell: before submitting the request, after the real reply, and read-only expanded reply capture after restart. These are not a base-versus-head layout comparison and do not claim a UI redesign. The inherited Home model-setup hint and default composer model label are not evidence of the actual selected Bot plan; the official route is proved by canonical Bot plans and actual completed execution.

## Actual macOS Native and restart

Root ran the real Desktop renderer against the same retained canonical home and product895. A fresh Human request in the retained Tob Session produced completed Turn2: eight successful native Shell reads, including four selected Unicode-body chunks, then a committed reply and handled delivery. Selected Bot identity/model plan and all three Channel memberships were unchanged; runtime returned idle and console/error collections were empty.

- Human message `human-16269fed-a71d-4793-8eb9-0661ddb496c7`; Source Event `24fa2493-5cfb-4f6a-bf1f-b737bdd3e75f` resolved/handled.
- Committed reply `50722715-ebf8-4c86-9cc2-4576a50b72dc`, same Tob Session as Web.
- Actual second Desktop process restart: fresh direct content/body/progress readback passed against the same canonical home.
- The initial after-turn viewport stayed on older messages with a new-message button; that image is preserved privately and is not used as visible-reply proof. A third read-only Desktop capture used the real latest-message button and expanded the retained reply. No new prompt or model execution occurred. The inspected images show the actual second-turn source revision and DM marker.

Native captures are 2522×1640 physical pixels, dark Chinese shell, synthetic fixtures only. The prior Web images remain 1440×1000. These capture dimensions are not a responsive-layout claim. Root stopped each exact candidate and restored the main app. Fresh Desktop Profile configuration used an explicit package/config/link allowlist; no Session or credential store was copied.

## Preserved first failures and limits

An initial English-only stock screenshot selector timed out against the Chinese shell. A direct synthetic Bot DM seed without trusted Source Event correctly refused; the fixture was then created through a normal actual Human/Bot conversation. The first custom driver queried a fresh Tob Session before it existed and failed before submitting any Tob request; explicit Session readiness fixed it. Two optional capture selectors timed out; a visible accessible row capture succeeded without another model request. These verifier/setup failures remain private, alongside screenshots and logs; they are not hidden or counted as successful feature runs.

Native model/restart/capture are now qualified as above; exact final-head CI, combined-stack qualification and Human QA remain separate pending gates. Source tests cover purge/visibility/incarnation/ordinary-Bot membership and Memory-Assignment denial; the Web run does not claim every source edge was reenacted. No real private conversations, attachment downloads, external delivery, membership expansion, management delegation, merge or release were exercised.

## Reproduce

Use `scripts/e2e-tob-content-read.mjs` with `BH_E2E_INSTANCE` and a private `BH_E2E_CONTENT_FIXTURE` containing only owned synthetic Bot/Channel IDs. Phases: `direct`, `model`, `restart-read`; `capture` only reopens an existing synthetic reply. Native additionally takes `BH_DESKTOP_CDP` and a fresh authenticated `BH_E2E_HUMAN_INSTANCE`. The driver never launches/stops a Host or changes model configuration. Root serializes Desktop and preserves the same canonical home; no Session/credential copying is required.

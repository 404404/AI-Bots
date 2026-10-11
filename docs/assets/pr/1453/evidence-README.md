# PR #1453 evidence

Implementation base: `e513ac414ab6c38ee95173377ebeb0950324d7dc`.
Implementation head: `aefdf9a82d1f18ef162a9914253d39cdcd522c53`.
Date: 2026-10-12. Issue: #1423.

The Human accepted this round's declared-exclusion interaction. Exact-head full CI passed: https://github.com/BotHarness/DeepSeekBot/actions/runs/38180440167 . The parallel Standards and Spec reviews have no outstanding findings; the unavailable-person projection finding and the real-model metadata ambiguity were corrected.

## Full workflow and native qualification

1. Rechecked the live claim and recorded this task's claim before implementation. Used an isolated worktree. The first Group behavior slice remained accepted and separate.
2. Human authorized this round's exclusive QA1 App window and confirmed the prior receiver stopped. Reused only this task's isolated Profile and the existing test Bot/Binding. No App scopes or credentials were changed.
3. In the actual settings UI, created `QA: no product answers`, selected `QA: product answers` as its mutually exclusive peer, and saved. Canonical readback retained reciprocal links: product item r6, no-product item r1, policy r11. `native-create-exclusion.png` records creation at head 85157d15; the later aefdf9a8 change affects the sender query/prompt, not this UI.
4. Proposed a second Group Allow and membership for the person who already had the first Allow. The editor named the person, both items and both source Groups and disabled Save. A direct existing authenticated senderAccess API request returned `behavior-permission-conflict`. Policy and Group revisions remained unchanged across restart.
5. Initial Lark baseline exposed a model ambiguity: it misread configuration exclusion IDs as a prohibition despite effective Allow. The final sender query omits configuration-only IDs. The regression checks retained canonical metadata and an effective Allow without those IDs.
6. Final-head fresh genuine @ `1423_EXCLUSION_FIXED_0735`: current policy r11, product item r6 Allow, source Group A r1, empty management capabilities, product introduction and 53×59=3127.
7. Actual UI saved Group B r4 with no-product Allow, product Deny and the same person's membership. Policy r12. Fresh @ `1423_EXCLUSION_DENY_0738`: product Deny with both sources, no-product Allow, empty management capabilities, product introduction declined, 59×61=3599.
8. A direct attempt to remove the protecting Deny returned `behavior-permission-conflict`. After removing the conflicting Group A membership through the existing authenticated API, removing Deny was permitted. These latter mutations used the API while native Client startup was failing; they are not presented as successful UI actions.
9. Restarted the same owned Host. Links and item revisions remained, Group A r2 had no members, Group B r5 had no-product Allow only, policy r14. Actual UI again refused to add the conflicting Group A membership. Fresh @ `1423_EXCLUSION_RESTART_0748` queried only Group B r5, declined product questions according to its behavior, calculated 61×67=4087 and retained empty management capabilities.
10. Stopped the QA1 receiver and released this round's window. Screenshot-only Profiles had zero Provider accounts and no copied credentials. All screenshot Hosts were stopped after capture. No production Host, other task receiver, merge or deployment was performed.

## Canonical correlation

Each final native result has a canonical Source Event, group-mention Inbox Admission with `attempt_state=handled` and no last_error, and a matching provider-accepted Outbox intent/receipt. Source Events retain their historical generic attempt-state field; admission execution status is read from the owning Inbox Admission, not inferred from that legacy field.

| Marker | Source Event suffix | Native reply receipt | Policy / result |
| --- | --- | --- | --- |
| FIXED_0735 | 488207a8cdbb8 | om_x100b63f49a42a4a0ed0e66a91223d92 | r11 / 3127 |
| DENY_0738 | 1c3dff91db945 | om_x100b63f496da20a4eec42dfbc60bae4 | r12 / 3599 |
| RESTART_0748 | 41486b360f4b9 | om_x100b63f4a4501ca0eec42a56d2f31da | r14 / 4087 |

The cropped `native-lark-replies.png` shows only the designated QA conversation pane. Unrelated chats, account menus and login credentials are excluded.

## Comparable Client captures

The twelve before/after images use exact base/head above, English locale, the same canonical item/Group/person data, matching CSS viewport and theme. Desktop: 1280×800 dark/light. Narrow: 390×844 light. Underlying PNG pixel size follows the browser device pixel ratio.

The second Group already provides no-product Allow. The proposed Group A membership would add product Allow. Before, Save remains enabled with no declared-conflict warning. After, the named incompatibility disables Save. Neither baseline nor screenshot fixture saves the incompatible proposal. Receiver-unavailable banners are intentional in the receiver-free capture Profile and are identical across comparison pairs.

At 390px, the final Group dialog body scrolls (client height 564, content height 610); Save remains visible in the footer. The document width equals viewport width. New item controls stack on narrow screens and use the shared wide workspace on desktop.

## Native Client failure limits

During the live round, one document first recorded an unclassified console exception, then shell loss and later `uiConversation.binding: unknown session`/released-reference errors. Its cause remains unproven; private diagnostic attempts were retained. A cold restart subsequently yielded shell-ready and operable settings. This is a recovery observation, not a root-cause fix. The existing #1184 startup investigation remains independently owned; no native guard or package was patched.

The HTML explanation is a review aid bound to the exact implementation head. Screenshots, native correlations, CI and Human feedback remain distinct evidence. Source/persistence/prompt policy is not hard resource isolation.

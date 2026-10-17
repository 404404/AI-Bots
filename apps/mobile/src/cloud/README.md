# TOB mobile connection owner

`client.ts` owns the fixed instance, live PKCE transaction, session rotation and admission readback. `native.ts` is the only native boundary; the UI receives a secret-free snapshot. `native-intent.ts` keeps callback credentials out of routing, including cold launch.

`instance-contract.ts` is a copy with repository-required formatting and comment removal of [TOB packages/contracts/instance.ts at 16f7bfc](https://github.com/BotHarness/tob/blob/16f7bfc/packages/contracts/instance.ts), protocol/format v1. Update both repo validators and compatibility tests together; do not fetch or trust a validator at runtime. TOB owns the public wire format. This deliberate copy avoids introducing an unpublished package dependency during the first slice. Mobile auth/session implementation is independent and does not use the Node CLI.

Run `pnpm vitest run apps/mobile/test/cloud-client.test.ts`. These injected-boundary tests do not qualify native camera, SecureStore or browser handoff. See [the native UAT checklist](../../../../docs/agents/tob-mobile-uat.md).

Organization creation persists its pending name/operation before sending. `useOrganization` preflights membership, rotates for `organization_id`, then reads the selected organization through the service. The server verifies the signed scope and current WorkOS membership. Snapshots expose only verified name/description/version/role; cold restart clears that verification. Settings drafts bind to the selected ID/version; stale owner UI cannot authorize a server write. List pagination uses the server's opaque membership cursor.

Ordinary user onboarding requires TOB `/api/onboarding` and `/api/me` roles `admin | user`. Session checks retry the server-owned default-workspace operation; the native UI never grants instance or organization permissions. A dedicated UAT fixture may declare `instanceRole: "user"` for checkpoint assertions; this test harness remains separate from Hosted AuthKit acceptance.

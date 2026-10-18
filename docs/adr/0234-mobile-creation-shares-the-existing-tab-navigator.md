# ADR-0234: Mobile creation shares the existing tab navigator

- Status: Accepted; native qualification tracked in the issue
- Date: 2026-10-19
- Issue: [#2195](https://github.com/BotHarness/DeepSeekBot/issues/2195)

## Context

The confirmed mobile design places a contextual creation circle beside the bottom navigation island. SDK 58 NativeTabs exposes a bottom accessory rather than a persistent adjacent action slot. A fake navigation destination or another navigation stack would change Back and tab semantics.

## Decision

Use the already installed Expo Router JS tab navigator on iOS as well as Android, retaining existing Home, Activity and root Stack routes. A shared bar presents two destinations and a separate creation action; a transparent native modal owns dismissal and blocks underlying actions. Existing native glass decoration on iOS and opaque OCAT material on Android are backgrounds only. No dependencies, SDK or native inputs change.

Creation resolves stable source keys, never display names. All requires an explicit target. Computer flows carry the selected Host ID into the existing full-client route and refuse a different active Host. Cloud flows carry instance, account scope and Organization ID; refresh identity/ownership before opening the form and again before the mutation. An unmounted or dismissed preflight cannot navigate or initiate creation. Pending cloud creation uses the existing durable idempotency receipt and retries only on explicit action. No new store, API, CLI command, permission or execution authority is introduced.

## Consequences

The iOS tab bar is now app-owned presentation. Native glass support does not prove layout, gestures or accessibility: exact-head shared-queue Simulator checks must qualify adjacent geometry, dismissal, safe area, large text and actual creation. Android, physical-device and screen-reader gates remain independent. The expanded menu uses an opaque readable surface, not an asserted native morph animation. N3 adds Search only with functioning search behavior.

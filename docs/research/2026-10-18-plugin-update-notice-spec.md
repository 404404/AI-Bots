## Problem Statement

Users cannot reliably discover a new DeepSeekBot Product Release Version inside Bot mode. They learn about releases through social media or group chats. The installed-version changelog modal is easily mistaken for a new-version notification, while DSH's own update badge concerns a different product.

Read-only inspection of main after #2168 shows that Bot-mode entry starts the installed-release announcement, whereas the remote update check is started by the release settings page. The check selects an npm dist-tag and exposes installer availability, but does not yet return a compatibility decision based on the running DSH version. Thus “has an installer” is not proof that a target is compatible.

On 2026-10-18, the official npm `latest` and `next` tags both resolve to **1.3.1**. **1.4.0 has not been published.** A real isolated macOS Desktop baseline with published **DSB 1.2.1 / DSH 0.2.0-rc.2** showed the installed 1.2.1 changelog on first Bot-mode entry, no automatic 1.3.1 update modal after dismissal/re-entry/restart, while the authenticated Host check returned `available`, current `1.2.1`, latest `1.3.1`, installable `true`. This is a reproduced notification gap, not a demonstrated registry outage. Screenshots and evidence limits are attached separately.

## Solution

Entering Bot mode automatically checks for a newer eligible DeepSeekBot release and presents a localized upgrade modal without requiring the user to discover About/settings first. The modal shows the running DSB version, running DSH version, exact target version, compatibility outcome and release highlights. A compatible target offers the existing explicit update action. A target that requires another DSH version explains that requirement and does not offer a misleading one-click install.

The notification and the installed-version changelog are separate states. Dismissal persists for the exact offered target in the current local Client/Profile scope, avoiding repeated modals across panel toggles, re-entry and restart. The update remains discoverable in settings after dismissal; a newer target can notify again. Network errors and incomplete identity are never displayed as “up to date.”

An older published Client without automatic checking cannot acquire this behavior merely because npm `latest` changes. The rollout must document the existing manual update entry for that first transition. Do not promise that publishing 1.4.0 alone will cause untouched 1.3.1 installations to display a new modal.

## User Stories

1. As a user, I want Bot-mode entry to discover a new DSB release, so that I do not depend on social media.
2. As a user, I want the update modal to distinguish DSB from DSH, so that I know which product changes.
3. As a user, I want to see my running DSB version, so that the proposed change is understandable.
4. As a user, I want to see my actual DSH version, so that compatibility is based on my installation.
5. As a user, I want an exact target version, so that inspection and installation refer to the same release.
6. As a user, I want compatible updates to be offered directly, so that updating requires few steps.
7. As a user, I want an incompatible latest release to explain the DSH requirement, so that I am not sent into a predictable failed install.
8. As a user, I want a newer compatible release offered when the absolute latest is incompatible, so that I can still receive eligible improvements.
9. As a stable-channel user, I want prereleases excluded unless I have explicitly opted in, so that a background check does not change my release channel.
10. As a user, I want a short localized change summary and full release-note link, so that I can decide whether to update.
11. As a user, I want to dismiss one target's modal, so that returning to Bot mode does not repeatedly interrupt me.
12. As a user, I want dismissed updates to remain in settings, so that dismissal does not prevent later installation.
13. As a user, I want a newer target to be announced even if I dismissed an older one, so that dismissal is not permanent suppression.
14. As a user, I want offline and failed checks distinguished from being current, so that I can trust the status.
15. As a user, I want a manual check to actually retry the remote check, so that recovery does not wait behind a cached failure.
16. As a user, I want update checks to leave my conversation, draft and panel geometry intact, so that discovery does not disrupt work.
17. As a user, I want update installation and restart to require my explicit action, so that pending work is not interrupted automatically.
18. As a user, I want installed-on-disk and currently-running versions distinguished, so that I do not mistake a staged update for a completed one.
19. As a user, I want a failed installation to preserve the existing Profile and show its reason, so that I can recover without losing Bots or conversations.
20. As a user, I want first-run instructions, installed release notes and upgrade notices coordinated, so that multiple competing modals do not hide one another.
21. As a user with multiple Profiles, I want update identity, installed state and dismissal scoped correctly, so that another Profile's actions do not silently suppress my notification.
22. As a developer, I want source or mixed-package builds labelled honestly, so that they cannot impersonate published releases to trigger updates.
23. As an operator, I want the CLI to report the same compatibility and update decision as the UI, so that failures can be diagnosed without a model.
24. As a maintainer, I want actual older-package Desktop evidence and clearly separate future-version fixtures, so that a passing test cannot be confused with a release that never happened.

## Implementation Decisions

- Reuse the existing application-defined Release Service as the single decision owner. Its consumers are the existing Client release controller, settings/modal and CLI through the authenticated Host bridge. Do not introduce another updater, registry authority, version store or long-lived stream.
- Use the running Product Release Identity, not a mutable npm tag or changed package file, for current DSB. Read the running native DSH identity through its supported Host capability. Keep DSH, DSB, Provider and Skill versions distinct.
- Resolve eligible versions from trusted configured registry metadata. Preserve the user's existing channel policy; stable installations must not automatically switch to preview releases. Choose the greatest policy-eligible version greater than current that is compatible with the running DSH. Report the absolute latest separately when it is blocked.
- Evaluate exact target metadata using the same compatibility semantics as native DSH, including prereleases. `engines.dsh` precedence, relevant Host peers and known component composition must agree with the install path. Missing/corrupt metadata or unknown DSH identity yields an explicit unknown/unavailable result, not optimistic compatibility. Native Plugin Manager remains the final install admission authority.
- Keep the #2168 compatibility floor unchanged. This feature does not raise the minimum DSH version or bypass compatibility, permissions, package integrity, build approval or release-age policy.
- Distinguish target compatibility from installation capability. A compatible release may still require a guided command because this Profile lacks a usable installer; that is a different explanation from incompatible DSH.
- On Bot-mode entry, start a bounded asynchronous check once runtime identity is ready. Do not block rendering or rebuild the workspace. Share in-flight work and Host cache between automatic and manual consumers. Preserve a bounded successful-check TTL and shorter failure retry; re-entry after expiry and network recovery must be able to retry. A manual force check must reach the Host cache owner instead of merely bypassing a Client flag.
- Keep installed release-note acknowledgement separate from update-target dismissal. Existing seen-version data migrates only as installed-note acknowledgement; it must not suppress every future available update. Scope update dismissal by local Client/Profile and exact target/channel. Do not automatically advance it on a failed request or merely mounting a component.
- Use the existing modal, translation and release-note UI. Offer update, dismiss and details as appropriate. Coordinate first-run onboarding and installed notes so only one modal owns focus; the available-update notice must not disappear behind onboarding or be permanently consumed before it was shown. Keyboard focus returns to the prior control on dismissal.
- Revalidate target eligibility immediately before an explicit install. Pass the exact selected version to the existing native Plugin Manager, preserve its transactional failure behavior and permissions, and keep old running/new staged identity separate until restart readback. Never resolve a different bare latest target at installation time.
- Expose coded results and safe diagnostics through existing release CLI commands. Any changed bridge contract ships its CLI coverage in the same implementation PR. Record bounded check/decision failures without credentials or private Bot content.
- No database schema decision is required for the baseline. Extend the existing preference owner for dismissal; document any migration if implementation proves one necessary.
- **First runnable slice:** automatic compatible-release discovery on Bot-mode entry through the existing Release Service, a real modal with DSH/DSB/target identity, persisted per-target dismissal, settings re-entry and matching CLI diagnostics. Include real Desktop regression evidence before expanding notification channels or updater scope.

## Testing Decisions

The Human confirmed the highest acceptance seam: **real macOS Desktop**, using an isolated Profile and actual installed packages. No browser automation. A useful test asserts the user-visible decision, exact running/target identities and durable dismissal behavior, not private implementation calls or arbitrary DOM structure.

### Existing seams and prior art

- Extend existing Release Service/version/identity/install/restart tests, Client release-controller tests and fresh-Profile package-install qualification.
- Keep one end-to-end product seam: Desktop Bot-mode entry → existing authenticated release check → registry metadata → compatibility decision → rendered modal. CLI/readback supplements the visible proof; it does not substitute for it.
- At the existing registry transport boundary, use controlled metadata only for deterministic unavailable, incompatible and future-release cases. Do not inject a modal or fake Client state. Clearly label these as fixtures/candidate evidence.

### Native acceptance matrix

1. Install an actual published lower version (baseline 1.2.1) into a fresh Profile on a compatible official DSH Desktop. Record actual DSH, installed DSB, registry tags, package provenance, timestamp and empty dismissal state. Enter Bot mode, capture any first-run modal, dismiss it and record whether a new-release modal appears. Preserve failures.
2. Re-enter Bot mode and restart Desktop. Confirm installed-note acknowledgement and update-target dismissal behavior separately, with screenshots and Host readback.
3. On the fixed candidate, start from a qualified packed identity below the offered target; verify automatic modal, exact target and compatible DSH. A controlled lower-version QA artifact is explicitly identified as test-only; it is never published under or presented as the genuine historical 1.2.1 release.
4. Exercise compatible and incompatible targets on DSH 0.2.0-rc.2 and 0.2.1-rc.2. Cover the compatibility floor, prerelease semantics, unknown runtime metadata, latest blocked but another compatible target available, and current/newer-than-registry installs.
5. Cover the intended **1.3.1 → 1.4.0** decision with controlled candidate metadata before publication; mark it as simulated release availability. A real production-tag upgrade can only be qualified after a separate authorized publication. Do not claim this scenario retroactively adds code to already installed 1.3.1 Clients.
6. Dismiss the offered version, toggle unrelated panels, switch Channels, leave/re-enter Bot mode and restart. No repeat modal for that target; settings still shows it. A newer eligible target prompts again. Drafts, geometry and selection remain intact.
7. Cover delayed network success, offline/timeout, mirror divergence, malformed metadata, release-note fetch failure and retry after recovery. A successful metadata check can still show a notice when notes are unavailable. Error must never become “latest.”
8. Verify startup identity becoming ready after initial loading, repeated mounts, simultaneous checks and concurrent first-run dialogs. One visible modal and one owned check; no lost reminder or multi-modal focus trap.
9. Through explicit user action in a disposable Profile, verify exact-version installation, staged restart state, restart identity readback and failure preservation using the existing updater. No credentials, real chats or personal Profile are required.
10. Capture EN/ZH and light/dark modal evidence, keyboard dismissal/focus and constrained-window readability. Record UI automation failures separately from product failures.

### Evidence status at spec creation

- **Passed baseline setup:** official DSH 0.2.0-rc.2 Desktop, actual npm DSB 1.2.1, isolated Profile; authenticated current-version and remote-update reads.
- **Reproduced failure:** first-entry modal announces installed 1.2.1; no automatic 1.3.1 modal after dismissal/re-entry/restart, although the Host can discover 1.3.1.
- **Not yet qualified:** fixed notification behavior, compatibility-aware target selection, future 1.4.0 candidate fixture, completed UI-driven installation/restart, full locale/theme matrix. These are implementation acceptance gates, not implied passes.

## Out of Scope

- Publishing 1.4.0, changing npm dist-tags, pushing release tags or automatically upgrading personal Profiles.
- Automatic DSH application updates, a second package installer or replacing native package/permission checks.
- Social-media, email, OS push or mobile notification delivery.
- Redesigning Home, the global rail, Bot creation or unrelated settings.
- Promising runtime compatibility for unreleased future DSH versions.
- Claiming newly shipped code changes the behavior of an already installed historical Client without an upgrade.

## Further Notes

- Reuse the updater work from #986 and product identity policy in #1979 / ADR-0216. Preserve the exact inspection/install target lesson from #1456 and the DSH floor from #2167 / #2168.
- This spec and the reproduced old-version failure are ready for implementation. No production feature fix is included in the spec task.
- Record the missing proactive entry point as a regression test so future panel and onboarding changes cannot silently drop upgrade discovery.

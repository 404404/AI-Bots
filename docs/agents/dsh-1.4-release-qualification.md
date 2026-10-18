# DeepSeekBot 1.4.0: DSH compatibility qualification

Target release: **1.4.0**. This is a preparation plan, not a published release or a claim that unreleased DSH versions work. Tracking: [#2167](https://github.com/BotHarness/DeepSeekBot/issues/2167).

## Admission and qualification are separate

The product declares `>=0.2.1-rc.2 <0.3.0-0` in `engines.dsh`; Host-provided DSH peers use the same range. The development dependencies, lockfile and `productDsh` remain exactly `0.2.1-rc.2`. `productDshVersions` names concrete releases for artifact qualification; it must never be populated with invented future versions or inferred from a broad range.

DSH's native preflight evaluates ranges with prereleases included. Contract tests therefore exercise representative future 0.2.x RC and stable version strings, without claiming to run those nonexistent releases. Ordinary npm SemVer peer matching may exclude future prerelease tuples; native DSH admission remains the compatibility authority, and real installation through its supported plugin manager is a separate gate. Never recommend `--force`, edits to user compatibility exemptions, or disabling checks as the fix.

The 0.2.1 API migration in [#2159](https://github.com/BotHarness/DeepSeekBot/pull/2159) is a prerequisite. Its Subagent activation, authenticated peer and settings changes mean this range must not be applied to the published 1.3.1 implementation. This candidate does not claim 0.2.0 support. A future 0.3 API line requires a deliberate compatibility review rather than an unbounded `*` declaration.

## Before publishing 1.4.0

- Integrate and review #2159 and this range change. Independently closed Tob/Home PRs are not implicitly approved or included.
- Prepare one immutable 1.4.0 candidate using the existing release tooling, with source SHA and tarball digests. Verify every first-party package's range in those exact tarballs.
- Run the existing fresh-Profile artifact installation gate on DSH 0.2.1-rc.2, including the bundled IM Provider: install without pre-approved builds, boot, create a Bot and DM, restart and read back. An engine preflight alone is insufficient.
- On macOS Desktop, verify actual package installation, Bot mode, a real DM reply, delegation/Assignment completion and restart. Qualify Browser/Computer and Provider seams affected by the native upgrade; retain platform-specific gaps as explicit gates. UI checks for this task are Desktop-only.
- Run the applicable CI and release checks. Qualification evidence belongs to the exact candidate, not merely the branch's linked development installation.
- Publish only the approved candidate. Do not advance `scripts/install-release.json`, installation guides or a release tag before successful registry publication and readback. Source package `0.0.0` remains a development identity; the release command stamps 1.4.0.

## Future 0.2.x updates

When DSH publishes another 0.2.x version, run installation/startup and critical-seam checks against the existing candidate first. Compatible updates should not require a DSB metadata-only release. Record failures by missing capability or changed contract; fix adapters before broadening actual runtime support. Keep the qualification list concrete and the admission range broad. Unknown future behavior is not verified behavior.

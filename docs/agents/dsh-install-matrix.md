# Packaged DSH installation matrix

The build pin is not the supported Host floor. DeepSeekBot's Core, UI and product-managed IM
Provider use the shared supported range in `scripts/product-artifacts.mjs`; native DSH peer checks
include prereleases. The product range is `>=0.1.7-0`, with no future-version ceiling: native
preflight tests verify that hypothetical 1.0 and 2.0 Hosts are not blocked by these declarations,
not that they run correctly. The independent Browser and Computer Bundles keep their separate declarations.
The Provider's immutable source/build pin and runtime digest are unchanged by a metadata-only fix.

`scripts/test/manifest-engines.test.mjs` checks declarations; it is not an installation E2E.
`scripts/test/dsh-compatibility.test.mjs` exercises native DSH compatibility preflight without
version exemptions, including unsupported-version rejection. Neither proves Host boot or UI readiness.

After building and preparing exact product tarballs, run:

```sh
node scripts/e2e-dsh-install-matrix.mjs /absolute/artifacts /absolute/fresh-private-output
```

Every row installs the exact versioned DSH CLI and the four real product tarballs in a new private
Profile via `dev-instance.mjs`, checks composed components and the authenticated API, creates a
synthetic Bot and DM, restarts the same Host, and checks that the Bot persists. No `allow-version`,
`--accept-risk`, developer Provider, registry product substitute, or workspace-linked product is used.
The eight published versions from 0.1.7-alpha.1 to 0.2.1-alpha.2 are enumerated explicitly. Extend
the list when qualifying a new release; a SemVer match alone does not qualify future Hosts.

The output directory must be private. Launch logs contain native login URLs and must not be
published. Only `report.json` is designed for sharing: package identities and integrity, runtime
version/platform, and per-row installation/API/restart results. Browser UI, model replies, native
IM delivery, physical Desktop/platform QA, CI and Human QA remain separate gates.

For a single browser check, use `dev-instance.mjs --product-artifacts <directory> --dsh-version
<exact-version>` with a fresh isolated home and port. This explicit compatibility run uses native
DeepSeek credentials rather than the machine-local AX Go model, which is qualified only on RC1.
Without `--dsh-version`, the existing qualified CLI/model defaults are preserved.

## Bounded 1.2 maintenance releases

The maintained `release/1.2` branch starts at v1.2.0. Backport reviewed changes and bilingual release
notes there through PRs; do not bring unreleased 1.3 schema migrations into a patch implicitly.
The publication workflow accepts stable v1.2.x tags reachable from this branch as well as tags
reachable from main. Other off-main tags still fail. Existing clean-source, artifact-integrity,
CI/preparation and npm-release environment gates remain mandatory. Publishing authorization does
not replace Human QA. Forward-port the compatibility fix to main so later releases cannot regress.

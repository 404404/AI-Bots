# Standalone browser worker image scan research (2026-11-02)

## Scope and evidence

Read-only investigation of GitHub Actions run [41378523337](https://github.com/404404/AI-Bots/actions/runs/41378523337), job `qualify` (job ID `125063986518`), for `feature/gui-container-codex-prototype`. The run checked out `dbb9fb3bdff140b09ab04116c5c96554ad131ab6`; the current local worktree was independently verified as branch `feature/gui-container-codex-prototype`, HEAD `7675edb4e34b17b12386bbdfd5445a733283f056`. The worktree had existing modifications and untracked acceptance notes; none were changed by this investigation.

The workflow passed module tests, syntax checks, and fixture-image build, then failed at “Scan worker image.” Proxy, gateway, fixture scans and the Chromium sandbox/E2E gate were skipped as downstream steps. The workflow scans CRITICAL and HIGH findings, both OS and library types, with `ignore-unfixed: false` (`.github/workflows/standalone-browser.yml`).

## CI Trivy findings

Trivy 0.70.0 reported `standalone-browser-worker:candidate (debian 13.7)`: **109 findings: 108 HIGH and 1 CRITICAL**. All 109 were OS package findings. Its Node package scan reported zero for each of:

- `/opt/browser/node_modules/playwright-core/package.json`
- `/opt/browser/package.json`
- `/opt/yarn-v1.22.22/package.json`
- `/usr/local/lib/node_modules/corepack/package.json`

Thus this failure is not evidence of a vulnerable npm dependency. It is an OS image finding. The one CRITICAL is `libxml2` CVE-2026-6653 at `2.12.7+dfsg+really2.9.14-2.1+deb13u3`; Trivy printed no fixed version and no package status for it. The remaining 108 HIGH findings include these grouped OS package families (the log's package rows list each CVE occurrence):

| Package family | Installed version(s) shown by Trivy | CVE(s) shown in the log | Trivy fix/status fields |
|---|---|---|---|
| Chromium (`chromium`, `chromium-common`) | `156.0.8078.73-1~deb13u1` | `CVE-2026-119260`–`119271`, `CVE-2026-76024`–`76031` | No fixed version; status empty |
| util-linux (`bsdutils`, `libblkid1`, `liblastlog2-2`, `libmount1`, `libsmartcols1`, `libuuid1`, `login`, `mount`, `util-linux`) | `2.41.5-0+deb13u1` (login `1:4.16.0-2+really2.41.5-0+deb13u1`) | `CVE-2026-76642`, `CVE-2026-78408`, `CVE-2026-78409`, `CVE-2026-78410` | `bsdutils` row says `affected`; other package rows empty; no fixed version |
| libxml2 | `2.12.7+dfsg+really2.9.14-2.1+deb13u3` | `CVE-2026-6653`, `CVE-2026-74860`, `CVE-2026-86138`, `86139`, `86140`, `86142`, `86143`, `86144` | No fixed version; status empty |
| systemd | `257.13-1~deb13u1` | `CVE-2026-16742` | `systemd` row says `affected`; no fixed version |
| sqlite | `3.46.1-7+deb13u2` | `CVE-2026-119373`, `CVE-2026-119586` | No fixed version; status empty |
| Other packages | See full Trivy log | `CVE-2026-54369` (libacl1), `34980`/`55453` (libcups2t64), `2025-69720` (libncursesw6/libtinfo6/ncurses-base), `2026-37555` (libsndfile1), `36849`/`52490` (libtiff6), `88806` (libx11-6), `88807` (libxrender1), `94286` (libxtst6), `2026-9538` (perl-base), `2022-4055` (xdg-utils) | No fixed version printed; exceptions: libtiff6 `CVE-2026-36849` says `will_not_fix`, `CVE-2026-52490` says `affected`; perl-base `CVE-2026-9538` and xdg-utils `CVE-2022-4055` say `fix_deferred` |

The complete package/CVE/severity/status/installed/fixed-version rows are in the job log linked above. Trivy's table does not report layer numbers. Layer attribution below is therefore an inference from the checked-in Dockerfile and BuildKit output, not a scanner field.

## Root cause and layer attribution

The worker inherits the pinned `node:24.21.0-trixie-slim` digest `sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`. Its shared `base` stage runs `apt-get update && apt-get upgrade`, then installs the locked Node dependencies. The `worker` stage separately installs Debian `chromium`, fonts, and certificates. BuildKit confirms Chromium `156.0.8078.73-1~deb13u1` and `libxml2` `2.12.7+dfsg+really2.9.14-2.1+deb13u3` came from Trixie repositories during those steps.

The CRITICAL CVE is not resolved by the `apt-get upgrade`: the installed Trixie version is currently still marked vulnerable by Debian's tracker. Debian labels Trixie `CVE-2026-6653` “vulnerable (no DSA)” / “<no-dsa> (Minor issue)” and lists only unstable/forky/sid fixed at `2.14.5+dfsg-0.1`. The package version string's embedded `2.9.14` matters: Debian reverted Trixie's libxml2 compatibility package to a 2.9.14-based version, so its nominal `2.12.7` prefix should not be treated as proof of the upstream >=2.11.0 fix. ([Debian CVE tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653), [Debian libxml2 source tracker](https://security-tracker.debian.org/tracker/source-package/libxml2))

Ubuntu's current tracker differs by release: Ubuntu 24.04 Noble is fixed in `2.9.14+dfsg-1.3ubuntu3.8`, and Ubuntu 26.04 Resolute is listed “Not affected.” This makes an Ubuntu base a reasonable experiment, but does not prove the resulting image passes Trivy or that all other findings are fixed. ([Ubuntu CVE-2026-6653](https://ubuntu.com/security/CVE-2026-6653))

The worker is deliberately non-root (`10001:10001`), has `chromiumSandbox: true`, no container network, all Linux capabilities dropped, and uses the repository's user-namespace-enabled seccomp profile (`standalone/browser/Dockerfile`, `standalone/browser/src/worker.mjs`, `standalone/browser/deploy/compose.example.yml`). These are required acceptance properties for any image candidate; do not trade them for a scan pass.

## Candidate image baselines and digest availability

**后续实测更正：** 下文有关官方 Playwright 镜像 Node 版本的推断不能作为运行时证据。固定 digest 的 Noble 与 Resolute 镜像在第一轮隔离 CI 实测均为 Node 26.13.0；后续候选另行安装 Node 24。各轮真实版本与扫描结论以 [Browser 验收记录](standalone-browser-worker-results-2026-11-02.md) 为准。

1. **Trixie / Node official image.** The exact pinned current baseline is known and reproducible from the CI log. Rebuilding it with package refreshes is the lowest-change experiment, but Debian currently still marks the Trixie libxml2 package vulnerable for CVE-2026-6653, so do not expect the CRITICAL to disappear from an OS scan simply because apt upgraded. A newer Trixie tag should be resolved to a digest and recorded before comparison; mutable tags alone are not a result.
2. **Ubuntu 24.04 Noble.** Playwright's official `mcr.microsoft.com/playwright:v1.64.1-noble` image has an OCI index digest published by Microsoft's Artifact Registry. The registry listing observed during this research showed digest `sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f` (published 2026-11-01); verify the registry digest again at run time before pinning because tags can be republished. ([Microsoft Artifact Registry](https://mcr.microsoft.com/product/playwright))
3. **Ubuntu 26.04 Resolute.** The official `mcr.microsoft.com/playwright:v1.64.1-resolute` OCI index digest was listed as `sha256:f76885029244e5a384243a930ff283cef67d90653978ee27a77dd4cff8882fb4` (published 2026-11-01). The registry page also listed an amd64-specific artifact. Verify digest and architecture at run time. ([Microsoft Artifact Registry](https://mcr.microsoft.com/product/playwright))
4. **Playwright image compatibility.** Playwright's Docker documentation says the official images include browsers and system dependencies, but not the Playwright package; it recommends matching the package version to the image version. Version `1.64.1` matches this worker's `playwright-core` dependency. The official Dockerfile installs Node 24 and provides Chromium; current Playwright docs list Noble and Resolute images. ([Playwright Docker docs](https://github.com/microsoft/playwright/blob/main/docs/src/docker.md), [official Noble Dockerfile](https://github.com/microsoft/playwright/blob/main/utils/docker/Dockerfile.noble))
5. **Sandbox caveat.** Playwright documents that root disables Chromium sandbox and recommends a separate `pwuser` with an appropriate seccomp profile for untrusted sites. This worker must preserve its own unprivileged UID, `chromiumSandbox: true`, and current seccomp policy. Its code defaults to Playwright's browser path unless `CHROMIUM_PATH` is set; the present Dockerfile explicitly sets `/usr/bin/chromium`. The official image's browser is under `/ms-playwright`, so using that image requires testing its executable discovery, permissions and sandbox under the existing Compose restrictions before treating it as compatible. ([Playwright Docker docs](https://github.com/microsoft/playwright/blob/main/docs/src/docker.md))

## Independent CI comparison proposal

Use a new, manually dispatched or path-isolated workflow that cannot publish or mutate production. Keep the existing acceptance workflow unchanged while collecting evidence:

1. Build three image variants from the same checked-out source revision and identical worker Docker context: (A) current exact Trixie digest, (B) a digest-pinned Node 24/Noble base, and (C) `mcr.microsoft.com/playwright:v1.64.1-noble` or `-resolute` as a base. For C, add only the worker application files and preserve current runtime UID, environment, capability drops, no-network setting, read-only filesystem, and seccomp profile. Record source SHA, base index and platform digest, final image ID, package inventory, and `trivy --version`.
2. Run the same Trivy version, DB snapshot/cache, flags (`--scanners vuln`, `--vuln-type os,library`, `--severity CRITICAL,HIGH`, include unfixed), platform (`linux/amd64`), and output format for all variants. Save full JSON and table outputs as CI artifacts. Compare by package/CVE/status/fixed version and base layer rather than only comparing totals. Never suppress findings or delete scanner DB state.
3. Run all existing worker module/syntax checks, actual Chromium startup, sandbox proof, fixture E2E, and network/host-bridge isolation checks against each candidate. A lower scan count alone is not acceptance; require same runtime proof and no reduction in isolation.
4. Only after comparison, select an immutable base digest and make the product change separately. Do not publish/deploy from this research workflow.

## Conclusion

The observed block is an OS-image finding rooted in the chosen Debian Trixie package set, especially a CVE that Debian still classifies vulnerable without a Trixie security fix. The application dependency scan is clean. Ubuntu 24.04 and 26.04 Playwright images are available as pinned-digest comparison candidates, and they align with Node 24 / Playwright 1.64.1, but the bundled-browser path and strict Chromium sandbox contract still need a real isolated acceptance run before selection.

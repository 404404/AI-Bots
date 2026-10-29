# GK50 automated deployment and acceptance

The application-defined runner connects GitHub's production GUI gate to a dedicated GK50 Compose project. DSH continues to own all Bot, Session, Channel, Profile and credential state. The runner records deployment evidence; it does not create a second application database.

## One command

From a clean checkout of the pushed fork branch on GK50:

```bash
node deploy/gk50-release.mjs --publish --execute --deploy-only
```

This checks the target and ports, confirms the fork branch matches the local commit, triggers `gui-container.yml`, waits for it, downloads the release receipt, pulls the accepted digest and waits for container health. Detailed acceptance is a separate invocation after deployment. The image runs as its named `dsh` account, UID/GID `10001:10001`. The runner uses noninteractive `sudo chown` on the newly created empty data directory only; it stops if that permission is unavailable. GitHub and GHCR authentication must already exist on the machine; the script never requests, copies or prints credentials. A failed workflow stops before pulling or starting the application.

To use an already published candidate without rebuilding:

```bash
# Read-only preflight (private temporary receipt download only).
node deploy/gk50-release.mjs --run-id <successful-publishing-run>
# Deploy that exact candidate and wait for health.
node deploy/gk50-release.mjs --run-id <successful-publishing-run> --execute --deploy-only
# Independently run acceptance against that installed candidate.
node deploy/gk50-release.mjs --run-id <successful-publishing-run> --accept --execute
```

The default private directory is `.local/gui-deployment/`, excluded from Git and Docker build context. Use `--root <new-directory>` to choose another directory. This first-install runner rejects existing directories or an existing `deepseekbot-gui` project/container; it does not perform unattended upgrades or replace an existing Profile. It creates no recurring service, webhook or automatic branch watcher.

## Release and deployment gates

1. CI builds once, scans the runtime image and runs the production seccomp profile, shared-display and authenticated CLI/restart checks. Only that loaded image is tagged and pushed; publication does not rebuild it.
2. A successful run publishes a `gui-release-<run-id>` artifact containing its repository, commit, image digest, tested image ID, and SHA-256 hashes of Compose and seccomp files. The deployment runner checks the receipt against the successful GitHub run and current configuration bytes.
3. GK50 pulls by digest. The runner hashes the original registry manifest bytes, requires its config digest to equal the tested CI image ID, and checks the local repository digest, revision label, Linux OS and amd64 architecture. Classic Docker may expose the config digest as its image ID, while the GK50 containerd store exposes the manifest digest; either must belong to that verified chain. Multi-platform indices are refused by this single-platform release path. Compose starts with `--no-build --pull never`.
4. The first unused port among `20443`, `21443`, `22443` is selected. Port `1455` must be free for the loopback Codex callback. Both ports remain loopback-bound. No proxy, firewall or other Compose project is modified.
5. The runner waits for health. With `--deploy-only`, it records `deployed-awaiting-acceptance` and stops here. During separate `--accept --execute` acceptance (or a combined deployment without `--deploy-only`), it opens a visible Browser fixture and verifies Computer clicks, text entry and screenshot on the same display. Both Chromium sandbox layers must report enabled, and every observed renderer must have Seccomp filtering and match the DevTools inventory.
6. During acceptance it creates a clearly named acceptance Bot/DM through the existing authenticated Host RPC, runs the CLI suite, restarts only this container and requires explicit `host-unauthorized` for the old token. The fresh token must authenticate and the same Bot IDs must survive; the CLI suite runs again.

On initial deployment failure the runner stops its own candidate and retains the directory, data and report for diagnosis. It never deletes data, disables Chromium sandboxing, changes NAS privileges or silently retries with a weaker policy. A stop failure is explicitly reported for intervention. A separate acceptance attempt preserves the existing deployment for diagnosis on failure. The shell exit status is nonzero on infrastructure failure.

## Evidence and scope

`deployment.json` records the deployment result. `acceptance.json` contains stage, timestamps, image identity, checks, coded failure and mutations. Each attempt retains a timestamped report and its own `evidence/<attempt>/` directory containing GUI, CLI and restart reports plus a desktop screenshot. Files are private and do not contain launch tokens or OAuth credentials. Progress events go to stderr; the final JSON goes to stdout.

`status: infrastructure-passed` qualifies the automated infrastructure checks only. `fullAcceptance: incomplete` and `remaining` keep separate requirements visible:

- Real Codex OAuth sign-in, a model reply, an actual Bot Browser tool call and another call after Host restart. A Human must grant the initial OAuth login; no existing Codex session is copied into the container.
- Nonempty Session/Assignment pagination and Assignment details, which the empty CLI fixture cannot establish.

DSM is outside this delivery: on 2026-10-28 the Human narrowed the target to GK50 only. The product runs as one self-contained Host container and does not depend on another deployment.

## Docker image identity compatibility

On GK50, the first pull of run 40761954987 stopped before container creation because Docker exposed the manifest digest as `image inspect`'s ID, while the CI receipt recorded the config digest. The fixed manifest's config descriptor matched that receipt exactly. Commit `b37d6c74` verifies this complete relationship for deployment and separate acceptance, rather than comparing unlike IDs. The failed attempt's empty data directory and report were preserved; no running service was replaced.

The raw-byte read uses Docker's documented [`imagetools inspect --raw`](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/) interface. Docker documents the distinct [containerd image store](https://docs.docker.com/engine/storage/containerd/); the ID difference above was observed directly on GK50. The deployment machine needs the Docker Buildx plugin. Registry lookup or identity mismatch fails closed.

## Named runtime account

A subsequent startup stopped because the runner used GK50's login UID `1001`, which has no passwd entry in the image: D-Bus refused the unknown user. Commit `4142f2de` sets the same named UID/GID `10001:10001` used by CI and assigns only the newly created empty data directory to it. The existing Compose and seccomp bytes and published image remain unchanged. The failed Profile was archived intact before removing only its stopped candidate container; deployment retried into a new empty directory. Deployment helper tests now cover rejection of host-UID substitution, with 33 tests passing.

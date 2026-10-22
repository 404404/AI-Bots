# Linux GUI Host: GK50 deployment

This Compose project runs the DSH Web Host, DeepSeekBot, a visible Chromium Bot Browser, and the local Computer desktop in one container. DSH continues to own the Profile, Bot, Session, Assignment, Channel, Activity, credentials, and runtime state. The image adds no DevBoard database and exposes no unauthenticated API.

**Release gate is currently blocked.** The latest CI candidate [run 39867953548](https://github.com/404404/AI-Bots/actions/runs/39867953548) built and passed Trivy, but production Chromium stopped before DevTools after `chroot:EPERM`. The unpublished CI-only chroot+clone diagnostic verified Browser/Computer shared-display interaction and reported Namespace Sandbox plus Seccomp-BPF enabled, but the renderer process seccomp check failed. No image was published. Treat this file and the Compose files as deployment samples only; wait for an accepted immutable GHCR digest before pulling or deploying. See the [acceptance record](gui-container-acceptance.md) for current evidence.

## Before starting

- Use the exact GHCR image digest printed by the release workflow, in the form `ghcr.io/404404/ai-bots@sha256:<digest>`. Do not use `latest` or another moving tag.
- Check `20443`, then `21443`, then `22443` on GK50. Set `HOST_PORT` and `PUBLIC_URL` to the first unused port. Current availability was not checked because deployment has not started.
- Set the data directory owner to the UID/GID that Compose runs as. Use `id -u` and `id -g` on the host where you deploy.
- Allow at least 2 GB RAM for the container and keep free space for DSH Home, Browser profiles and backups.

## Install with Compose

Copy `deploy/compose.gk50.yml`, `deploy/.env.example` and `deploy/chromium-userns-seccomp.json` to a dedicated directory, then create a private data folder:

```bash
mkdir -p ~/deepseekbot-gui/data
cd ~/deepseekbot-gui
cp compose.gk50.yml compose.yml
cp .env.example .env
chmod 600 .env
```

Edit `.env`: set `IMAGE_REF` to the published `@sha256:` reference and set `PUID`/`PGID` to the data directory owner. Use the first free port from `20443`, `21443`, and `22443` for both `HOST_PORT` and `PUBLIC_URL`. The compose file maps the data directory to `/data/dsh` and does not mount the Docker socket, host home, or system configuration.

```bash
install -d -m 700 -o "$(id -u)" -g "$(id -g)" data
docker login ghcr.io
docker compose -f compose.yml pull
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

For a local browser, open the one-time Host URL printed by this command:

```bash
docker compose -f compose.yml exec deepseekbot-gui node /opt/app/deploy/show-launch-url.mjs
```

That URL contains a short-lived launch token. Do not paste it into chat or save it in shell history. For remote access, create a tunnel from the computer running the browser:

```bash
ssh -N -L 20443:127.0.0.1:20443 hermes@GK50
```

Then use the Host URL through `http://127.0.0.1:20443`. The server also requires DSH's authenticated session; this loopback publishing is not a public API. The Codex browser-login callback also uses loopback port `1455`; its Compose mapping is loopback-only. Forward it only when choosing Browser login:

```bash
ssh -N -L 20443:127.0.0.1:20443 -L 1455:127.0.0.1:1455 hermes@GK50
```

Device-code login does not need the callback port. A Host restart invalidates its launch token. Run the command again to get a fresh URL.

## Codex Auth

The GUI Profile includes `dsh-codex-oauth` pinned to commit `3f4fdec20ab4d1e93fa60954f6687c3d01bb4241`. It adds the DSH Settings login/status/logout card and declares the existing `llm-pi-ai` `openai-codex` route as keyless. DSH's `CredentialProvider` and existing pi-ai flow own the OAuth record and refresh; the container adds no credential database or `~/.codex/auth.json` mount. Open **Settings → Codex Login**, then choose Browser login (use the port-1455 tunnel above) or device-code login. Select an `openai-codex` model separately for a Bot's main route or its Assignment route.

This third-party plugin drives DSH's existing ChatGPT/Codex OAuth flow. Its device-authorization endpoint is not a published OAuth API, so upstream changes may affect sign-in. Its security notes also warn that refresh-token rotation may invalidate an older session created by another Codex CLI using the same OAuth client. Live acceptance must use a real account and verify a model response, a Browser tool call, and a new call after Host restart; container health alone does not qualify Codex Auth.

## Online CLI acceptance

The online CLI uses a private token file inside the container. The file lives under `/tmp`, is mode `0600`, and is recreated by DSH after each restart. Run the read-only acceptance suite with a real Bot slug and, when available, a real Channel ID:

```bash
docker compose -f compose.yml exec -T deepseekbot-gui \
  node /opt/app/scripts/e2e-cli-readonly.mjs \
  --launch /tmp/dsh-runtime/launch.json \
  --bot <stable-bot-slug> --channel <channel-id> \
  --output /tmp/dsh-runtime/cli-readonly.json
```

The report includes list/detail, Session paging, Assignment paging/detail, Activity, Channel Timeline cursors, coded errors, IDs, timestamps and revisions. It deliberately excludes message bodies, tokens and credential fields. The DSH RPC methods remain the source of truth. After Host restart, this GK50-side runner checks that the old launch token is rejected, the new online CLI authentication works, health RPCs recover, and the same Bot IDs return:

```bash
node /path/to/AI-Bots/scripts/e2e-cli-host-restart.mjs \
  --compose-file /path/to/compose.yml --env-file /path/to/.env \
  --output ./acceptance-host-restart.json
```

The output is a mode-`0600` JSON acceptance record. `botCount: 0` confirms service recovery but does not provide per-Bot persistence coverage; run the full read-only suite after at least one Bot and Channel exist.

## Chromium sandbox and shared display

The image starts one Xvfb server at `:99` and one Openbox window manager. The DSH Host, Browser runtime and Computer driver inherit the same `DISPLAY`, `XAUTHORITY` and D-Bus session. Browser is configured with `headless: false` and `/usr/local/bin/deepseekbot-chromium`; the wrapper selects Chromium's user-namespace sandbox with `--disable-setuid-sandbox`, and Computer uses DSH's local-display target. It does not pass `--no-sandbox`, `--privileged`, `SYS_ADMIN`, host networking, or `seccomp=unconfined`. Compose drops all Linux capabilities and sets `no-new-privileges`. The checked-in seccomp profile is based on [Docker's default profile at pinned Moby profiles commit `6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef`](https://github.com/moby/profiles/blob/6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef/seccomp/default.json) and adds only `clone`/`unshare` calls whose flags include `CLONE_NEWUSER`, which Chromium uses for its unprivileged user-namespace sandbox. Other namespace calls remain denied unless they create that user namespace. The profile does not turn off seccomp. Acceptance requires both `Namespace Sandbox` and `Seccomp-BPF sandbox` to report `Yes` at `chrome://sandbox`.

Verify a real Browser window and Computer desktop using the GUI acceptance procedure in [the acceptance record](gui-container-acceptance.md). Chromium must start without a sandbox-disabling flag. If the kernel or DSM blocks user namespaces, record the failure and stop; do not work around it by disabling the sandbox, using an unconfined seccomp profile, or adding broad capabilities.

Run the included low-level desktop acceptance in the Host container. It opens a local fixture in visible Chromium with the production Browser launch flags, checks `chrome://sandbox`, then asks the pinned Computer CUA driver to locate that window, click and type into the fixture, and capture the same X11 desktop:

```bash
docker compose -f compose.yml exec -T deepseekbot-gui \
  node /opt/app/deploy/e2e-gui-shared-display.mjs
```

The report confirms Computer saw the Browser fixture title, its click and typed marker reached the page, and it returned a desktop screenshot; it also records Chromium's Seccomp-BPF status. This low-level smoke test does not grant Browser or Computer access to any Bot or invoke a model; test a chosen Bot separately through the authenticated CLI/device flow.

## Network boundary

This Compose project is a trusted, single-user proof of concept. It binds the Web Host to loopback and requires DSH authentication, but it does not filter container egress. A Bot or page opened by Chromium can reach network services that the container can reach, including LAN and link-local services. Do not use this setup for untrusted Bots or multi-user hosting, and do not treat the loopback binding as an egress control. A production deployment needs a reviewed network policy that blocks private, link-local and cloud-metadata destinations while preserving required model endpoints.

## Upgrade, backup and restore

Upgrade by replacing only the digest in `.env`, then run `docker compose pull` and `docker compose up -d`. Keep the previous digest for rollback. Do not remove the `data` directory during an image upgrade.

Back up the complete `/data/dsh` volume while the container is stopped so SQLite and DSH's credential owner are captured together:

```bash
umask 077
docker compose -f compose.yml stop
tar -C data -czf "dsh-home-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" .
docker compose -f compose.yml start
```

The archive contains private DSH state and credentials. Keep it in an access-controlled location. Restore only into an empty data directory owned by the configured PUID/PGID, and preserve the image digest recorded with that backup.

## Scope

This guide describes the Linux GK50 compose file. Synology's sample remains unverified against an actual DSM/Container Manager device; use the separate [Synology status page](deployment-synology.md). The exact current check results are in [GUI Container acceptance](gui-container-acceptance.md).

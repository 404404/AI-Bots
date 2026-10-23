# GK50 preflight snapshot

Read-only host and repository checks captured on 2026-10-23 at 07:24 Asia/Shanghai. This is a point-in-time snapshot; repeat port and capacity checks immediately before any Compose start.

## Repository

| Item          | Observed value                                                                       |
| ------------- | ------------------------------------------------------------------------------------ |
| Fork          | `https://github.com/404404/AI-Bots.git`                                              |
| Upstream      | `https://github.com/BotHarness/DeepSeekBot.git`                                      |
| Branch / HEAD | `feature/gui-container-codex-prototype` / `08e8fcd4217faa55036fc266924b84fb1cfb6fb5` |
| Worktree      | Documentation updates pending after CI run 39879550251                               |

The initial snapshot recorded a timed-out `git ls-remote` probe. The feature branch was subsequently pushed to the fork and GitHub Actions checked out commit `08e8fcd4217faa55036fc266924b84fb1cfb6fb5` for run 39879550251. No proxy, route, firewall, DNS, Docker daemon, or existing service setting was changed. No project image was pulled or deployed.

## Host and Docker

| Item                     | Observed value                                                |
| ------------------------ | ------------------------------------------------------------- |
| Host / OS                | GK50 / Ubuntu 24.04.4 LTS                                     |
| Kernel / architecture    | Linux 6.8.0-138-generic / x86_64                              |
| CPU                      | 4 vCPU                                                        |
| Memory                   | 7.58 GiB total; about 5.69 GiB available during the snapshot  |
| Swap                     | About 1.91 GiB total; about 0.75 GiB free during the snapshot |
| Root filesystem          | About 114.4 GiB total; about 56.8 GiB free                    |
| Docker Engine / Compose  | 29.7.2 / 5.5.0                                                |
| Docker storage / cgroups | `overlayfs` / cgroup v2, systemd driver                       |
| Docker security options  | Built-in seccomp, AppArmor, cgroup namespace                  |

The visible existing services were the HermesStatus server, client and proxy, plus DDNSTO. The server was healthy; the other visible containers were running. Their observed memory use was approximately 50 MiB, 31 MiB, 3 MiB and 5 MiB respectively. No project container was started, stopped, pulled or rebuilt during this audit.

The proposed Compose limit of 1.5 CPU and 2 GiB RAM fits the observed capacity snapshot, but it has not been exercised on this host. The image and GUI runtime still need their own acceptance run before deployment.

## Candidate ports

| Port  | Snapshot result                           |
| ----- | ----------------------------------------- |
| 20443 | No listener observed; first candidate     |
| 21443 | In use by the existing HermesStatus proxy |
| 22443 | No listener observed; second candidate    |

The Compose sample binds the web port to host loopback. It must be rechecked immediately before deployment; use 20443 if it is still free, otherwise 22443. Do not use 21443.

## Release and deployment gate

- There is no accepted immutable GHCR image digest for this candidate. Run 39879550251 passed image build and Trivy, but its production Chromium sandbox gate failed; the publish job was skipped. The CI-only `chroot + CLONE_NEWPID` control passed the GUI and renderer sandbox checks.
- Commit `08e8fcd4217faa55036fc266924b84fb1cfb6fb5` is confirmed on the fork's feature branch. No GUI image pull or deployment occurred.
- GK50 Compose deployment is therefore pending. No project data directory or Compose-managed container was created by this preflight.
- Codex OAuth real tool-call verification and RS820+/DSM verification remain pending. The DSM host and version were not available in this session.

See [GUI Container acceptance](gui-container-acceptance.md) for the detailed CLI, restart, Browser/Computer, Chromium sandbox, Codex Auth and DSM results.

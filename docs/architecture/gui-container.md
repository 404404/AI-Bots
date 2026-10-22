# GUI Container ownership and network boundary

The optional Linux GUI Host packages the existing DeepSeek Harness (DSH) Host and DeepSeekBot Profile with one X11 desktop. It changes deployment packaging and does not introduce a second control plane.

```text
Browser client
   │ SSH tunnel to 127.0.0.1:20443
   ▼
DSH Web Host ── one-time launch token → DSH authority cookie
   │ authenticated DSH RPCs
   ├── Bot / Session / Assignment owners
   ├── Channel Timeline / Activity owners
   ├── DSH credential provider
   ├── Browser runtime ──────────┐
   └── Computer local driver ────┴── DISPLAY=:99, Xvfb + Openbox

Persistent bind: /data/dsh → existing DSH Home/Profile owners
Ephemeral: /tmp/dsh-runtime → launch token file and X11 authority
```

## State and API ownership

Bot, Session, Assignment, Channel, Timeline, Activity, and credentials continue to be read or changed through the current DSH Host owners and RPC methods. Online CLI commands authenticate to that Host and do not open the Profile database directly. Assignment CLI paging applies the owner's existing order to the Host response and returns an opaque continuation cursor. The container does not add a DevBoard schema, copied data store, or unauthenticated public endpoint.

The `/data/dsh` bind mount contains DSH Profile state and credential records. The launch-token file and X11 cookie are private, ephemeral runtime files under `/tmp`; Host restart invalidates the old launch token. The Compose port binds to loopback and a remote Human reaches it through SSH forwarding.

## One desktop for Browser and Computer

The entrypoint creates a single Xvfb display (`:99`) and private X11 authority file. It starts Openbox and DSH inside the same D-Bus session. The container Profile overlays only its Browser settings (`headless: false`, `/usr/local/bin/deepseekbot-chromium`) while retaining Computer's existing local-display target. The wrapper disables only Chromium's setuid sandbox; acceptance still requires the user-namespace and Seccomp-BPF sandboxes to report enabled. Browser's visible Chromium process and Computer's pinned local CUA driver inherit the same display and D-Bus variables.

The image fetches the repository-pinned Linux CUA driver asset during the image build and checks both the archive and executable SHA-256 values. Compose drops all Linux capabilities, sets `no-new-privileges`, retains Docker's default AppArmor profile, and applies the checked-in Docker-default-derived seccomp profile. That profile adds only namespace creation calls whose flags include `CLONE_NEWUSER`; all other calls remain under the default-deny policy.

The sample limits inbound access but does not filter container egress. Treat it as a trusted, single-user proof of concept: a Bot or visited page can reach destinations available to the container, including private and link-local services. Production hosting needs a reviewed egress policy before it accepts untrusted Bots or multiple users.

## Upgrade boundary

The image reference is an immutable GHCR digest. Upgrading replaces the image only; the DSH Home bind mount remains in place. A missing GUI Profile is seeded only into an empty dedicated data directory. Existing unrelated DSH Profile directories are never replaced automatically.

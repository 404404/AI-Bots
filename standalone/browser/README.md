# Isolated browser worker (prototype)

This directory is an independent Node 24 + Chromium worker and strict egress proxy prototype. It has no BotHarness or DSH dependency and is not wired into the main app. The only supplied deployment target is the disposable `fixture.test:8081` fixture. Do not add production origins until the owning application supplies explicit exact-origin and static-IP policy.

## Design and limits

- The Chromium worker uses Docker `network_mode: none`. It has only loopback and reaches the proxy through a local HTTP relay backed by a private Unix socket. Chromium is launched with `--proxy-bypass-list=<-loopback>` and `--host-resolver-rules=MAP * ~NOTFOUND`. There are no published container ports.
- The proxy is attached to an internal fixture network and a separate outbound bridge. Each HTTP request and CONNECT checks an authenticated lease, exact origin, current DNS result, and membership in the configured fixed IP set; the actual HTTP lookup or TCP connection uses the checked address. Private and LAN addresses are refused unless an exact configured rule opts in. Cloud metadata, loopback, link-local, multicast and reserved ranges are always refused.
- HTTPS CONNECT is pinned and origin-checked, but its encrypted path and TLS redirects cannot be inspected by the proxy. Playwright checks each browser request/redirect before continuing it. WebSockets are closed at the browser route and proxy upgrade layers; uploads and downloads are disabled.
- The worker exposes only navigate, read, click, type, scroll, screenshot, cancel and close. Page text is returned as untrusted content. It does not accept arbitrary JavaScript, filesystem paths, upload data, or caller-provided proxy settings. Contexts are isolated per session and bound to Bot/task identifiers supplied by a trusted adapter. The internal gateway bearer token is a service credential; never put it in a page, URL, model prompt, or logs.
- Leases expire within two minutes, allow at most 12 operations and four concurrent contexts, and operation IDs are idempotent. Session screenshots live in a private temporary directory and are deleted on close/expiry/reap. The proxy lease table is in memory. A process restart intentionally loses active sessions.
- Session creation requires a caller-generated `operationId`; retrying it with the same scope and options returns the same session. Reusing it with different options is a conflict. Operation fingerprints use canonical object-key ordering. The proxy bounds leases, per-lease connections, CONNECT bytes and lifetime, aborts HTTP upstream work when its client disconnects, and closes tracked tunnels on lease expiry or revoke.
- Startup fails unless there are no non-loopback interfaces, configured host bridge gateway port probes return network-unreachable outcomes, and the private `chrome://sandbox` probe contains the exact `Layer 1 Sandbox Namespace` (or `Namespace Sandbox Yes`), `PID namespaces Yes`, and `Seccomp-BPF sandbox Yes` rows. Missing, negative, or ambiguous rows fail closed. The bridge probe checks the configured port list only; it is evidence for those ports and this container namespace, not a general host firewall proof. Do not remove the probe or infer isolation from Docker `internal: true` alone. No host firewall or daemon settings are changed here.
- The supplied compose sample also places the gateway on an internal-only network and exposes no host port. A deployment must provide its own authenticated upstream/control ingress and evaluate whether that ingress can reach host services. The example secrets are required environment placeholders; they are not defaults.
- Renderer sandboxing, the private UDS boundary, and normal web-page access restrictions are configured, but this prototype has not been penetration-tested against a Chromium browser-process compromise. The worker and Chromium share a container UID; do not treat the worker’s Unix sockets as a defense against a full browser-process escape.

## Local checks

Requires Node 24.21.0 or newer. From this directory:

```sh
npm ci
npm test
node --check src/policy.mjs
node --check src/proxy.mjs
node --check src/worker.mjs
node --check src/gateway.mjs
```

The unit suite uses fake-browser business-contract tests and loopback/UDS proxy tests; it does not prove Chromium sandboxing or container network isolation.

## Container fixture run

This is a runnable sample, but has not been built or run in this development task. It requires Docker Compose, a host that permits Chromium’s approved user-namespace/seccomp sandbox, and unique random values for both service tokens:

```sh
export BROWSER_CONTROL_TOKEN="$(openssl rand -hex 32)"
export BROWSER_PROXY_ADMIN_TOKEN="$(openssl rand -hex 32)"
export SOURCE_REVISION="$(git rev-parse HEAD)"
docker compose -f deploy/compose.example.yml --profile e2e up --build --abort-on-container-exit --exit-code-from e2e
docker compose -f deploy/compose.example.yml down
```

Each image records `org.opencontainers.image.revision=$SOURCE_REVISION` and the MIT/Apache-2.0 SPDX license expression. The Docker build context contains this worker's `LICENSE` and `NOTICE.md`; npm is removed from the runtime image after dependency installation. The authorized fork-only workflow saves worker, proxy, gateway, and fixture images as one fixed-name Docker archive, then writes a schema-versioned record containing the fork, product, workflow run, source revision, unpublished state, independent passing gates, per-image platform/config digest, and archive SHA-256. It never pushes a registry tag. Use the exact artifact revision and archive checksum for review; this artifact is not a release.

Before accepting deployment, independently verify the built image, Chromium sandbox probe, direct worker-to-host-bridge probes for the deployment’s actual gateway and sensitive ports, that the worker has no non-loopback interface, and that only the proxy can reach the fixture/approved static IPs. `internal: true` does not by itself prove that a container cannot reach host bridge INPUT services. If any direct host service probe connects, times out, or gives an inconclusive result, worker startup fails; do not broaden probe success criteria. This prototype has not yet demonstrated those container-level claims.

## Integration contract

A future trusted Host adapter must authenticate its caller, derive Bot/task ownership from trusted execution context, enforce the product’s owner/consent policy, and pass only that derived scope to this gateway. The gateway’s bearer token is a private service credential, not end-user authorization; keep it in the adapter’s secret store and never put it in model arguments, pages, URLs, or logs. `POST /v1/sessions` accepts `{operationId, botId, taskId, leaseMs?, allowedOrigins}` and returns `{operationId, sessionId, taskId, expiresAt, stepBudget}`. Operations accept `{botId, taskId, sequence, operationId, action, args}` for `navigate`, `read`, `click`, `type`, `scroll`, `screenshot`, or `close`; result text is untrusted page content. Retrieve screenshot bytes using `POST /v1/sessions/{sessionId}/screenshots/{resourceId}` with the same trusted Bot/task scope. Cancel and close also require that scope. Map these same operations to CLI and Web, and authorize every screenshot resource against the same Bot/task. Configure exact target origins and fixed IPs out-of-band; do not allow a model or browser page to edit the egress policy. This prototype is not connected to the application and is not delivered as an app feature.

## Dependency and source note

The worker uses the pinned `playwright-core@1.64.1` package without vendoring its source; its Apache-2.0 license text is retained in `/usr/share/doc/browser-worker/playwright-core-LICENSE`. The independent MIT license and project notice are also copied into the image. Chromium is installed from the selected Debian base distribution at image build time and retains its upstream licensing; the apt repository package version is not pinned in this prototype, so record and pin the built image digest before deployment. The seccomp profile is copied unchanged from `deploy/chromium-userns-seccomp.json` (SHA-256 `a8ec691e2b21a15ccc4ab1d1af7284f900a334887936403ff3b4b51beead1ee4`). This prototype does not copy or depend on the old GUI/DSH image.

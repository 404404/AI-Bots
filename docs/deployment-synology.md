# Synology DSM deployment sample

The repository includes [`deploy/compose.synology.yml`](../deploy/compose.synology.yml) for DSM Container Manager. It keeps the DSH Home under one bind-mounted `/volume1/docker/deepseekbot/data` directory and binds the service to loopback, so remote browser access requires an SSH tunnel. Set the share owner in `.env` with the matching `PUID` and `PGID`, and use a verified free port from `20443`, `21443`, or `22443`.

Example folder layout:

```text
/volume1/docker/deepseekbot/
  compose.synology.yml
  .env
  data/                 # persistent DSH Home; do not replace on upgrade
```

Set `IMAGE_REF` to the exact GHCR digest. Set `PUBLIC_URL` to the same loopback port as `HOST_PORT`. Import the Compose project in Container Manager and review its resource limits before starting it.

Codex Browser login uses the loopback callback on port `1455`; forward it only through SSH when using that login method. Device-code login avoids this callback. The pinned DSH plugin stores the OAuth grant through the native DSH CredentialProvider. Its unpublished device-authorization endpoint and refresh-token sharing caveat are described in the [GK50 guide](deployment-gk50.md#codex-auth).

## Device verification status

**Not Tested on DSM.** This environment does not have access to a Synology DSM/Container Manager host. Therefore there is no claim that Chromium's user namespace or setuid sandbox works on DSM, that DSM accepts the Compose capability policy, or that Browser and Computer share the display correctly there. Do not disable Chromium's sandbox or relax DSM-wide security settings to make the sample start. Follow the acceptance checklist in [`gui-container-acceptance.md`](gui-container-acceptance.md) on the target DSM device and record its model, DSM/Container Manager versions, image digest and observed results before treating this sample as supported.

The sample binds the Web Host to loopback but does not filter container egress. Treat it as a trusted, single-user proof of concept; do not expose untrusted Bots or pages to network services reachable from the NAS. Production use needs a reviewed policy for LAN, link-local and cloud-metadata destinations.

# Authenticated online read-only Bot CLI

## Sub-features

- Read Bot list and stable Bot details through the authenticated DSH Host.
- Page bounded Session summaries and Assignment summaries with opaque cursors; read one Assignment by stable Session ID.
- Read Activity generation/revision and Channel Timeline IDs, timestamps, revision and older/newer cursors.
- Return machine-readable errors with stable codes for unknown Bots and invalid cursors.
- Recover authenticated online CLI access after restarting the isolated Linux GUI Host while retaining DSH-owned Bot IDs.

## How to get to it (user POV)

Run `deepseekbot` with the authenticated Host URL and token supplied by the DSH launcher. Use `--compact` for one JSON document per command. The read-only commands do not open the Profile database and do not create another data authority.

For the Compose image, the private launch file is inside the container at `/tmp/dsh-runtime/launch.json` with mode `0600`. Run the acceptance scripts through `docker compose exec`; never print or copy the token into a report, shell history or chat.

## Driving it with verify-app

This is an online CLI/Host journey rather than a Web UI journey. Against a task-owned Compose Host with at least one disposable Bot and Channel, run:

```bash
docker compose -f compose.yml exec -T deepseekbot-gui \
  node /opt/app/scripts/e2e-cli-readonly.mjs \
  --launch /tmp/dsh-runtime/launch.json --bot <stable-bot-slug> \
  --channel <channel-id> --output /tmp/dsh-runtime/cli-readonly.json
```

Then run `scripts/e2e-cli-host-restart.mjs` against that same Compose service. It captures the Bot IDs, restarts only the named service, waits for the authenticated Host health check, and verifies that the stable IDs are still readable. Keep only the sanitized JSON reports as acceptance evidence.

## Gotchas

- A fresh Host can return valid empty arrays. It cannot prove detail, Assignment detail or paging with real rows; create a task-owned fixture through DSH, and remove only that fixture after evidence is saved.
- Session and Assignment cursors are opaque. Reuse the returned cursor exactly; never synthesize one. Timeline cursor checks run only when that page reports more data.
- Reports omit message bodies, launch tokens and credential fields. Do not substitute raw CLI output, the launch JSON or an unauthenticated HTTP request as evidence.
- The restart check restarts the configured Compose service. Run it only against the task-owned GUI Host, never against the user's existing DSH service.

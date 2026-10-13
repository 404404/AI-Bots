# Secret input in an ordinary Profile

Since [ADR-0189](../../adr/0189-secret-input-is-available-in-ordinary-profiles.md) a PersonaBot can ask for a secret in any Profile. No Docker, no opt-in. This guide covers that default tier. The opt-in Docker-fenced Profile is in the [CLI guide](private-input-cli.md).

## What the Bot can do

| Tool            | What it does                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask_secret`    | Posts an input card in the Channel the request came from. Only the Owner can fill it. The Bot gets back `private:<id>:<field>` references, never values.                                                    |
| `secret_http`   | Calls an HTTP API. The Host sends the request to the endpoint the Owner typed into the card; the Bot chooses a path under it, the method, and `{{field}}` placeholders for secrets in headers, query, body. |
| `protected_cli` | The fixed `http-status-v1` check: one GET, returns only the status code.                                                                                                                                    |

Both consumers need the existing Human execution approval. The approval card shows references and placeholders, not values.

## What protects the secret

- Values live in DSH's native credential store, bound to the requesting Bot and account. Another Bot cannot use them.
- Channel history holds the request and the references only.
- `secret_http` never sends a secret anywhere but the Owner-entered endpoint. Redirects are refused. Plain http is accepted only for a local address. The endpoint may carry its own query string, which stays on every request and is masked in the response like a secret. A request the Host refuses before sending comes back as `refused` with the reason, so the Bot can explain it. Secret values are masked in the returned text in raw, base64 and URL-encoded form; that masking is a courtesy, not a boundary.
- An Agent cannot read the credential store. DSH runs every Shell command inside an OS sandbox, and the Host adds a rule that the store is unreadable: a Seatbelt rule on macOS, an empty-file mask under bwrap on Linux. Agent file tools that target the store, and Shell commands that name it, are refused before any approval card.

## Limits

The sandbox rule does not exist in three cases, where only the refusal by command text applies and a command that reaches the file indirectly is not recognised:

- a command run in `danger-full-access` mode, which DSH does not sandbox;
- Linux hosts where DSH uses the Landlock runner instead of bwrap;
- Windows, whose DSH sandbox does not confine reads.

The Host logs a warning the first time a sandbox runner gets no rule. `scripts/test/dsh-sandbox-shape.test.mjs` fails when a DSH upgrade changes the runner command line this depends on; adapt `credentials/store-guard.ts` then.

Only HTTP APIs are covered. A command-line tool that needs a secret in its environment is not.

## Owner CLI

The `deepseekbot` live commands work in an ordinary Profile exactly as in Web Chat: `ask-secret-status`, `ask-secret-submit --values-stdin`, `ask-secret-cancel`, `ask-secret-account-status`, `ask-secret-replace`, `ask-secret-revoke` and `ask-secret-accounts`. Decide the `secret_http` approval with `tool-approval-decide`. See [the CLI reference](../../bot-cli.md).

## Verify locally

Use an isolated DSH home and synthetic values only.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 31380
node scripts/ask-secret-fixture.mjs 31381
```

Open the printed Web URL, select a PersonaBot with a working model, and send in its DM or mention it in a Group:

```text
Call ask_secret for account synthetic-http, with three required fields:
endpoint labeled API address, api_key labeled API key, api_secret labeled API secret.
After I submit, use secret_http: GET /status?marker=SYNTHETIC-1380-url-A with header
x-api-key set to {{api_key}} and x-api-secret set to {{api_secret}}.
Tell me the HTTP status and what the response contains.
```

Fill the card with these synthetic values:

| Field       | Synthetic value           |
| ----------- | ------------------------- |
| API address | `http://127.0.0.1:31381`  |
| API key     | `SYNTHETIC-1380-key-A`    |
| API secret  | `SYNTHETIC-1380-secret-A` |

Expect: the card appears in the Channel you asked in; after submission its fields clear; the approval card for `secret_http` shows the path, placeholders and `private:` references; the Bot reports status 200 and a body in which the key, the secret and its base64 form read `[secret]`; `http://127.0.0.1:31381/evidence` shows `authenticated` incremented; no Channel message contains either synthetic secret.

To check the store guard, ask the Bot to run `wc -c <isolated-DSH_HOME>/.credentials.yaml`. It is refused without an approval card. A command that names the file indirectly reaches the sandbox rule and fails with `Operation not permitted` on macOS. Under bwrap the read fails with `Permission denied`; that was run in a Linux container against the command line DSH builds, for the read-only and workspace-write policies, not through a full Host on Linux.

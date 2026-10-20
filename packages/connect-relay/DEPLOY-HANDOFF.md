# Handoff: first deploy of the Connect relay (#2410)

Deploy `packages/connect-relay` to Cloudflare at `connect.botharness.ai` and confirm it answers. `scripts/deploy.sh` does every step. You only supply two WorkOS values and run it on the owner's Mac.

## Already checked

- `wrangler whoami` is signed in with OAuth and lists account `332e72d480d7cb3e60ee671d3ca0cad0`, which owns botharness.ai and matches `wrangler.jsonc`.
- No D1 database named `botharness-connect-relay` exists yet. The script creates it.
- `~/.config/deepseekbot-connect/cloudflare.env` loads. It holds `CLOUDFLARE_ZONE_NAME=deepseekbot.dev`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

## Rules

- Never print, echo or log `CLOUDFLARE_API_TOKEN`, a WorkOS API key or any other secret. The script writes secrets only to a mode-600 temp file and deletes it.
- Don't use `pnpm dlx wrangler`: on this Mac it fails with `ERR_PNPM_IGNORED_BUILDS`. Run `pnpm install` at the repo root and use the repo's wrangler, which the script does.

## Steps

1. `pnpm install` at the repo root on this branch.
2. Find `WORKOS_CLIENT_ID` (`client_…`). This is the WorkOS environment of TOB that the phone test app signs in to. Look in order:
   - TOB's config on this Mac (`~/Documents/code/tob`: wrangler configs, `.dev.vars`, `.env*` with `WORKOS_CLIENT_ID`);
   - TOB's public `GET <tob>/.well-known/open-cloud-groups`, field `auth.clientId`;
   - the WorkOS dashboard.

   If you find several candidates, ask the owner which environment the phone test app uses.
3. Find `ALLOWED_USERS`: the owner's WorkOS user id (`user_…`) for `vaind.thx@gmail.com` in that same environment.
   - If a `WORKOS_API_KEY` for the environment exists locally, use `GET https://api.workos.com/user_management/users?email=vaind.thx@gmail.com` with the key as Bearer, without printing the key.
   - Otherwise the owner copies it from WorkOS dashboard → Users.
4. Run:
   ```sh
   WORKOS_CLIENT_ID=client_… ALLOWED_USERS=user_… packages/connect-relay/scripts/deploy.sh
   ```
   It creates or reuses the D1 database, writes its uuid into `wrangler.jsonc` and applies the migrations remotely. It then deploys, sets the five secrets with `wrangler secret bulk`, and checks that:
   - `/v1/config` returns the client id, retrying for about 2 minutes;
   - `/v1/hosts` answers `401`.

   It exits non-zero if either check fails.
5. Commit the D1 uuid change in `wrangler.jsonc` (the uuid is not a secret). Delete `DEPLOY-HANDOFF.md` in the same PR, or keep the script and fold its usage into the README.

## Owner action

- In the WorkOS dashboard, make sure CLI Auth (device authorization) is enabled for the TOB environment. Hosts sign in to the relay with it, and it can't be checked from the CLI.

## Report back

- the D1 uuid;
- the WorkOS client id and where it came from;
- whether `ALLOWED_USERS` was set;
- the two verification results.

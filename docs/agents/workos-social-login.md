# WorkOS social login clients (UAT and Prod)

Hosted Connect and TOB sign in through TOB's WorkOS environments (ADR-0241). In **Staging (UAT)**, WorkOS provides default Google, Microsoft, GitHub and Apple credentials for testing only. Their consent screens show WorkOS's name and logo. **Production has no default credentials**: every provider it offers needs its own OAuth client. This runbook registers our own clients for both environments, enters them in WorkOS, and stores them machine-locally.

## Who does what

- The Human signs in to every console: WorkOS, Google Cloud, Azure, GitHub and Apple Developer. An agent never types a password, OTP or passkey, and never creates an account.
- An agent with the Human's signed-in browser (for example the Codex in-app browser) does the rest:
  - creates the apps in the provider consoles;
  - copies each Redirect URI from the WorkOS Dashboard;
  - enters the credentials in WorkOS;
  - writes the files below.
- Never print, paste or log a client secret or private key. That covers chat, issues, PRs, commits and terminal output. Move values from the page straight into the file.

## Where the values are stored

Use the gitignored `.secrets/` folder at the root of the **main checkout**; see [machine-local secrets](device-secrets.md). Create the folders with mode 700 and the files with mode 600.

```text
.secrets/workos/
  uat/oauth.json
  uat/apple-AuthKey_<KEY_ID>.p8
  prod/oauth.json
  prod/apple-AuthKey_<KEY_ID>.p8
```

`oauth.json` (one per environment):

```json
{
  "environment": "uat",
  "workosEnvironmentId": "environment_…",
  "workosClientId": "client_…",
  "authDomain": "<the environment's AuthKit domain>",
  "google": { "project": "…", "clientId": "…apps.googleusercontent.com", "clientSecret": "…" },
  "microsoft": {
    "tenant": "…",
    "clientId": "…",
    "clientSecret": "…",
    "secretExpiresAt": "YYYY-MM-DD"
  },
  "github": { "owner": "…", "appType": "oauth-app", "clientId": "…", "clientSecret": "…" },
  "apple": {
    "teamId": "…",
    "appId": "…",
    "servicesId": "…",
    "keyId": "…",
    "privateKeyFile": "apple-AuthKey_<KEY_ID>.p8"
  },
  "redirectUris": { "google": "…", "microsoft": "…", "github": "…", "apple": "…" },
  "updatedAt": "YYYY-MM-DDTHH:MMZ"
}
```

Client IDs and Redirect URIs are not secret, but they sit next to the secrets so one file describes the environment. Only the WorkOS client IDs belong in committed code. Today that is UAT's `client_01M54TZZAA0Y6A248NCFYD84A5`, which the relay publishes at `https://connect.botharness.ai/v1/config`.

## Steps, per environment (do UAT first, then Prod)

0. **Identify the environment.**
   - In the WorkOS Dashboard, switch to the environment (Staging for UAT, Production for Prod). Record its environment ID, client ID and AuthKit domain in `oauth.json`.
   - If Production has never been set up, stop and ask the Human. Activating it can involve billing and domain choices.
   - Don't change any other WorkOS setting (sign-up policy, sessions, redirect URIs of apps) unless this runbook says so.
   - **Prod only: custom domains first** (see [Custom domains](#custom-domains-prod-only)), because they change every provider's Redirect URI.
1. **Google** ([docs](https://workos.com/docs/integrations/google-oauth)):
   - In WorkOS, go to Authentication → OAuth providers → Google → Manage and copy the Redirect URI.
   - In Google Cloud, use one project per environment.
     - Configure the consent screen: External, the DeepSeekBot name, logo and support email, and only the scopes `openid`, `email` and `profile`.
     - Under Clients, create a client of type **Web application**. Add the WorkOS Redirect URI under Authorized redirect URIs.
     - Copy the client ID and client secret; the secret may not be shown again.
   - On the Audience tab, **Publish app**. A client left in testing shows "Access blocked" to other users.
   - In WorkOS, choose "Your app's credentials", paste the values and save.
2. **Microsoft** ([docs](https://workos.com/docs/integrations/microsoft-oauth)):
   - In Entra ID → App registrations, create a new registration with Supported account types set to **Personal Microsoft accounts only**, as WorkOS's guide specifies.
     - Add a **Web** platform with the WorkOS Redirect URI.
     - Under Token configuration, add the optional claims `email`, `family_name` and `given_name`, accepting the Graph permission prompt.
     - Create a client secret and copy its **Value**, not its ID.
   - Record `secretExpiresAt`. Secrets last at most 24 months; add a reminder to rotate.
   - Enter the Application (client) ID and the secret in WorkOS.
3. **GitHub** ([docs](https://workos.com/docs/integrations/github-oauth)):
   - Under the organization that should own it, create an **OAuth App** (one per environment, because an OAuth App has one callback).
     - Set Homepage URL to `https://botharness.ai`.
     - Set Authorization callback URL to the WorkOS Redirect URI.
     - Generate a client secret; it is shown once.
   - The `user:email` scope is required. WorkOS requests it.
   - Enter the values in WorkOS.
4. **Apple** ([docs](https://workos.com/docs/integrations/apple)):
   - This needs the Human's Apple Developer team.
   - Under Identifiers, reuse or create an App ID with Sign in with Apple enabled, then register a **Services ID** and configure it:
     - enable Sign in with Apple and select that App ID;
     - add `api.workos.com` under Domains, or `auth.deepseekbot.app` in Prod once that custom domain is verified;
     - add the WorkOS Redirect URI under Return URLs.
   - Under Keys, create a key with Sign in with Apple and download the `.p8` straight into `.secrets/workos/<env>/`. It can be downloaded only once.
   - Under Services, open Sign in with Apple for Email Communication. Add the Outbound Email Domains that the WorkOS dialog lists, until each shows a green check.
   - In WorkOS, enter the Team ID, Services ID, Key ID and key file.
5. **Write and check the file.**
   - Write `oauth.json` with `chmod 600`.
   - Validate it without printing values, for example `node -e` that reports which keys are present.
   - Confirm `git status` and `git check-ignore -v .secrets/workos/uat/oauth.json` show it is ignored.

## Custom domains (Prod only)

WorkOS supports custom domains only in the **Production** environment ([AuthKit](https://workos.com/docs/custom-domains/authkit), [Auth API](https://workos.com/docs/custom-domains/auth-api)). UAT stays on its generated `*-staging.authkit.app` domain and `api.workos.com`. Use **`deepseekbot.app`**. Don't use `deepseekbot.dev`: ADR-0241 reserves that zone for `<host-id>.deepseekbot.dev` tunnels, and no other service may live under it.

| Domain                  | WorkOS setting                                                        | Effect                                                      |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `login.deepseekbot.app` | Domains → AuthKit domain                                              | Hosted sign-in page, replacing the generated AuthKit domain |
| `auth.deepseekbot.app`  | Domains → Auth API domain; each OAuth provider's custom domain option | OAuth callbacks: new Redirect URIs start with this domain   |

1. With **Production** selected in the WorkOS Dashboard, add each domain and read the exact CNAME target that WorkOS shows. Don't assume it.
2. In the Cloudflare dashboard, zone `deepseekbot.app`, add each CNAME as **DNS only (grey cloud)**. Proxy it later only if WorkOS still verifies. The Connect API token in `~/.config/deepseekbot-connect/cloudflare.env` can't see this zone, by design: don't widen it.
3. Wait until WorkOS shows the domain as verified and its certificate as issued. WorkOS retries for up to 72 hours.
4. Register the Prod provider clients (steps 1–4) using the **new** Redirect URIs. Keep the old `api.workos.com` URI in each provider until a Prod sign-in through the new one works, then remove it.
5. **Check the token issuer before changing any code.**
   - Sign in once in Prod and decode the access token's `iss` claim locally. Don't print the token.
   - Today the relay (`packages/connect-relay/src/auth.ts`), the Host (`packages/core/src/devices/connect-account.ts`, `packages/core/src/cloud/instance-contract.ts`), the phone (`apps/mobile/src/host/connect-account.ts`, `apps/mobile/src/cloud/instance-contract.ts`) and TOB all hard-code `https://api.workos.com/user_management/...` as the issuer and endpoints.
   - If `iss` or the endpoints change with the Auth API domain, record it and open an issue. Switching Prod to the custom domain is then a code change, not only a dashboard change.

Record both domains and their verification state in `.secrets/workos/prod/oauth.json` (`"customDomains": {"authkit": "login.deepseekbot.app", "authApi": "auth.deepseekbot.app", "verifiedAt": "…"}`).

## Verify

- **Each provider in each environment:**
  - Run `deepseekbot connect-sign-in --wait` on an isolated Host and choose the provider on the AuthKit page. The Human completes the login.
  - Confirm `connect-status` shows `signed-in` with that account's email, then `connect-sign-out`.
  - Check that the consent screen shows DeepSeekBot, not WorkOS.
- **The phone (UAT):** sign in from the Pair screen's account section on the dev app through the shared device QA queue ([device-qa.md](device-qa.md)).
- Report pass or fail per provider and environment, with no identifiers beyond the provider name.

## Open questions for the Human

- **Prod:** confirm which WorkOS environment Prod is. The relay and the phone use UAT's client today, so switching them to Prod is a separate change.
- **Store app redirect:** the store app (`app.deepseekbot.mobile`) needs its own redirect URI, because the phone's code currently uses `ai.botharness.deepseekbot.dev:/oauth2redirect`. Decide this before Prod sign-in on store builds.
- **Custom domain cost:** check the WorkOS plan before enabling the Prod custom domains, because the docs don't state their price.

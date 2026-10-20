# Machine-local secrets for device QA

Native device checks and store builds need a few files that must never enter git: the Firebase
config for push and the FCM key (and, once added, the Play service account key). They live once
per machine, in one folder outside every checkout, so each branch, worktree and fresh clone
reuses them without copying anything. Environment variables point at that folder; the repo only reads the variables.

## Where the files live

| Machine | Folder                                                 |
| ------- | ------------------------------------------------------ |
| Windows | `D:\secrets\deepseekbot\`                              |
| macOS   | `~/.secrets/deepseekbot/` (create it with `chmod 700`) |

| File                          | What it is                                                                              | Where it comes from                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `google-services.json`        | Firebase config for `app.deepseekbot.mobile` and `ai.botharness.deepseekbot.dev` (push) | Firebase project `deepseekbot-d3e3a` → Project settings → General → either Android app → download |
| `fcm-v1-service-account.json` | FCM V1 service account key, a backup of the one EAS holds                               | Firebase → Project settings → Service accounts → Generate new private key                         |

EAS keeps its own copies: the `GOOGLE_SERVICES_JSON` secret file variable (production, preview
and development environments) and the FCM V1 key on both packages' Android credentials. Cloud
builds need nothing from this folder. If a file here is lost, download it again from the source
above; EAS cannot export secrets.

## One-time setup per machine

Point the variable at the folder once, for every future shell:

```powershell
setx GOOGLE_SERVICES_JSON D:\secrets\deepseekbot\google-services.json
```

```sh
echo 'export GOOGLE_SERVICES_JSON="$HOME/.secrets/deepseekbot/google-services.json"' >> ~/.zshrc
```

Open a new shell afterwards. `apps/mobile/app.config.js` passes the variable to
`android.googleServicesFile` for both the development and the store variant.

## Local Android build with push

From any checkout or worktree:

```powershell
pnpm install
cd apps\mobile
npx expo prebuild --clean --platform android
npx expo run:android --device
```

`prebuild --clean` is needed once per checkout, and again after `app.config.js`, `app.json` or a
native dependency changes; an `android/` folder generated earlier does not pick up the Firebase
config. Reserve the phone through [shared device QA](device-qa.md) first.

## Store builds from a clean clone

Run EAS from `apps/mobile` with `EAS_NO_VCS=1 EAS_PROJECT_ROOT=../..`. Without it EAS uploads the
repository's `.git` history (over 1 GB of PR media) and the archive can pass the 2 GB limit.
`.easignore` at the repo root keeps the rest of the upload to the app. Profiles: `store-test`
(AAB for Play) and `store-test-apk` (sideloadable APK, signed with the upload key, so a phone
must uninstall the Play copy before installing it).

## Rules

- Never commit these files, paste their contents into chat, a PR, an issue or a log, or copy
  them into a checkout. Pass paths, not values.
- A new machine-local secret gets a row in the table above in the same change that starts
  using it.

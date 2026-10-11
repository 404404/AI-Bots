# Reuse QQ QA clients across worktrees

Assign one official QQ Bot App to each of QA1, QA2 and QA3. Reuse its dedicated DSH_HOME when switching branches so its native Provider authorization remains in that Profile. A slot can be local or remote. The registry is machine-local metadata; credentials stay in the native Credentials Service. A selected existing QQ credential can initialize another dedicated Profile without copying its full credential store.

## Register the existing Apps

From any checkout containing the script, register each independent App once:

```bash
node scripts/dev-qq-test-clients.mjs register QA1 \
  --name 'Example QQ QA 1' --app-id 100001 --group 123456789
node scripts/dev-qq-test-clients.mjs register QA2 \
  --name 'Example QQ QA 2' --app-id 100002 --group 123456789
node scripts/dev-qq-test-clients.mjs list
```

The values are examples. If the AppID is not yet known, omit `--app-id`, then verify the real application in native IM settings. Names do not prove application identity. With no `--home`, each local slot has its own `~/.dsh-botharness-qq-qa<n>` home and `web-dev` Profile. Override these with `--home` and `--profile`. For a task-owned VPS unit, also pass `--remote`; the script refuses to launch that receiver locally.

Metadata is saved in `~/.config/botharness/qq-test-clients.json`, protected using the same private-file mechanism as the [Lark test Apps](im-test-apps.md). `BOTHARNESS_QQ_TEST_CLIENTS_FILE` selects an explicit shared file. Windows and WSL have separate homes by default. `list` exposes slot names and claims, without AppIDs, group numbers or credentials. Claims contain local worktree paths; keep the output private.

## Claim and launch a local client

Confirm with the Human and inspect current processes/units on **every machine** that could receive this App. A local registry cannot detect an independently running receiver elsewhere. Then, from the named issue branch:

```bash
node scripts/dev-qq-test-clients.mjs claim QA1 \
  --task codex/local/<task-id> --receiver my-task-host --confirmed-idle
node scripts/dev-qq-test-clients.mjs launch QA1 \
  --task codex/local/<task-id> --port 31971
```

`--task` defaults to `codex/local/$CODEX_THREAD_ID` when available. Claim records the current task, branch and worktree. Another task cannot take the slot or replace its metadata. Claims never expire automatically. A write lock prevents simultaneous registry updates; a crashed writer's lock requires inspection before manual recovery.

Launch delegates to the existing `dev-instance.mjs`, using the slot's home/Profile, the current worktree and qualified IM Provider. Build that worktree first and use the [pinned local development toolchain](../client-bridge.md). The launcher prints its private login URL; do not record that output publicly. It does not stop an existing Host. An existing Profile writer record or a repeated launch request refuses before another Host starts. After an uncertain launch, inspect its exact home, port and PID; the claim remains occupied.

In a clean Profile without an existing authorization, open **Settings → IM bots → QQ → Manual setup**. Have the Human enter the existing App's AppID and AppSecret directly in that native form, with recording stopped. The qualified Provider's **Scan QR code** flow creates and connects a Bot; use it only when creating a new App is intended. When authorization already exists in a stopped native Profile, use the CLI workflow below instead of entering the Secret again. Verify the authenticated application identity, then bind it to the intended PersonaBot through **External identities**. Native authorization and BotHarness Binding are separate; a registry claim supplies neither. Branches with incompatible database schemas require a compatible writer or a separate Profile, rather than opening old data with an incompatible binary.

If registration omitted the AppID, record the identity shown by that authenticated Provider:

```bash
node scripts/dev-qq-test-clients.mjs identify QA1 \
  --task codex/local/<task-id> --app-id <verified-app-id>
```

Only the claiming task, worktree and branch can fill it in. This records inspected metadata; it does not authenticate the App. Changing a known identity refuses, and an AppID already registered to another slot refuses.

## Reuse a selected native authorization through CLI

This developer helper uses the qualified Provider's native management endpoint. It is not a released `deepseekbot im-authorize qq` command. It was verified with Provider revision `602baa37fa327f7069545aaadbbd34db8a8f4636` and DSH `0.2.0-rc.1`; another Provider needs its own contract qualification.

Inspect the selected source Profile's exact receiver and confirm it is stopped on every machine. From the claiming branch, for a local target Host:

```bash
node scripts/dev-qq-test-clients.mjs connect QA1 \
  --task codex/local/<task-id> --port 31971 \
  --token-file <claimed-home>/owner-token \
  --source-home <stopped-authorized-home> --confirmed-source-idle
node scripts/dev-qq-test-clients.mjs status QA1 \
  --task codex/local/<task-id> --port 31971 \
  --token-file <claimed-home>/owner-token
```

The helper matches the registered AppID against the source's native QQ config and derived credential reference, reads only that App's Secret, and calls `bot.bind-credentials` through Owner-authenticated `/api/dsh-im/qq` on loopback. The Provider writes its own native Credentials and config. No Secret is accepted in argv, saved to the registry or printed. The source Profile is read-only; unrelated credentials and Bindings are not copied. An existing target authorization is inspected without replacing it, and a target containing another App refuses.

For a remote slot, add `--ssh-config <private-json> --remote-node /absolute/path/to/node` to both commands. Keep the file outside version control:

```json
{
  "host": "example-host",
  "user": "example-user",
  "identityFile": "/private/example-key",
  "knownHostsFile": "/private/verified-known-hosts"
}
```

Verify the SSH Host key independently before creating `knownHostsFile`. The helper requires strict Host-key checking, a dedicated identity and batch mode; sends the selected Secret only over SSH stdin; and performs Owner login and the Provider call on the remote loopback address. The token file must be under the claimed home. Remote scripts do not stop or restart a unit. A failed or interrupted connect remains claimed and cannot be blindly repeated: inspect `status` and the exact receiver, then stop and hand off explicitly if another attempt is required.

For later branches using the same Profile, claim and launch it after the old receiver stops, then run `status`; do not repeat `connect`. This retains authorization without retyping. `connected: true` verifies transport readiness, not group rendering. On the new Ubuntu 26.04 VPS, this path actually connected the existing QA App without entering its Secret again; original-group chat acceptance remains a separate check.

![Native binding confirmation for the existing QQ QA App and the tutorial Bot](../assets/vps-source/02-qq-app-bound.png)

_Actual native Web capture after CLI connection, 2026-10-11 18:10:31 UTC. Binding was completed in External identities; this screen is not a QQ group-reply receipt._

## Stop and hand off

Stop only the exact Host/receiver identified by this claim. Verify its process has exited and its listener/receiver has stopped, including on a remote VPS. Then:

```bash
node scripts/dev-qq-test-clients.mjs release QA1 \
  --task codex/local/<task-id> --confirmed-stopped
```

Release requires the claiming task and worktree and retains the Profile, authorization and history. The next branch claims the same slot with a fresh receiver check. The metadata registry coordinates cooperating tasks on this machine; it does not enforce a distributed receiver lease or stop another session's unit.

For chat acceptance, send a fresh uniquely marked @mention in the designated QQ group, observe the actual reply in that group, and correlate Source Event, Inbox Admission and Outbox evidence. Repeat with a new mention after Host restart. Provider acceptance and saved pre-restart source proof do not verify that result. See the [QQ connection guide](../qq-connection.md).

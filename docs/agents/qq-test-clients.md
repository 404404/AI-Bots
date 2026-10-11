# Reuse QQ QA clients across worktrees

Assign one official QQ Bot App to each of QA1, QA2 and QA3. Reuse its dedicated DSH_HOME when switching branches so its native Provider authorization remains in that Profile. A slot can be local or remote. The registry is machine-local metadata; credentials stay in the native Credentials Service. This workflow does not copy a Profile's credential store.

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

In a clean Profile, open **Settings → IM bots → QQ**. For an existing App, choose **Manual setup** and have the Human enter its AppID and AppSecret directly in that native form, with recording stopped. The qualified Provider's **Scan QR code** flow says it creates and connects a Bot; use it only when creating a new App is intended. Verify the authenticated application identity, then bind it to the intended PersonaBot through **External identities**. Later branches reuse this same Profile after the previous Host stops. Native authorization and BotHarness Binding are separate; a registry claim supplies neither. Branches with incompatible database schemas require a compatible writer or a separate Profile with a fresh authorization, rather than opening old data with an incompatible binary.

If registration omitted the AppID, record the identity shown by that authenticated Provider:

```bash
node scripts/dev-qq-test-clients.mjs identify QA1 \
  --task codex/local/<task-id> --app-id <verified-app-id>
```

Only the claiming task, worktree and branch can fill it in. This records inspected metadata; it does not authenticate the App. Changing a known identity refuses, and an AppID already registered to another slot refuses.

## Stop and hand off

Stop only the exact Host/receiver identified by this claim. Verify its process has exited and its listener/receiver has stopped, including on a remote VPS. Then:

```bash
node scripts/dev-qq-test-clients.mjs release QA1 \
  --task codex/local/<task-id> --confirmed-stopped
```

Release requires the claiming task and worktree and retains the Profile, authorization and history. The next branch claims the same slot with a fresh receiver check. The metadata registry coordinates cooperating tasks on this machine; it does not enforce a distributed receiver lease or stop another session's unit.

For chat acceptance, send a fresh uniquely marked @mention in the designated QQ group, observe the actual reply in that group, and correlate Source Event, Inbox Admission and Outbox evidence. Repeat with a new mention after Host restart. Provider acceptance and saved pre-restart source proof do not verify that result. See the [QQ connection guide](../qq-connection.md).

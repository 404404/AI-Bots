# 在 worktree 之间复用 QQ QA 客户端

为 QA1、QA2、QA3 各分配一个独立的官方 QQ Bot 应用。切换分支时复用该槽位的专用 DSH_HOME，原生 Provider 授权继续保留在同一个 Profile 中。槽位可以是本机或远程接收器。机器本地注册表只记录元数据，凭据保留在原生 Credentials Service；此流程不复制 Profile 的凭据存储。

## 登记已有应用

从包含脚本的任意 checkout，为每个独立应用登记一次：

```bash
node scripts/dev-qq-test-clients.mjs register QA1 \
  --name 'Example QQ QA 1' --app-id 100001 --group 123456789
node scripts/dev-qq-test-clients.mjs register QA2 \
  --name 'Example QQ QA 2' --app-id 100002 --group 123456789
node scripts/dev-qq-test-clients.mjs list
```

这些值是示例。暂时不知道 AppID 时，省略 `--app-id`，随后在原生 IM 设置中核对真实应用。名称不能证明应用身份。不传 `--home` 时，本机槽位各自使用 `~/.dsh-botharness-qq-qa<n>` 和 `web-dev` Profile；可用 `--home`、`--profile` 指定。任务专用 VPS Unit 还应传入 `--remote`，脚本会拒绝在本机启动该接收器。

元数据存放在 `~/.config/botharness/qq-test-clients.json`，沿用 [Lark 测试应用](im-test-apps.md) 的私密文件保护机制。`BOTHARNESS_QQ_TEST_CLIENTS_FILE` 可指定共享文件。Windows 与 WSL 默认使用各自的 HOME。`list` 显示槽位名称和认领信息，不显示 AppID、群号或凭据；认领信息含本机 worktree 路径，请勿公开输出。

## 认领并启动本机客户端

先与 Human 核对，并检查所有可能接收该应用的机器上的进程或 Unit。本机注册表无法发现另一台机器独立运行的接收器。然后在具名 Issue 分支中执行：

```bash
node scripts/dev-qq-test-clients.mjs claim QA1 \
  --task codex/local/<task-id> --receiver my-task-host --confirmed-idle
node scripts/dev-qq-test-clients.mjs launch QA1 \
  --task codex/local/<task-id> --port 31971
```

存在 `CODEX_THREAD_ID` 时，`--task` 默认是 `codex/local/$CODEX_THREAD_ID`。认领记录任务、分支和 worktree；其它任务不能接管槽位或替换其元数据。认领不会自动过期。写锁避免同时修改注册表；进程崩溃留下的锁必须先检查，再人工恢复。

启动沿用 `dev-instance.mjs`，使用槽位的 HOME/Profile、当前 worktree 和 qualified IM Provider。先构建当前分支，并使用[固定版本的本机开发工具链](../client-bridge.md)。启动器会输出私密登录 URL，不要公开录制该输出。它不会停止已有 Host。发现 Profile 写入者记录或重复启动请求时，会在启动第二个 Host 前拒绝。启动结果不确定时，检查该 HOME、端口和准确 PID；槽位继续保持认领。

空白 Profile 中打开 **Settings → IM Bots → QQ → Scan to connect**，完成官方应用授权并核对真实身份。通过目标 PersonaBot 的 **External identities** 绑定。旧 Host 停止后，后续分支复用同一个 Profile。原生授权和 BotHarness Binding 是两步，注册表认领不提供其中任何一种权限。分支的数据 schema 不兼容时，应使用兼容程序，或另建 Profile 并重新授权，不要用不兼容程序打开旧数据。

登记时省略 AppID 的，在核对已授权 Provider 的身份后补记：

```bash
node scripts/dev-qq-test-clients.mjs identify QA1 \
  --task codex/local/<task-id> --app-id <verified-app-id>
```

只有认领任务、worktree 和分支可以补记。此操作记录已检查的元数据，不执行应用认证。替换已知身份、或使用另一个槽位已登记的 AppID，都会拒绝。

## 停止与交接

只停止该认领标明的准确 Host/接收器。确认进程退出、监听及接收停止，远程 VPS 也需检查，然后执行：

```bash
node scripts/dev-qq-test-clients.mjs release QA1 \
  --task codex/local/<task-id> --confirmed-stopped
```

释放要求任务和 worktree 与认领一致，并保留 Profile、授权和历史。下一个分支重新核对接收器后再认领。注册表协调本机合作任务，不构成分布式接收租约，也不会停止另一个 session 的 Unit。

真实聊天验收要求在指定 QQ 群发送新的、带唯一标记的 @mention，观察原群实际回复，并关联 Source Event、Inbox Admission 和 Outbox 证据。Host 重启后用新 mention 重复验收。Provider accepted 和重启前的来源证明不能替代此结果。详见 [QQ 连接指南](../qq-connection.md)。

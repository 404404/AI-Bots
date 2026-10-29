# GK50 独立 Bot — 0.1.0-alpha.1

这是 `404404/AI-Bots` fork 的新独立产品方向，使用自己的后台、SQLite、文件记忆和加密凭据，不启动或调用 DSH Host。首片正在验收，不代表全部能力已迁移。依据见[迁移评估](../docs/standalone-bot-migration.md)，状态以[验收记录](../docs/acceptance/standalone-bot-test-results-2026-10-29.md)为准。MIT 许可证及归属见 LICENSE、NOTICE.md。

## 当前范围

网页固定进入由 SQLite singleton UUID 指向的主 Bot，并提供 Bot 管理目录；目录展示稳定 ID、persona、角色、配置版本、当前已实现能力、有效共享模型连接和最近持久化执行状态。可以从目录进入身份/模型设置或创建工作 Bot。主 Bot 是普通 Bot，persona 不授予权限。SQLite v1→v4 显式事务迁移创建唯一主 Bot、任务和连接授权表；不按名字收编旧 Bot，保留 slug 冲突时会生成未占用 slug。损坏或丢失的 singleton/引用会明确失败，不能删除该记录后启动服务掩盖问题。

Bot 配置变更递增 `configRevision`。每个新 Run 在受理时记录对应的配置版本和非 secret 身份/模型快照；不包含 API key 或 Codex access/refresh token。后续编辑仅影响新的 Run。Web 与 CLI 共用 `BotApplication.execute` 业务入口；HTTP 适配器显式注入 owner 上下文。应用命令不从 params 读取 actor/isMain 权限，缺少可信上下文或使用 Bot 上下文的管理请求会拒绝。重启将未完成执行标为 `interrupted`，不会自动重发；断线重试必须保留原 `idempotencyKey`，同键不同正文返回冲突。

主 Bot 的模型须在“Bot 管理目录”选择已配置的来源 Bot 并绑定；工作 Bot 委派也由所有者选择目标与连接来源。SQLite 只保存来源 Bot ID、模型授权 epoch 和明确授权引用，OAuth/API 凭据留在来源 Bot；请求开始前重查引用和授权版本，失效时明确拒绝且不回退到主 Bot 本地配置。Codex Auth 复用锁定的独立 SDK，支持设备码和浏览器登录，不复制旧 DSH 凭据。兼容 Chat Completions 服务是另一个明确选项，密钥只通过私密输入保存。

主 Bot 的 Codex 对话使用 SDK 原生结构化 `toolCall` / `toolResult`，将一个 owner 已授权的工作 Bot 作为持久子任务执行，再由主模型汇总。worker 只收到任务明确输入、自己的 persona 和自己的有界文件记忆；不继承主对话历史。单进程最多同时运行 4 个根 Bot Run 和 2 个 worker/direct 任务（最多 6 个模型请求）；超限分别明确返回 `execution-capacity` 或 `task-capacity`，没有后台队列。每个根任务最多一个 worker、只支持一层委派；deadline、取消、幂等键、配置/记忆快照和带来源标记的结果均持久化。API/CLI 的 `tasks.create` 与模型工具使用同一 TaskEngine。目录分别呈现 Bot 自有模型配置与主 Bot 的有效共享连接；绑定变更递增主 Bot 配置版本。目录的能力来自实际实现和持久运行记录。

本切片尚未实现模型内创建/编辑工作 Bot（DG03）、多 worker/worker 间继续委派、排队调度、自动重试、浏览器或电脑控制。不会把这些标成当前能力，也不建立虚假的活动/任务记录。

群聊、IM、Assignment、多 Agent、定时任务、Git 记忆同步、浏览器、电脑控制及客户端延后。旧 `deepseekbot` 在线 CLI 的 Bot、Session、Channel Timeline、Activity、Assignment 仍属于旧部署；新 CLI 不伪造尚未迁移的能力，不作为 DevBoard 的第二套数据库。

## 本地运行

需要 Node ≥22.19；正式容器固定 Node 24 镜像。

```sh
cd standalone
npm ci --ignore-scripts
npm test
npm run build
BOT_DATA_DIR=/tmp/my-independent-bot BOT_PUBLIC_URL=http://127.0.0.1:3080 npm start
```

数据目录自动创建为 0700，登录访问码位于 `secrets/access-code`（0600）。仅在本机读取并输入登录页。LAN 运行应将 `BOT_PUBLIC_URL` 设置为实际浏览器地址；来源、Host 和 Origin 都有检查，没有无认证业务 API。HTTP 连接承载登录和对话内容，应仅在已授权的可信 LAN 使用。

## GK50 Compose 验证

22443 保留当前独立产品作为对照，20443 用于独立候选，21443 已有其他服务；每次部署重新检查占用。旧 GUI 容器保持停止、数据保留。映射全部由 Compose 管理；当前数据位于 gitignored `.local/standalone-bot/data`，候选使用独立目录，不直接迁移当前数据。

`Standalone Bot` workflow 只构建、测试、扫描并上传未发布候选。主机校验成功 workflow、源码提交、产物 SHA256 和镜像 ID 后运行：

```sh
node standalone/deploy/qualify.mjs --run-id <successful-run-id>
node standalone/deploy/qualify.mjs --run-id <successful-run-id> --execute
```

首次部署没有独立旧版本可回退，原部署和数据始终保留。后续升级保存新产品数据备份及前一镜像 ID；`--rollback` 检查，`--rollback --execute` 回退代码，不自动恢复备份。schema 不兼容时拒绝启动，需单独评估恢复。

完整真实验收通过前不发布 GHCR。正式交付需以 `ghcr.io/404404/ai-bots@sha256:…` 固定 registry digest 部署；候选的本地 image ID 不等于已发布 registry digest。

## Codex 登录与代理

模型页先保存供应商、模型和代理，再点击登录。容器代理可填 `http://host.docker.internal:7890`，不能填宿主机 `127.0.0.1`。显式 Undici dispatcher 处理授权和模型请求，模型强制 SSE。端口连通或环境变量存在不证明请求经过代理；日志给出脱敏路由与错误，验收另外检查实际路径。不支持包含用户名或密码的代理 URL。

浏览器登录若 localhost 回调无法连接，将完整回调地址粘贴到页面私密输入框，不要发送到聊天、日志或 Issue。设备码只向已登录用户显示。上游地区限制、账号权限或模型错误均明确失败，不自动改用别的服务。

## 在线 API 与 CLI

`POST /api/v1/session` 建立 HttpOnly、SameSite=Strict 会话；`POST /api/v1/command` 接收 `{ "command": "bots.list", "params": {} }`。

```sh
export BOT_URL=http://127.0.0.1:22443
export BOT_SESSION_FILE=/tmp/private-bot-session
node --experimental-strip-types standalone/src/cli.ts login --code-file <private-access-code-file>
node --experimental-strip-types standalone/src/cli.ts bots.list
node --experimental-strip-types standalone/src/cli.ts --help
```

参数从 stdin 或 `--input-file` 私密 JSON 读取，凭据不能放命令行。stdout 仅一个 JSON 文档；成功包含 `schemaVersion`，错误包含 `error.code`，列表保留稳定 ID、时间戳和 `nextCursor`。无凭据示例：

```json
{ "schemaVersion": 1, "result": { "items": [], "nextCursor": null, "hasMore": false } }
```

准确命令见 `--help`，包括 `main.get`、`main.catalog`、`connections.list/bind-main/revoke`、`delegation.grant/revoke`、`tasks.create/list/get/cancel` 和 `auth.status/start/answer/cancel/logout`。`connections.list` 默认每页100条，支持 `consumerBotId`、`limit`（1–100）和服务端签名的 `cursor`；每项包含稳定连接/来源/使用者 ID、`createdAt`、`revokedAt` 与当前状态。`main.catalog` 只返回主 Bot 当前绑定与未撤销的工作 Bot授权绑定，不包含历史连接记录。示例：

```sh
node --experimental-strip-types standalone/src/cli.ts connections.bind-main --input-file <source-bot.json>
node --experimental-strip-types standalone/src/cli.ts delegation.grant --input-file <worker-and-source.json>
node --experimental-strip-types standalone/src/cli.ts tasks.create --input-file <worker-task.json>
node --experimental-strip-types standalone/src/cli.ts tasks.get --input-file <task-id.json>
```

`connections.bind-main` 输入为 `{"sourceBotId":"<Bot ID>"}`；`delegation.grant` 输入为 `{"workerBotId":"<Bot ID>","sourceBotId":"<Bot ID>"}`；`tasks.create` 输入为 `{"workerBotId":"<已授权 Bot ID>","idempotencyKey":"<稳定操作 ID>","input":"<任务内容>"}`；`tasks.get` / `tasks.cancel` 输入为 `{"taskId":"<任务 ID>"}`。CLI 不回显凭据。

`main.get` 返回固定主 Bot 和实际入口 `/`；`main.catalog` 返回 Bot 列表及真实能力、共享连接状态和执行状态。`tasks.get` 包含受理时的非 secret 配置快照，以及实际读取的记忆文件路径/版本清单；不返回记忆正文或凭据。诊断事件用 `runId` 和 `taskId` 分别关联对应执行。任务内容从 stdin 或私密输入文件读取。命令从同一业务入口读取，不接受参数伪造 owner 上下文。状态不返回授权令牌。诊断只保存有界事件、执行 ID、错误码与上游状态，不记录请求正文或原始上游错误体。

候选部署使用独立的 `deploy/compose.candidate.yml` 与 `deploy/candidate.mjs`，项目名/容器名为 `gk50-standalone-bot-candidate`，数据目录为仓库根 `.local/standalone-bot-candidate/data`，端口为 `192.168.68.11:20443`。该路径不调用生产 `qualify.mjs`，不改 22443 Compose。候选容器以 UID 10001、只读 rootfs、drop-all capabilities、no-new-privileges 运行；不设置 seccomp 覆盖，使用 Docker 默认 seccomp。操作者需先在目标机创建数据目录并设为 UID 10001、0700；`IMAGE_REF` 必须是已本地存在且标签匹配的 GHCR manifest digest，或用于开发验证的本地 `sha256:` image ID。helper 不执行 pull；显式 `--check` 只检查，实际启动还需显式 `--execute`。未通过独立验收前不得发布 GHCR。

## 数据边界

`bot.sqlite` 是 Bot、对话、执行、诊断和加密授权的权威；`owner.sqlite` 只持有进程锁。AES-GCM 主密钥位于 `secrets/master.key`，备份必须保留整个私密目录。每个 Bot 只能访问自己的平面 Markdown 记忆，最多 10 文件、每文件 8 KiB、合计 24 KiB；revision 防止覆盖。首片没有模型文件工具，用户明确保存的记忆在后续请求中作为有界上下文读取。

LAN HTTP 使用 `crypto.getRandomValues` 生成提交 ID；剪贴板不可用时提供手动复制。真实页面和真实回复必须分别验证，模拟测试不能替代。

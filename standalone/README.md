# GK50 独立 Bot — 0.1.0-alpha.1

这是 `404404/AI-Bots` fork 的新独立产品方向，使用自己的后台、SQLite、文件记忆和加密凭据，不启动或调用 DSH Host。首片正在验收，不代表全部能力已迁移。依据见[迁移评估](../docs/standalone-bot-migration.md)，状态以[验收记录](../docs/acceptance/standalone-bot-test-results-2026-10-29.md)为准。MIT 许可证及归属见 LICENSE、NOTICE.md。

## 当前范围

网页固定进入由 SQLite singleton UUID 指向的主 Bot，并提供 Bot 管理目录；目录展示稳定 ID、persona、角色、配置版本、头像、当前已实现能力、有效共享模型连接和最近持久化执行状态。可以从目录进入身份/模型设置或创建工作 Bot。主 Bot 是普通 Bot，persona 不授予权限。SQLite v1→v7 显式事务迁移创建唯一主 Bot、任务、连接授权、头像、工作 Bot 管理策略/操作回执及浏览器授权/会话/步骤/截图表；不按名字收编旧 Bot，保留 slug 冲突时会生成未占用 slug。损坏或丢失的 singleton/引用会明确失败，不能删除该记录后启动服务掩盖问题。

Bot 配置变更递增 `configRevision`。每个新 Run 在受理时记录对应的配置版本和非 secret 身份/模型快照；不包含 API key 或 Codex access/refresh token。后续编辑仅影响新的 Run。Web 与 CLI 共用 `BotApplication.execute` 业务入口；HTTP 适配器显式注入 owner 上下文。应用命令不从 params 读取 actor/isMain 权限，缺少可信上下文或使用 Bot 上下文的管理请求会拒绝。重启将未完成执行标为 `interrupted`，不会自动重发；断线重试必须保留原 `idempotencyKey`，同键不同正文返回冲突。

主 Bot 的模型须在“Bot 管理目录”选择已配置的来源 Bot 并绑定；工作 Bot 委派也由所有者选择目标与连接来源。SQLite 只保存来源 Bot ID、模型授权 epoch 和明确授权引用，OAuth/API 凭据留在来源 Bot；请求开始前重查引用和授权版本，失效时明确拒绝且不回退到主 Bot 本地配置。Codex Auth 复用锁定的独立 SDK，支持设备码和浏览器登录，不复制旧 DSH 凭据。兼容 Chat Completions 服务是另一个明确选项，密钥只通过私密输入保存。

主 Bot 的 Codex 对话使用 SDK 原生结构化 `toolCall` / `toolResult`，最多执行 12 轮。所有者可在管理目录明确启用对话中的工作 Bot 管理，选择可配置目标与新 Bot 可用的主 Bot 连接引用；默认关闭创建。此开关只控制对话创建/修改，既有逐 Bot 委派授权继续独立有效。模型可创建最多 2 个工作 Bot、按稳定 ID 修改名称/persona，再对 owner 已授权工作 Bot 执行最多 3 个持久子任务；根级共最多 8 次工具调用，最多一层委派。创建只接受名称、persona 和允许的连接引用，更新只接受名称/persona；模型不能设置源 Bot、模型、凭据、权限、主身份或记忆。每个操作以真实工具调用 ID派生的作用域回执幂等；直接 API/CLI 调用需给明确 `operationId`。策略变更、撤权或连接 epoch 变化会使后续调用明确失败。

worker 只收到受理时锁定的明确输入、自己的 persona 和自己的有界文件记忆；不继承主对话历史。单进程最多同时运行 4 个根 Bot Run 和 2 个 worker/direct 任务（最多 6 个模型请求）；超限分别明确返回 `execution-capacity` 或 `task-capacity`，没有后台队列。deadline、取消、幂等键、配置/记忆快照和带来源标记的结果均持久化。API/CLI 的 `tasks.create` 与模型工具使用同一 TaskEngine；`workers.create/update` 与模型管理工具共用 WorkerManagement。目录分别呈现 Bot 自有模型配置与主 Bot 的有效共享连接；绑定变更递增主 Bot 配置版本。目录的能力来自实际实现和持久运行记录。

每个 Bot 可在身份页上传、更换或删除 PNG 头像。服务端按文件内容校验，只接受不超过 2 MiB 的非交错 8 位 RGB/RGBA PNG（不支持灰度或调色板），输入边长最多 1024、像素最多 1,048,576；保存前去除元数据并缩放至最长边 256 像素，输出不超过 320 KiB。头像以 SQLite BLOB 和 SHA-256 revision 保存，页面通过登录保护的 revision URL 读取；列表、主标题、消息、管理目录和任务轨迹使用同一头像元数据。未上传时明确显示默认头像。头像不写入主机路径。完整校验合同见[头像实现说明](docs/avatars.md)。

**浏览器源码状态（未部署）**：schema7 接线已为网页和 CLI 实现 owner 直接控制的浏览器路径：所有者先授权当前 Bot 的精确 HTTP(S) origin，再创建独立、有限时的浏览会话，逐步打开地址、读取页面、点击、输入、滚动或保存截图。步骤、结果、截图 BLOB 和 session 状态保存在 canonical SQLite 任务轨迹中；截图读取要求已登录会话和匹配的 Bot/任务。未配置浏览器 worker socket 时，产品仍可启动并显示“网页操作暂不可用”，不会回退到宿主机浏览器或其他服务。此接线目前只有 fake UDS/受控测试证据，真实 worker 的严格镜像扫描失败，当前 GK50 schema6 候选没有这些浏览器命令；详见[阻塞记录](../docs/acceptance/standalone-browser-security-blocker-2026-10-30.md)。浏览器能力尚未接入模型工具；多层委派、排队调度和自动重试也未实现。

DG03 自动测试使用锁定 SDK 的真实工具参数校验器和受控本地 transport 验证协议及持久化；它不代表真实 Codex 模型会话或 LAN 验收已通过。

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

准确命令见 `--help`，包括 `main.get`、`main.catalog`、`connections.list/bind-main/grant-main/revoke`、`delegation.grant/revoke`、`worker-policy.get/update`、`workers.create/update`、`tasks.create/list/get/cancel` 和 `auth.status/start/answer/cancel/logout`。`connections.list` 默认每页100条，支持 `consumerBotId`、`limit`（1–100）和服务端签名的 `cursor`；每项包含稳定连接/来源/使用者 ID、`createdAt`、`revokedAt` 与当前状态。`main.catalog` 只返回主 Bot 当前绑定与主 Bot 当前有效的来源引用，不返回其他历史引用。示例：

头像命令使用同一登录会话和 AvatarStore。Web 上传与 CLI 都执行相同的 PNG 内容校验和 revision 比较；CLI 从本地普通 PNG 文件读取字节，不把文件路径发给服务端：

```sh
node --experimental-strip-types standalone/src/cli.ts avatar.set --bot-id <bot-id> --image-file <image.png>
node --experimental-strip-types standalone/src/cli.ts avatar.set --bot-id <bot-id> --image-file <replacement.png> --expected-revision <current-sha256>
node --experimental-strip-types standalone/src/cli.ts avatars.get --input-file <bot-id.json>
node --experimental-strip-types standalone/src/cli.ts avatars.delete --input-file <bot-and-revision.json>
```

`avatar.set` 通过专用有界 `/api/v1/avatar` 路由上传 Base64 JSON；普通 `/api/v1/command` 请求体仍限制为 49 KiB。`avatars.get` 和 `avatars.delete` 是普通在线命令；图片本身仅能通过带会话认证的 `GET /api/v1/bots/<bot-id>/avatar/<revision>` 读取，URL 不包含主机文件路径。

浏览器的授权与操作命令也通过同一登录会话和 `/api/v1/command` 业务入口：

```sh
node --experimental-strip-types standalone/src/cli.ts browser.status
node --experimental-strip-types standalone/src/cli.ts browser.origins.grant --input-file <bot-and-origin.json>
node --experimental-strip-types standalone/src/cli.ts browser.open --input-file <bot-origin-and-operation-id.json>
node --experimental-strip-types standalone/src/cli.ts browser.step --input-file <session-task-action.json>
node --experimental-strip-types standalone/src/cli.ts browser.trace --input-file <bot-and-task.json>
node --experimental-strip-types standalone/src/cli.ts browser.close --input-file <session-task.json>
node --experimental-strip-types standalone/src/cli.ts browser.screenshot --resource-id <resource-id> --bot-id <bot-id> --task-id <task-id> --output-file <new-private-file.png>
```

`browser.origins.grant/revoke` 输入为 `{"botId":"<Bot ID>","origin":"https://example.com"}`；origin 必须是无路径的精确来源。`browser.open` 输入为 `{"botId":"<Bot ID>","origin":"https://example.com","idempotencyKey":"<操作 ID>"}`；步骤输入包含 `botId`、`taskId`、`sessionId`、`stepId`、`action` 和可选 `args`。支持的 action 为 `navigate`、`read`、`click`、`type`、`scroll` 和 `screenshot`。CLI 截图读取使用登录保护资源 URL，仅写入不存在的新文件，限制 2 MiB。浏览器 worker 不可用、授权被拒或动作结果不确定时会返回明确错误；不会自动重放不确定动作。浏览器命令尚未接入模型工具或后台队列。

```sh
node --experimental-strip-types standalone/src/cli.ts connections.bind-main --input-file <source-bot.json>
node --experimental-strip-types standalone/src/cli.ts connections.grant-main --input-file <source-bot.json>
node --experimental-strip-types standalone/src/cli.ts delegation.grant --input-file <worker-and-source.json>
node --experimental-strip-types standalone/src/cli.ts worker-policy.update --input-file <worker-policy.json>
node --experimental-strip-types standalone/src/cli.ts workers.create --input-file <worker-create.json>
node --experimental-strip-types standalone/src/cli.ts workers.update --input-file <worker-update.json>
node --experimental-strip-types standalone/src/cli.ts tasks.create --input-file <worker-task.json>
node --experimental-strip-types standalone/src/cli.ts tasks.get --input-file <task-id.json>
```

`connections.bind-main` 输入为 `{"sourceBotId":"<Bot ID>"}`；`delegation.grant` 输入为 `{"workerBotId":"<Bot ID>","sourceBotId":"<Bot ID>"}`；`tasks.create` 输入为 `{"workerBotId":"<已授权 Bot ID>","idempotencyKey":"<稳定操作 ID>","input":"<任务内容>"}`；`tasks.get` / `tasks.cancel` 输入为 `{"taskId":"<任务 ID>"}`。CLI 不回显凭据。

`connections.grant-main` 为主 Bot 创建可由所有者策略引用的连接引用，但不会替换主 Bot 当前运行绑定；输入同为 `{"sourceBotId":"<已配置且已授权 Bot ID>"}`。`worker-policy.update` 接受 `enabled`、`allowCreation`、`allowedWorkerIds`、`allowedConnectionIds` 和 `expectedRevision`。`workers.create` 输入 `{"operationId":"<操作 ID>","name":"<名称>","persona":"<身份提示>","connectionId":"<主 Bot 已授权连接引用>"}`；`workers.update` 输入 `{"operationId":"<操作 ID>","workerId":"<稳定 Bot ID>","name":"<可选>","persona":"<可选>"}`。owner 直调和模型工具共享字段验证与回执；模型操作 ID由服务端从根任务和真实工具调用派生。

`main.get` 返回固定主 Bot 和实际入口 `/`；`main.catalog` 返回 Bot 列表及真实能力、共享连接状态和执行状态。`tasks.get` 包含受理时的非 secret 配置快照，以及实际读取的记忆文件路径/版本清单；不返回记忆正文或凭据。诊断事件用 `runId` 和 `taskId` 分别关联对应执行。任务内容从 stdin 或私密输入文件读取。命令从同一业务入口读取，不接受参数伪造 owner 上下文。状态不返回授权令牌。诊断只保存有界事件、执行 ID、错误码与上游状态，不记录请求正文或原始上游错误体。

候选部署使用独立的 `deploy/compose.candidate.yml` 与 `deploy/candidate.mjs`，项目名/容器名为 `gk50-standalone-bot-candidate`，数据目录为仓库根 `.local/standalone-bot-candidate/data`，端口为 `192.168.68.11:20443`。该路径不调用生产 `qualify.mjs`，不改 22443 Compose。候选容器以 UID 10001、只读 rootfs、drop-all capabilities、no-new-privileges 运行；不设置 seccomp 覆盖，使用 Docker 默认 seccomp。操作者需先在目标机创建数据目录并设为 UID 10001、0700；`IMAGE_REF` 必须是已本地存在且标签匹配的 GHCR manifest digest，或用于开发验证的本地 `sha256:` image ID。helper 不执行 pull；显式 `--check` 只检查，实际启动还需显式 `--execute`。未通过独立验收前不得发布 GHCR。

## 数据边界

`bot.sqlite` 是 Bot、对话、执行、诊断和加密授权的权威；`owner.sqlite` 只持有进程锁。AES-GCM 主密钥位于 `secrets/master.key`，备份必须保留整个私密目录。每个 Bot 只能访问自己的平面 Markdown 记忆，最多 10 文件、每文件 8 KiB、合计 24 KiB；revision 防止覆盖。首片没有模型文件工具，用户明确保存的记忆在后续请求中作为有界上下文读取。

LAN HTTP 使用 `crypto.getRandomValues` 生成提交 ID；剪贴板不可用时提供手动复制。真实页面和真实回复必须分别验证，模拟测试不能替代。

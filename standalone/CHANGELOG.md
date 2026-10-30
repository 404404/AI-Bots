# Independent Bot changes / 独立 Bot 变更

This ledger concerns the fork's `standalone/` product. The original project's ledgers and MIT attribution are retained separately. Entries below describe GK50 previews, not a published registry release.

本记录只描述 fork 的 `standalone/` 产品。原项目变更记录与 MIT 归属单独保留。以下是 GK50 候选记录，不代表正式 registry 发布。

## Unreleased — employee private chat / 员工私聊

- Workers can use their explicitly authorized server-side model reference for direct private chat. The composer selects the model beside Send; model sources and private authorization are managed in global settings.
- Real child-task summaries appear chronologically in chat, with canonical input, status, executor and result in a dialog. Legacy Conversations remain accessible from private-chat history without a separate sidebar section.
- Schema 8 adds persistent private-chat pointers and explicit model choices. Requests retain stable IDs, idempotency, configuration snapshots and authorization checks, including revocation during execution. Old schema data must be backed up separately for rollback.
- 工作 Bot 通过明确授权的服务端来源引用直接私聊，发送键左侧选择模型；来源与私密授权统一从全局设置管理。
- 真实子任务摘要按发生时间进入聊天，弹窗读取同一持久任务的输入、状态、执行者和结果；旧 Conversation 从私聊历史访问，不再单独占侧栏区域。
- schema 8 保存私聊指针及明确模型选择，保留稳定 ID、幂等、配置快照及执行中撤权检查；回退需另行保留旧 schema 数据。

Source / 源码：[`e8721d4b`](https://github.com/404404/AI-Bots/commit/e8721d4b3627adbd31f658002170307533801a16)；CI：[41077763856](https://github.com/404404/AI-Bots/actions/runs/41077763856)。[Cases / 用例](../docs/acceptance/standalone-digital-employee-test-cases-2026-10-30.md) · [Results / 结果](../docs/acceptance/standalone-digital-employee-test-results-2026-10-30.md) · [Deployment / 部署](../docs/acceptance/standalone-employee-deployment-2026-10-30.md)。

Group chat is not implemented. The product browser remains blocked by worker image qualification and is unavailable in this preview. These capabilities are not covered by the private-chat acceptance.

群聊未实现；产品浏览器仍受 worker 镜像门禁阻塞，本候选不可用。私聊验收不代表上述能力交付。

## Earlier implementation notes / 早期实现记录（保留原阶段结论）


## Unreleased — 协调策略与多任务 / Coordination policy and multiple tasks

- 增加 PNG 头像的 schema 5 存储和端到端上传、替换、删除、认证读取；Bot 列表、消息、目录和任务轨迹显示统一头像或默认占位。真实 LAN 头像验收尚待完成。
- Add schema 5 PNG avatar storage with end-to-end upload, replacement, deletion, and authenticated reads; Bot lists, messages, catalog, and task traces share the avatar or an explicit default placeholder. Real LAN avatar acceptance remains pending.
- 头像输入限 2 MiB、1024×1024 与 1,048,576 像素，输出为去元数据的 PNG，最长边 256；普通命令 API 仍为 49 KiB，上传使用专用有界路由。
- Avatar input is limited to 2 MiB, 1024×1024, and 1,048,576 pixels; output is a metadata-free PNG with a 256-pixel maximum edge. The regular command API remains 49 KiB; uploads use a dedicated bounded route.
- 主 Bot 可显式绑定来源连接；主模型和工作 Bot 使用不含凭据副本的 owner 授权引用，逐请求复核授权。
- The Main Bot can bind an explicit source connection; the main model and worker use owner-authorized references without copied credentials, rechecked before each request.
- Codex 原生 toolCall 派发一个持久 worker 任务，主模型收到带任务来源信息的 toolResult 后汇总；direct CLI/API 复用相同 TaskEngine。
- A native Codex toolCall dispatches one durable worker task; the main model summarizes a provenance-labeled toolResult. Direct CLI/API tasks share the same TaskEngine.
- 增加默认关闭的所有者工作 Bot 管理策略、schema 6 操作回执、真实 create/update 工具与 owner API/CLI/Web；模型只能设置名称/persona，并从主 Bot 获准连接引用创建新 Bot，不复制凭据。
- Add an owner-controlled worker-management policy, schema 6 operation receipts, real create/update tools, and shared owner API/CLI/Web operations; model tools edit only name/persona and create from a Main Bot-authorized connection reference without copying credentials.
- 根任务最多 8 次工具调用、3 个子任务、2 个新建 Bot 和 12 轮模型请求；仍保持深度 1、4 个根请求及 2 个 worker 请求上限，超限明确拒绝且不排队。DG03真实 LAN 验收待完成。
- Each root allows at most 8 tool calls, 3 child tasks, 2 created Bots, and 12 model turns; depth remains 1, with limits of 4 root and 2 worker requests. Excess work is refused without a queue. Real LAN DG03 acceptance remains pending.
- 连接列表返回带创建/撤销时间的签名分页；Bot 目录只返回当前有效绑定，避免随着历史引用增长而膨胀。
- Connection listings use signed pagination with creation/revocation timestamps; the Bot catalog includes only current bindings so it stays bounded as history grows.
- `tasks.get` 提供非 secret 配置快照和记忆文件路径/版本清单；任务诊断单独标注 `taskId`。
- `tasks.get` exposes non-secret configuration snapshots and memory path/revision manifests; task diagnostics use a distinct `taskId` field.

## 0.1.0-alpha.1 — 既有核心路径已验证 / Initial core paths verified

- 独立后台、网页、在线 CLI、SQLite、加密授权与文件记忆；不启动 DSH。
- Independent server, Web, CLI, SQLite, encrypted authorization and file memory; no DSH Host.
- PX 已验证既有核心路径，但隔离和取消仍有部分未覆盖项；真实模型委派与 LAN 验收待完成。
- PX verified the initial core paths, with some isolation and cancellation cases still uncovered; real-model delegation and LAN acceptance remain pending.
- 隔离 Compose 和未发布 CI 候选；完整门禁前不发布镜像。
- Isolated Compose and unpublished CI candidates; registry publication waits for complete acceptance.

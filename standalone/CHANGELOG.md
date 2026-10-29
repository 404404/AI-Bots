# Independent product changes

## Unreleased — 单 worker 委派 / Single-worker delegation

- 主 Bot 可显式绑定来源连接；主模型和工作 Bot 使用不含凭据副本的 owner 授权引用，逐请求复核授权。
- The Main Bot can bind an explicit source connection; the main model and worker use owner-authorized references without copied credentials, rechecked before each request.
- Codex 原生 toolCall 派发一个持久 worker 任务，主模型收到带任务来源信息的 toolResult 后汇总；direct CLI/API 复用相同 TaskEngine。
- A native Codex toolCall dispatches one durable worker task; the main model summarizes a provenance-labeled toolResult. Direct CLI/API tasks share the same TaskEngine.
- 增加任务快照、单层/单 worker 限制、截止时间、取消、幂等和失效连接拒绝；未实现多 worker、队列及模型内创建/编辑工作 Bot。
- Add task snapshots, one-worker/one-level limits, deadlines, cancellation, idempotency, and refusal for stale connections; multiple workers, queues, and model-driven worker creation/editing are not implemented.
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

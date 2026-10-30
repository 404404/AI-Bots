# Independent product changes

## Unreleased — 单 worker 委派 / Single-worker delegation

- 增加 PNG 头像的 schema 5 存储和端到端上传、替换、删除、认证读取；Bot 列表、消息、目录和任务轨迹显示统一头像或默认占位。真实 LAN 头像验收尚待完成。
- Add schema 5 PNG avatar storage with end-to-end upload, replacement, deletion, and authenticated reads; Bot lists, messages, catalog, and task traces share the avatar or an explicit default placeholder. Real LAN avatar acceptance remains pending.
- 头像输入限 2 MiB、1024×1024 与 1,048,576 像素，输出为去元数据的 PNG，最长边 256；普通命令 API 仍为 49 KiB，上传使用专用有界路由。
- Avatar input is limited to 2 MiB, 1024×1024, and 1,048,576 pixels; output is a metadata-free PNG with a 256-pixel maximum edge. The regular command API remains 49 KiB; uploads use a dedicated bounded route.
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

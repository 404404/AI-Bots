# 数字员工私聊 API 契约

范围：standalone 独立 Node 服务。所有命令继续走 `POST /api/v1/command`，请求 envelope 为 `{ "command": string, "params": object }`，成功响应为 `{ "schemaVersion": 1, "result": ... }`。CLI 使用同一 JSON 命令和 owner session。所有命令都要求 owner session；错误 envelope 使用稳定 `error.code`，未认证为 `unauthorized`。

## 私聊入口与历史

- `private-chat.open { botId }`：幂等初始化 Bot 私聊状态；首次确定性采用最近活动的已有 Conversation（活动时间相同按 conversation ID 降序），无历史时只创建一个“私聊”。返回 `{ botId, conversation: { id, botId, title, createdAt }, selection }`。初次只恢复已有主 Bot 绑定或工作 Bot 委派引用；没有共享引用时 `selection` 为 `null`。旧 Conversation 不删除。
- `private-chat.history { botId, limit?, cursor? }`：返回 `{ items: [{ id, botId, title, createdAt }], nextCursor, hasMore }`，游标按 Conversation SQLite seq 升序翻页。可通过 `private-chat.select-conversation { botId, conversationId }` 将已有历史设为当前入口并续聊。跨 Bot ID 返回 `not-found`。

## 模型选择

选择值只有以下两种：

```json
{ "kind": "connection", "connectionId": "...", "modelId": "..." }
{ "kind": "local", "modelId": "..." }
```

- `private-chat.models { botId }` 返回 `{ botId, items: [{ selection, provider, model, label, status }], selected }`。只列当前 Bot 可用来源；连接项由服务端授权引用解析。Codex 使用锁定 SDK `getModels()` 目录；兼容 API 只返回该来源已配置的单一模型。不会返回凭据。
- `private-chat.select-model { botId, selection }` 校验并持久化明确选择，返回同 `private-chat.models`。
- `runs.submit` 兼容旧调用。新的 UI 应显式传完整 `selection`。省略时使用已保存的明确选择，或既有主 Bot 绑定/工作 Bot 委派引用；本地来源必须由请求显式选择或先调用 `private-chat.select-model` 保存。没有选择时以 `model-selection-required` 拒绝，不发出模型请求。首次初始化不自动选本地模型；失效的既有共享引用会保留并在发送时明确拒绝，不回退。本地 CLI 首次发起 Run 时必须传 `selection`，或先保存选择。显式选择无效时拒绝，不回退。Run 和 Task 快照绑定模型、selection、配置版本、连接 ID/epoch 与来源 Bot ID；每次请求发出前重新校验授权引用或本地配置 epoch。
- 重用幂等键时，正文必须相同；显式选择也必须与第一次完全相同，否则 `idempotency-conflict`。不带 selection 的旧式重试返回原 Run，即使之后配置变更也不重执行。
- `model-selection-required`、`connection-not-found`、`connection-revoked`、`connection-changed`、`connection-unconfigured`、`model-not-authorized`、`model-not-configured`、`model-credential-missing` 为明确拒绝，不静默选择其他模型。

## 时间线

`private-chat.timeline { botId, conversationId, direction?, limit?, cursor? }` 返回 `{ botId, conversationId, direction, items, nextCursor, hasMore }`。`direction` 默认 `forward`；`forward` 从最早项按 keyset 向新记录读取，`backward` 无 cursor 时读取最新一页，再以游标向更早记录读取。两个方向都按 `(createdAt ASC, id ASC)` 返回，SQL 使用对应方向的 keyset、排序与 `LIMIT limit+1`；不全量扫描历史。游标 scope 包含 Bot、Conversation 和方向，跨范围、方向误用或篡改游标以 `invalid-cursor` 拒绝。默认 50 项，最大 100 项。

每项固定有 `id`, `type`, `createdAt`：

- `type: "message"`, `id: "message:<messageId>"`, `message: { id, runId, role, content, createdAt }`。
- `type: "task"`, `id: "task:<taskId>"`, `task: { id, rootId, parentId, initiatorBotId, executorBotId, sourceBotId, status, errorCode, createdAt, finishedAt, runId }`。只投影当前私聊 Run 的真实子任务；更新状态不改变 ID 或排序时间。

`private-chat.task-detail { botId, conversationId, taskId }` 只允许查询该 Conversation Run 关联的子任务，返回 `{ botId, conversationId, root, items }`，其中 root/items 使用公开 Task 形状，含真实 input、result、errorCode、执行者、父子 ID 与时间。跨员工/历史 Conversation 查询返回 `task-not-found`。详情是 SQLite canonical task 记录，不从客户端状态拼装。

## 限制

本切片不增加群聊命令。已部署候选为 schema 6；浏览器源码在 schema 7 保持 `browser-unavailable` 拒绝。此切片本地 schema 升级到 8 仅新增私聊状态表，不声称浏览器已交付。

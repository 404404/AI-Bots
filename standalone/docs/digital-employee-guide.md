# 员工私聊、模型与协作记录

这是独立产品的第一片使用说明。群聊仍未实现，产品浏览器仍未通过交付门禁。访问地址、当前镜像和访问码获取方式见 [GK50 运行说明](../../docs/standalone-bot-gk50.md)；逐项结果见 [Terra 验收](../../docs/acceptance/standalone-digital-employee-test-results-2026-10-30.md)。

## 网页操作

1. 登录后，点击侧栏中的员工即可私聊，包括工作 Bot。已有旧对话从聊天内的“历史记录”打开并继续，不再单独占侧栏区域。
2. 在“来源与授权设置”中配置来源及 Codex 登录。模型凭据只保存在来源；为主 Bot 绑定来源，为工作 Bot 明确授予委派来源。工作 Bot 不需要复制 OAuth 或重新登录。
3. 返回员工私聊，在发送键左侧选择模型再发送。如果创建私聊后才授权，仍需明确选择；页面不会偷偷选择第一项。可用模型受来源授权和锁定 SDK 目录限制。
4. 向主 Bot 提出使用指定员工的任务。真实子任务摘要按发生时间插入聊天记录，点击摘要打开协作详情，查看实际输入、执行者、状态、结果或错误。摘要不固定悬在输入框上方。
5. 员工身份页可以修改名称、角色和 PNG 头像；修改名称不改变 Bot ID。文件记忆需由用户明确保存，聊天和任务结果不自动变成记忆。

失效来源会明确报错；不会自动改用其他来源。模型自称“主 Bot”、角色提示或任务结果都不能授予权限。

## CLI 和 API

CLI 连接同一个已认证服务，命令均使用同一业务实现。先在 GK50 将访问码保存在私密文件，再用 `login --code-file` 登录；不要把访问码放入命令参数或聊天。配置 `BOT_URL` 与 `BOT_SESSION_FILE` 后执行：

```sh
node --experimental-strip-types standalone/src/cli.ts private-chat.open --input-file bot.json
node --experimental-strip-types standalone/src/cli.ts private-chat.models --input-file bot.json
node --experimental-strip-types standalone/src/cli.ts private-chat.select-model --input-file selection.json
node --experimental-strip-types standalone/src/cli.ts runs.submit --input-file message.json
node --experimental-strip-types standalone/src/cli.ts runs.get --input-file run.json
node --experimental-strip-types standalone/src/cli.ts runs.cancel --input-file run.json
node --experimental-strip-types standalone/src/cli.ts private-chat.history --input-file bot.json
node --experimental-strip-types standalone/src/cli.ts private-chat.timeline --input-file timeline.json
node --experimental-strip-types standalone/src/cli.ts private-chat.task-detail --input-file detail.json
```

输入文件形状如下；Bot、Conversation、连接和模型 ID 应从上述命令的实际响应取得，不按名称猜测。

```json
{
  "botId": "<稳定 Bot ID>",
  "selection": {
    "kind": "connection",
    "connectionId": "<该 Bot 已授权连接 ID>",
    "modelId": "<该连接允许的模型 ID>"
  }
}
```

```json
{
  "botId": "<稳定 Bot ID>",
  "conversationId": "<private-chat.open 返回的 ID>",
  "idempotencyKey": "<本次发送的唯一稳定 ID，重试保留>",
  "content": "请计算 17 乘以 23。"
}
```

`runs.get` / `runs.cancel` 输入 `{ "botId": "...", "runId": "..." }`；时间线输入 `{ "botId": "...", "conversationId": "...", "direction": "backward", "limit": 50 }`，下一页原样传回 `cursor`；详情在同一范围加 `taskId`。切换旧历史使用 `private-chat.select-conversation`。相同幂等键与相同请求只返回原 Run，修改内容、模型或上下文会冲突。

API 为 `POST /api/v1/command`，请求 `{ "command": "private-chat.timeline", "params": { ... } }`。成功响应外层固定 `schemaVersion: 1`，错误提供 `error.code`；未认证返回 401 `unauthorized`。完整分页、选择及错误合同见 [API 契约](digital-employee-contract.md)。

以下是**不含 Credential 的示例响应**，不是某次真实模型执行的证据：

```json
{
  "schemaVersion": 1,
  "result": {
    "botId": "11111111-1111-4111-8111-111111111111",
    "conversationId": "22222222-2222-4222-8222-222222222222",
    "direction": "backward",
    "items": [
      {
        "id": "message:33333333-3333-4333-8333-333333333333",
        "type": "message",
        "createdAt": "2026-10-30T15:30:00.000Z",
        "message": {
          "id": "33333333-3333-4333-8333-333333333333",
          "runId": "44444444-4444-4444-8444-444444444444",
          "role": "assistant",
          "content": "391",
          "createdAt": "2026-10-30T15:30:00.000Z"
        }
      }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

旧 `deepseekbot` 的只读 Bot、Session、Channel Timeline、Activity、Assignment 命令继续由旧 Host 保有数据权威；此独立服务不启动旧 Host、不复制这些数据，也不伪造这些尚未迁移的对象。

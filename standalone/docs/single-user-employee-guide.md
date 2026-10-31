# 单用户员工与群聊候选

本文描述本轮开发候选的接口；实际部署状态及验收结论见[独立验收记录](../../docs/acceptance/standalone-single-user-employee-results-2026-10-31.md)。旧版本的 20443 不会因为本文更新而自动获得这些能力。

## 网页

1. 在设置中配置一次模型账户并完成登录。已有数据如果存在多个可用旧来源，需要明确选择；提供方列出的候选模型并不代表账号已经验证可用。
2. 创建员工时填写名称和身份定义。系统立即保存一条标明为预设的询问；模型可用时另行分析名称和身份，失败时可重试。预设内容不冒充模型回复。
3. 一个员工时自动作为主要联系人；有多个员工且尚未选择时，页面要求用户指定。员工名称、角色和模型回复不能赋予管理权限。
4. 创建群聊，选择已有员工。发送消息时明确选择一至三位回应者和模型；群内成员、消息和每次执行状态持久保存。每个群同时处理一条发送链，繁忙时返回明确错误，稍后可用同一操作 ID 重试。
5. 主要联系人可按用户请求或任务需要调用已有员工，结果与来源在对话中查看。员工由用户创建和定义，模型不能创建或修改员工。文件记忆仍需用户明确保存。

## CLI 与 API

使用已认证会话，命令参数从标准输入或私密 JSON 文件读取；密钥和授权答复不要放到命令行或聊天中。以下示例中的 ID 均为占位符：

```sh
node --experimental-strip-types standalone/src/cli.ts model-account.get
node --experimental-strip-types standalone/src/cli.ts contacts.get
printf '%s' '{"employeeId":"<bot-id>"}' | node --experimental-strip-types standalone/src/cli.ts contacts.set-primary
printf '%s' '{"name":"示例群","memberBotIds":["<bot-id-1>","<bot-id-2>"]}' | node --experimental-strip-types standalone/src/cli.ts groups.create
printf '%s' '{"groupId":"<group-id>","text":"请分别介绍职责","recipientBotIds":["<bot-id-1>","<bot-id-2>"],"modelId":"<model-id>","idempotencyKey":"<unique-operation-id>"}' | node --experimental-strip-types standalone/src/cli.ts groups.send
printf '%s' '{"groupId":"<group-id>"}' | node --experimental-strip-types standalone/src/cli.ts groups.messages
```

`groups.get` 返回群成员与最近执行，`groups.run` / `groups.cancel` 接收 `groupId` 和 `runId`；`groups.members.set` 接收 `groupId` 和完整 `memberBotIds`。`employees.onboarding.status` / `employees.onboarding.retry` 接收 `botId`。命令与网页通过同一认证业务入口执行。群响应依照服务端持久序号排列，成员按稳定 ID 区分。

账户切换、登出或模型连接变更会使旧的在途结果失效。显式代理不可用时返回错误，不自动回退直连。服务重启时未完成任务标记为中断，不自动重发。浏览器执行能力仍以单独的安全门禁和验收记录为准。

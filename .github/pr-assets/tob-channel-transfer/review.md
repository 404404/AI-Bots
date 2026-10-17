---
title: Tob 的群组结束与附件留存
subtitle: Draft PR 2127 · 审批、冲突检查与验证边界
lang: zh
template: doc
source: https://github.com/BotHarness/DeepSeekBot/pull/2127
base: a3e2c4e64d131191e686e33cb207d3db9b3a0937
reviewed-revision: 6396cbd26d98042898443dda7333781b5f2e7a79
date: 2026-10-18
---

## A 本次交付

Tob 通过普通 Shell 调用现有 CLI。
新增操作复用现有 Host 所有者与审批。

| 操作              | 人能审阅什么                        | 最终效果                 |
| ----------------- | ----------------------------------- | ------------------------ |
| group-delete      | 群组快照、指纹、结束所有成员关系    | 结束群组，保留历史与 Bot |
| attachment-upload | 文件名、字节数、SHA-256、不发送标记 | 留存文件，返回附件引用   |

这是叠在 Channel 个人设置之上的 Draft。
Native 自动化已通过，Human QA 尚未完成。
没有合并或发布。

## B 审批前后都检查权限

```flow
Human -> CLI: 直接操作
Tob -> Shell: 普通工具
Shell -> ScopedCLI: 临时受限凭证
ScopedCLI -> Review: 准备精确提案
Review -> Recheck: Human 决定
Recheck -> Owner: 重新检查后执行
CLI -> Owner: 同一所有者
```

结束群组需要显式确认。
Tob 每次都需要新的 Human 决定。
已保存许可和完全访问不会跳过这一步。

批准后若群组指纹变化，操作拒绝执行。
权限撤销后也不能继续写入。

[审批源码](https://github.com/BotHarness/DeepSeekBot/blob/6396cbd26d98042898443dda7333781b5f2e7a79/packages/core/src/tob/cli-approval.ts#L21)

## C 文件如何留存

只接受规范路径上的普通文件，大小不超过 25 MiB。
客户端拒绝符号链接、目录和读取期间变化的文件。

Human CLI 传输经过认证的原始字节。
Tob CLI 通过临时 broker 传输有上限的字节。
Host 不接收任意本地路径。

| 同一个 upload-id   | 结果               |
| ------------------ | ------------------ |
| 相同内容和名称     | 返回同一个附件引用 |
| 内容或名称变化     | 拒绝，避免覆盖     |
| 权限在暂存期间撤销 | 拒绝，不发布附件   |

审批不包含文件正文或来源路径。
上传不会向任何会话或外部渠道发送文件。

[执行与检查源码](https://github.com/BotHarness/DeepSeekBot/blob/6396cbd26d98042898443dda7333781b5f2e7a79/packages/core/src/tob/cli-channel-operations.ts#L173)

## D 实际证据

| 检查              | 结果与范围                                  |
| ----------------- | ------------------------------------------- |
| focused tests     | 初次 330/334；修正四项后相关 110/110        |
| TypeScript 与构建 | 根项目、Mobile 类型检查与已提交源码构建通过 |
| direct CLI        | 上传、重复、冲突、群组结束与保留历史通过    |
| Tob Web           | 拒绝、状态过期、批准结束、附件上传通过      |
| 同一 Profile 重启 | 群组历史与附件引用回读通过                  |
| macOS Desktop     | direct CLI、四条 Tob 路径与真实重启回读通过 |
| Human QA          | 仍待 Human 检查，不能视为通过               |

四条成功模型请求实际使用官方 DeepSeek 路由。
首次 Go 配额失败已保留。
旧会话页脚标签不代表后续请求的模型归因。

运行产品源码是 c125e7059。
审阅版本是 6396cbd26。后续提交只补审阅资产。
Native 测试使用相同产品源码，无额外构建。

[真实截图与证据限制](https://github.com/BotHarness/DeepSeekBot/tree/6396cbd26d98042898443dda7333781b5f2e7a79/.github/pr-screenshots/tob-channel-transfer)

## E Native 与发送边界

原始 absolute Profile home 在 Desktop 测试中保留。
主任务按队列启动独立候选，并恢复原 Desktop。

| Native 路径  | 实际结果                       |
| ------------ | ------------------------------ |
| 拒绝审批     | approval-denied，群组保留      |
| 审批期间改名 | stale-channel，新名称保留      |
| 批准结束     | 群组结束，历史保留             |
| 选定文件上传 | 仅留存附件，无自动文件发送     |
| 真正重启     | 回读本轮 Native 群组与附件引用 |

19 张截图已逐张检查。30 个 JSON 均可解析。
两次运行的页面错误列表均为空。
四个完成回合均调用普通 Shell 中的真实 CLI。
审批决定与独立 Human CLI 回读互相印证。

## F 审阅重点与恢复

群组结束会清除成员关系，但保留历史。
该操作没有面向用户的恢复入口，属于单向门。
回退代码会关闭新增 CLI 入口。

重点检查 Human 来源、每次审批和指纹重查。
同时检查文件大小、权限重查和重复上传冲突。

运行截图中的群组没有 Bot 成员。
成员清理由所有者测试覆盖，截图不证明该分支。
原有归档成员移除和暂停 Bot 邀请取消语义不变。

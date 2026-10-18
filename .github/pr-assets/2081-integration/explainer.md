---
template: sheet
title: Tob 最终集成：请求来源与权限边界
subtitle: Issue2081 · Draft PR2149 · 16个独立功能层之后的窄范围修复
lang: zh
cols: 2
review-source: 54c09227a05d08a107bbe28e157d6e21249daf17
native-built-source: 205a5bdaf503ffa061620507d745f482f716d81c
web-built-source: 15caaba496b2ed620b249e6b70efc9e315df6d70
qualified-packages-tree: c6692101c248592c5ca1cc006b76ab8b03658d55
review-test-tree: 87d2de82c1836a67570f6b7c84a799595acbaeed
---

最终修复保留完整权限校验，让新 Human 请求能在混合上下文中使用。
所有 PR 保持未合并，仍待精确版本 CI 与 Human QA。

## A 请求来源与上下文各负其责

```flow LR
新Human私聊 -> 可信操作来源: 精确Source Event
可信操作来源 -> Memory只读任务: 绑定该Human事件
可信操作来源 -> 当前Client: 使用事件捕获的目标
完整已接受上下文 -> 既有权限校验: Turn与上下文版本
既有权限校验 -> Memory只读任务: 每次操作仍须有效
既有权限校验 -> 当前Client: 每次操作仍须有效
```

Memory Triage 可包含既有事件和新 Human 私聊。
操作来源取经过校验的唯一 Human 输入。
完整上下文继续约束操作，不会变成新的授权。
来源撤销、身份变化或旧审批仍须拒绝。

## B 只读范围提前拒绝二进制写入

```flow LR
上传请求 -> 认证与当前权限: 既有校验
认证与当前权限 -> Assignment只读范围: memory-read-only
Assignment只读范围 -> 明确拒绝: 不解析元数据或接收正文
认证与当前权限 -> 其他允许范围: 继续既有所有者
```

原检查最终会拒绝写入，但会先等待二进制正文。
现在先拒绝，避免无权请求消耗大正文资源。
原始 HTTP 回归不发送正文，验证拒绝不等待。
它还断言没有准备操作、审批或设置写入。

## C CLI 帮助与附件边界

| 内容           | 最终行为                             |
| -------------- | ------------------------------------ |
| 显式 Client    | 提供Client ID与generation            |
| Tob的current   | 取当前Human私聊目标，不带generation  |
| 唯一已连接窗口 | 不会自动成为隐式目标                 |
| 4MiB附件回归   | 通过既有所有者上传并重放，不发送消息 |
| 历史null元数据 | 三行兼容修复归属前置备份PR2141       |

顶层没有新增迁移。
底层 schema100、101、102 的恢复要求继续适用。

## D Web 与冷恢复实际证明了什么

| 路径                        | 实际结果                                   |
| --------------------------- | ------------------------------------------ |
| 活跃Memory Triage的同一Turn | ok 新Human偏好写入及只读Memory任务         |
| 只读子任务                  | ok 两Bot不可变Memory比较，备份请求明确拒绝 |
| 单独自然Human备份           | ok 实际预览、审批、导出和检查              |
| 停止状态冷恢复              | ok 规范记录与历史用量完整保留              |

Web 构建是15ca，最终产品源码与它相同。
最终测试树包含另行通过的大小限制回归。
自然备份包含 Human 与 Memory 上下文。
这不能证明备份请求在活跃 Triage 的同一 Turn 插入。
便携 Session 持久化适配器不支持，证据明确保留该限制。

冷恢复逐行比对了1条计划创建收据、1条Memory范围、45条用量与1条状态。
恢复目标未启动，Assignment停止，Grant与计划关闭，Tob身份清除。
保留 Memory 范围记录不会恢复能力。

## E 最终构建与桌面证明

| 检查                 | 结果                                        |
| -------------------- | ------------------------------------------- |
| 最终205a类型与构建   | ok 类型通过，构建5813ms                     |
| 四项关键集成回归     | ok 备份规范记录与提前上传拒绝               |
| 182个工作区链接      | ok 全部指向当前工作树                       |
| 实际macOS新Human读取 | ok 当前通知、两Bot Memory与最近进展         |
| 同Profile新进程回读  | ok 同一Human已handled，5个调用所属Turn完成  |
| 精确版本CI           | warn 公开PR各自运行，不能借用旧版本绿色结果 |

最终桌面构建绑定205a与五项产物哈希。
公开源码与205a仅有一项测试修正，产品源码和构建产物未变。
测试使用有效JSON与空白，确认普通命令大小限制。
实际模型读取成功后，验证器曾误读状态结构而失败。
只读重启核验了同一条请求，没有再发模型请求。

## F 审查与保留边界

前16个PR保留各自范围、旧审查引用与截图来源。
顶层只包含共享来源、上传拒绝、帮助与相关回归。
原失败记录与后续通过分别保存。
物理设备、外部服务、公开发行版安装与Human QA仍未完成。
没有合并、发布或部署。

- [最终集成Draft2149](https://github.com/BotHarness/DeepSeekBot/pull/2149)
- [父规格2081](https://github.com/BotHarness/DeepSeekBot/issues/2081)
- [前置备份2141](https://github.com/BotHarness/DeepSeekBot/pull/2141)
- [当前顶层差异](https://github.com/BotHarness/DeepSeekBot/compare/d3421e2a76cd24c6881ca36d5431393af6a331ae...54c09227a05d08a107bbe28e157d6e21249daf17)

---
title: Tob：选定内容与工作进度
subtitle: 只读 owner 查询、当前 Human 请求、有界引用数据
lang: zh
template: doc
source: 产品895efde6；检查850996f9；基线5d44b7a；2026-10-18
---

Tob 现在可以回答“这个 Channel 说了什么”和“这个 Bot 正在做什么”。结果来自既有规范查询，消息中的指令不产生管理权限。

## A 一次明确的读取

```flow
Human -> Tob: 选定 Bot 或 Channel
Tob -> CLI: channel-content / bot-progress
CLI -> Owner: 当前可信私聊与只读检查
Owner -> Result: 有界页、来源、完整性
Result -> Human: 事实与引用主张分别说明
```

直接 Human CLI 和 Tob 经同一 Host owner。Tob 不接收 Human token，不加入目标 Channel，也不把范围传给 Assignment。

## B 现有 owner 继续决定可见性

| 查询            | 规范事实                                       | 明确省略                      |
| --------------- | ---------------------------------------------- | ----------------------------- |
| channel-content | 当前 Human timeline；DM、Bot 间 DM、可见 Group | 审批/私密结构化载荷、附件字节 |
| bot-progress    | Registry、Assignment Directory、进程状态       | 全 Session 日志、凭据和权限   |
| 引用消息与报告  | 原文、来源、时间                               | 不能把自报当执行完成证明      |

普通 Bot 成员检查保持原样。Human 不可见 Group、已删除 Channel、归档或缺失 Bot 拒绝，不回退到原始数据库。

## C 有界结果与失效条件

每页1–20项，总响应最多8 KiB；正文块最多1,000 UTF-8字节。消息与任务目录最多遍历1,000项，选定正文最多一百万 UTF-16单元，Unicode边界不拆字符。

游标签名绑定目标身份、修订、锚点和遍历位置。内容变化拒绝旧页，目标更换拒绝旧指纹。Host 重启使旧游标失效；重新读首页可继续。没有新 schema，也没有第二份事实存储。

## D 已有证据与剩余门

| 门             | 状态与范围                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| 源码           | 171个不同 focused case、类型、规则、一次构建通过；独立审查关闭两项边界问题                      |
| 真实 Web       | 官方模型在未获 marker 答案的请求中读取三个 Channel 类型及 Bot 进度，completed/handled/回复/idle |
| 重启与直接 CLI | 同 home 新读、旧游标失效、签名篡改、追加后过期、多字节分块通过                                  |
| Native         | 真实第二轮、同 home 进程重启、新读和保留回复可见截图通过                                        |
| CI             | 最终 head 全套 CI 待确认，不能用前一 head 代替                                                  |
| Human / 集成   | 尚待，不合并、不发布                                                                            |

实际截图只展示请求与回复交互，不代表 UI 布局改版。首次 selector、seed 和 Session 就绪失败保留在任务日志，修正后结果单独记录。

## E 审查重点

这是可回退的代码变更：撤销后停止提供新增查询，无数据迁移。可见范围涉及所有本地 Human 可读会话，泄漏的影响较大。审查重点是 timeline 过滤、私密字段白名单、可信 Human 范围、游标签名及拒绝路径。

产品源码固定在895efde6，测试契约修正850996f9；之后文档、验证器和图片不改变已验证产品。本文是审查说明，不是运行成功、Human批准或上线证明。

## F 固定来源

[Draft PR #2143](https://github.com/BotHarness/DeepSeekBot/pull/2143)。源码与证据分别绑定，最终 head 由 PR 评论补充。初次 CI 的注册清单漏项已用单项红/绿回归修正，产品不变。

```text
base    5d44b7a6507d661415881808ab67e74275d54182
product 895efde6aa3aa616d3f0968f23d4363477fbf2c7
checks  850996f987b43244575af4f97467f29bd29e57b9
fixture b60b246767cfe59fa59d4e66262075838b70c906
assets  19faf29422716b55ceaee9da572f17a256a82630
```

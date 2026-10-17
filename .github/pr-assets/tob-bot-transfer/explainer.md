---
title: Bot ZIP 导出的审核与内容边界
subtitle: 受审核的 Bot ZIP 导出与真实 Web 证明
lang: zh
template: doc
PR: Draft · #2089 transfer slice
base: a3e2c4e64d131191e686e33cb207d3db9b3a0937
head: 3095104181d3c6e92ae74ead4c2bbfba6d76f400
date: 2026-10-18
---

## A 当前交付状态

此提交补齐文件列表和受审核 ZIP 导出。
现有 ZIP owner 继续生成归档。
此源码的 233 项测试、类型检查和构建已通过。
隔离 Web 的实际 CLI、模型审核、导入与重放也已通过。

## B 请求经过哪些 owner

```flow LR
Human CLI -> Transfer: 读取文件快照
Tob Shell -> Broker: 当前 Human DM 执行
Broker -> Review: 准确文件与历史范围
Review -> Transfer: 审核后重新检查
Transfer -> ZIP owner: 保留原导出规则
ZIP owner -> Private output: 二进制私密输出
```

## C 内容变化怎样阻止旧提案

指纹覆盖实际纳入文件内容、身份与 Git refs。
源码在捕获前后核对指纹。
新输出使用 exclusive 创建和 0600 权限。
归档内容不会进入模型 JSON 返回值。

```ts src=packages/core/src/bots/transfer.ts lines=95-110

```

[精确源码](https://github.com/BotHarness/DeepSeekBot/blob/3095104181d3c6e92ae74ead4c2bbfba6d76f400/packages/core/src/bots/transfer.ts#L95) 可供审阅。

## D 保留哪些边界

| 项目           | 协议                                     |
| -------------- | ---------------------------------------- |
| Tob 审批       | 当前真实 ToolExecution 与已准入 Human DM |
| 归档内容       | 准确选择、必要展示文件及可选历史         |
| 覆盖已有文件   | 拒绝                                     |
| 导入 Tob 人格  | 新普通身份，不复制管理 role              |
| 真实网络丢回复 | 未验证                                   |

## E 实际 Web 证明与后续边界

| 层次                               | 结果                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| 源码检查                           | 精确源码 309：233 项测试、类型检查、构建通过             |
| Human CLI                          | 文件列表、选定 ZIP、0600 输出、SHA256 与已有文件拒绝通过 |
| 导入                               | SOUL 保持；未选择的 Memory 和历史不进入 ZIP              |
| Tob 导出                           | 实际文件范围审核、二进制输出和源状态不变通过             |
| 拒绝与过期                         | approval-denied、stale-bot-files 均无输出                |
| 重放                               | 原 Human 请求与 Turn 4 完成，复用原身份，不改后续资料    |
| Tob 人格导入                       | 新普通 Bot；原受保护 Tob 身份保持不变                    |
| 同 Profile Web 重启                | 身份、DM、Memory 与回执读回通过                          |
| macOS / 新整合运行 / Human QA / CI | 尚未执行                                                 |

原生 Shell 执行确认与内部管理审核是两层确认。
这里只批准具体命令一次，没有改全局或记住授权规则。
旧审核拒绝过期状态后，模型读取新状态并提出新申请。
Human 拒绝该新申请，没有再次导出。

保留了预览弹窗、等待超时及 Shell 显示格式的脚本失败。
续验使用同一原 Human 请求，没有重复发模型提示。
重放表示答复无法确认后的回执核对，不是注入真实网络丢包。
同 Profile 重启、原生及新整合构建的证明分别记录。
本页是实现说明，不代表 Human 批准。

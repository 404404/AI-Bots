---
title: PR 1995：验证一个真正空闲的 Bot
lang: zh
template: doc
base: 94d08913d214063512605a31db674c334afbfabd
head: 1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31
date: 2026-10-16
---
## A 这一条路径证明什么
从桌面 Bot mode 打开 Activity Center，显示一个新建 PersonaBot 的 Idle 卡片。

同一个 Bot ID 的 activity、attention 和 overview CLI 读取确认：空闲、没有待处理项、没有正在执行的 Session。
这只验证一个明确行为。完整 Inbox、模型、原生设备和 IM 不在本次通过范围。

## B 事实来自哪里
```flow
功能地图 -> 隔离Host
隔离Host -> 现有CLI创建Bot
现有CLI创建Bot -> Web真实操作
Web真实操作 -> 可见Idle卡片
可见Idle卡片 -> CLI权威读取
CLI权威读取 -> 提交绑定的证据行
```
没有测试专用 API，也没有第二份产品状态。证据文件只记录过程。

浏览器操作使用可访问名称。PersonaBot ID 同时连接界面卡片和 Host 读取。
[查看运行脚本](https://github.com/BotHarness/DeepSeekBot/blob/1ab9f563cff2da3e0139a76adaa94ab9f7e7ce31/scripts/e2e-activity-idle.mjs)。

## C 什么时候不能继续通过
| 状态 | 判断 |
| --- | --- |
| 未运行 | 没有选择运行记录 |
| 通过 | 界面与权威读取一致，证据完整，截图和 ARIA 已检查 |
| 失败 | 操作、观测或视觉检查失败 |
| 前提阻塞 | 隔离 Host 或运行环境不可用 |
| 需重验 | 提交不符、来源未提交、记录不完整、证据变化或视觉检查待完成 |

每次尝试都有独立目录。第一次失败不会被重跑或失败处理覆盖。

截图检查记录绑定截图和 ARIA 的摘要。它是 Agent 的视觉检查，不替代 Human QA。

## D 评审与 Human 反馈
44 项相关回归已通过。干净提交上的真实 UI/CLI 路径及视觉检查已通过。

探索阶段发现全页截图与 DOM 不一致，最终使用固定视口并在截图后重新核对卡片。
早期探索证据继续保留，不能当作最终提交的通过证据。

CI 和受控失败检查以 PR 的最新证据评论为准。所有本任务 Host 会在交付前停止。
Human 需对实际行为和证据行格式给出反馈；处理修正后才能关闭 #1972。

[PR、共享证据和操作步骤](https://github.com/BotHarness/DeepSeekBot/pull/1995)。

---
template: sheet
title: Home：创建 Bot 与事实概览
subtitle: Issue2081 · Draft评审资料，未授权合并
lang: zh
cols: 2
source-head: ffb727860e1fa2ea3423e30ec0d74775d047b481
product-build: 62e9b9981e138219c8ec2cfe01d435e8510d3221
pr: 2140
base: 5d44b7a6507d661415881808ab67e74275d54182
generated: 2026-10-18
---

Home 内嵌简单创建流程，并通过既有数据所有者展示状态。
说明覆盖源码ffb727860e1fa2ea3423e30ec0d74775d047b481，后续提交仅增加评审证据。

## A 用户看到什么

| 入口               | 结果                               |
| ------------------ | ---------------------------------- |
| Home 创建 Bot      | 名称必填，其他配置折叠             |
| Git、ZIP、空白切换 | 保留分组目标和各自草稿             |
| Home 四张卡片      | 显示待处理、执行中、用量和最近活动 |
| 最近活动或事项     | 打开既有对话或任务面板             |
| Home 输入          | 复用消息编辑器，提交到 Tob 私聊    |

## B 数据由谁负责

```flow LR
Home -> 创建状态: 来源、分组、草稿
创建状态 -> 既有创建导入所有者: 提交一次
Home -> Host查询: 当前快照
HumanCLI -> Host查询: 相同权限边界
Host查询 -> HumanAttention: 事项与未读
Host查询 -> Runtime与Ownership: 真正执行的根会话
Host查询 -> Channel与Assignment: 实际活动时间
Host查询 -> UsageProjection: 精确时间范围
```

原生审批和提问先交给已校验的频道所有者。
未知请求只回退一次，取消与拒绝保持终态。
Home 不启动轮询或模型报告。
访问页面和修改频道名称不会提升最近活动排序。

## C 用量如何保持诚实

```flow LR
可信用量事件 -> 既有收据: 去重并保留时间和可空总量
既有收据 -> 索引查询: 精确起止时间
索引查询 -> 完整: 范围覆盖且总量已知
索引查询 -> 部分: 覆盖缺口或记录截断
索引查询 -> 未知: 无法确定总量
```

迁移102扩展既有匿名收据，没有新增指标仓库。
查询最多读取50001条标量记录，不读取原始会话日志。
历史缺口不会因新增字段而变成零。
已有启动重建独立运行，不由 Home 触发。

## D 兼容与恢复

```callout warn 数据库升级需要恢复方案
迁移102依赖100和101。
旧 Host 会拒绝更新后的数据库代次。
回退需要升级前数据库备份，或兼容新代次的修复版本。
```

覆盖边界、去重、保留和显式清除是评审重点。
失败卡片单独显示不可用，其他卡片继续显示。
960像素及更窄窗口沿用既有紧凑私聊路径。

## E 已有证据与剩余检查

| 检查                                  | 状态                                     |
| ------------------------------------- | ---------------------------------------- |
| 初始dca的209项测试、类型、策略与构建  | ok 通过                                  |
| 当前62的顺序7项、桥接17项、类型与构建 | ok 通过，其他51项 owner 回归通过         |
| 构建后的 Client 包契约7项             | ok 通过                                  |
| Web 四卡片、精确范围和来源跳转        | ok 通过                                  |
| Web 简单真实对话、完成投递与正数用量  | ok 通过                                  |
| macOS 四卡片、真实对话、创建与重启    | ok 原产品dca独立验证                     |
| 新审批/提问桥接 macOS                 | ok 真实来源、回答/拒绝与完整 Turn        |
| Web 缺少模型创建、真实提问与审批      | ok 真实来源、回答/拒绝及完成回读         |
| Git/ZIP 执行及降级用量状态            | warn 既有导入 owner 的门；用量运行态另验 |
| Human QA、完整 CI、整合栈             | warn 独立检查，尚未通过                  |

早先提问和审批被通用 Remote 等待截获。
原失败保留；原提问已由 Human CLI 取消。
真实 Cordis 先红后绿，修复后真实 Web 问答与审批均完成。
没有为截图伪造待处理数据。

## F 代码与复现

- [Home 查询](https://github.com/BotHarness/DeepSeekBot/blob/ffb727860e1fa2ea3423e30ec0d74775d047b481/packages/core/src/home/dashboard.ts)
- [既有用量所有者](https://github.com/BotHarness/DeepSeekBot/blob/ffb727860e1fa2ea3423e30ec0d74775d047b481/packages/core/src/usage/usage.ts)
- [真实 Web 与原生验证脚本](https://github.com/BotHarness/DeepSeekBot/blob/ffb727860e1fa2ea3423e30ec0d74775d047b481/scripts/e2e-tob-home.mjs)
- [迁移与覆盖决策](https://github.com/BotHarness/DeepSeekBot/blob/ffb727860e1fa2ea3423e30ec0d74775d047b481/docs/adr/0230-home-rolling-usage-extends-retained-receipts.md)

运行 dashboard 不需要模型调用。
运行 simple 需要已配置的隔离 Tob 路由。
运行 creation 生成独立的测试分组与 Bot。
原生启动、资源队列和主应用恢复由指定运行者负责。

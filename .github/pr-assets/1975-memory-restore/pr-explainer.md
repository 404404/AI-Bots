---
title: Memory 读取与安全恢复验证
subtitle: "PR #2003 · #1975 的有界验证路径"
lang: zh
template: doc
source: BotHarness/DeepSeekBot
base: 53b98377154eef2878bfbac975f9da9225222657
head: 9636c460b556e98f0155a4c021d03cbdbf39daf2
日期: 2026-10-16 UTC
---
## A 这次增加什么
原有 Memory 能力已有公开 CLI 和界面。本次把它们连成可重复运行的验证路径。
仅使用新建测试 Bot 的一个文件。产品的 Memory owner 和恢复实现保持原样。

## B 同一份权威状态
```flow TB
[Web 与 CLI] -> [Memory owner]: 公开能力
[Memory owner] -> [(Memory Git)]: 持久化
[(Memory Git)] -> [公开读取结果]: 读取
[公开读取结果] -> [覆盖校验器]: 联合界面证据
```

## C 恢复提交不会回退 HEAD
```flow TB
[版本一] -> [版本二]: 保存第二份内容
[版本二] -> [恢复提交]: 父提交仍是版本二
[版本一] --> [恢复提交]: 恢复版本一的内容
```
过期预期 HEAD 返回 memory-conflict，内容与 HEAD 保持不变。
恢复前检查点保留版本二。测试要求干净仓库，因此不产生额外备份提交。
历史面板读取版本一的提交差异。“Open current file”不算历史读取。

## D 证据如何失效
| 输入 | 覆盖行结果 |
| --- | --- |
| 未选择运行 | not-run |
| Host 前提不可用 | blocked |
| 动作或视觉检查失败 | fail |
| 提交改变或证据缺失 | needs-revalidation |
| 语义、证据摘要和视觉回执均符合 | pass |

每阶段读取页面实际选中的 DM，并与公开创建结果核对。
失败尝试单独保留；之后成功不改写先前记录。

[恢复语义校验源码](https://github.com/BotHarness/DeepSeekBot/blob/9636c460b556e98f0155a4c021d03cbdbf39daf2/scripts/memory-restore-report.mjs#L73-L87)明确核对新 HEAD、父提交和恢复前检查点。

## E 评审与复现
公开证据包含四阶段截图、ARIA、CLI 输出及诊断。
本地回归与 CI 单独报告。Agent 视觉检查不等于 Human QA。
用 feature map 启动一个独立 Host，再运行 Memory 路径。
完成后停止记录的 Host PID，保留测试 Memory 仓库。
本票不验证远程推送、凭据、分支切换或完整 Self-Record。

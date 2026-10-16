---
title: "PR #2001 · 临时 Workspace Grant 验证"
subtitle: 授权、读取与撤销共用同一 Host 权威状态
lang: zh
cols: 2
PR: https://github.com/BotHarness/DeepSeekBot/pull/2001
base: 1d1f8ac0cfeb26a8f3bf3a04550e6b92cee52bd9
head: 3e7929b50080ea2a4e9e90eb2696db77593793ec
date: 2026-10-16
---
本票只增加一条验证路径，没有修改产品权限实现。

## A 验证哪一个行为

| 阶段 | Web 可见状态 | Host 权威结果 |
| --- | --- | --- |
| 授权前 | 无样例目录 | 无 Grant；读取被拒绝 |
| Web 确认授权后 | 出现样例目录 | 同一 Grant 生效；读取成功 |
| 未确认撤销 | 目录仍获授权 | CLI 拒绝；Grant 保持有效 |
| 显式撤销后 | 刷新后无样例目录 | 同一 Grant 已撤销；再次读取被拒绝 |

读取通过既有 `channel_attachment_import` 直接工具执行。它读取样例并建立独立附件，不发送消息。

## B 哪些模块承担责任

```flow
行为地图 -> 隔离 Host: 准备测试 Bot 与临时样例
Web 授权窗口 -> Host Grant: 用户确认目录
CLI 授权列表 -> Host Grant: 核对 Bot、Workspace、Grant
直接读取工具 -> Host Grant: 每次读取检查当前授权
CLI 显式撤销 -> Host Grant: 撤销同一记录
Host Grant -> 独立覆盖行: 权威结果与可见证据共同判定
```

没有测试专用接口，没有第二套产品状态。临时目录只含 README，位于 Host 数据与真实用户目录之外。

## C 什么条件才能显示通过

每个阶段保留截图、ARIA、Client/Host 诊断。正常读取、明确拒绝和撤销结果分别保存。

| 证据情况 | 覆盖状态 |
| --- | --- |
| 尚未执行 | 未运行 |
| Host 等前提不可用 | 前提阻塞 |
| 操作或诊断失败 | 失败 |
| 提交变化、文件缺失或视觉检查缺失 | 需重验 |
| 身份、状态、读取、诊断及视觉证据全部一致 | 通过 |

首次失败和部分证据不会被后续成功覆盖。视觉检查回执绑定六个截图与 ARIA 文件的摘要。

[读取最终提交的验证器](https://github.com/BotHarness/DeepSeekBot/blob/3e7929b50080ea2a4e9e90eb2696db77593793ec/scripts/workspace-grant-report.mjs)

## D 评审与 Human 验证范围

本地相关回归为 90 项。CI 与真实运行结果见同目录的证据说明。

首次运行未选中 Bot，第二次遇到新手引导遮挡，之后两次保存证据时磁盘写满。失败均保留；另一次完整采集纠正了 CLI 错误码和隐藏节点的判定；最终完整运行与视觉检查通过。

Human 可按行为地图启动自己的隔离 Host，使用专用临时目录重复授权与撤销，并检查 CLI 返回。

本票不验证模型、原生设备、IM、Shell 或所有 Workspace 安全边界。#1841 数据库隔离和 #1957 scratch 文件问题仍未解决。Agent 图片检查也不等于 Human QA。

---
template: sheet
theme: blueprint
title: Container Computer 验证路径
subtitle: "PR #2023 · 运行前提阻塞，尚未取得真实画面证据"
cols: 2
base: 9e9a553f35adafc2b64baf497f3eae604a679e07
head: a57db12474ec5725201f9e85ae1b4bf5804a56ea
date: 2026-10-16 UTC
---
验证代码已可审阅，但当前 Docker Engine 返回 EOF。本页解释候选路径及证据门槛，不表示 Container 生命周期已经通过。

## A 当前结果

| 层级 | 结果 |
|---|---|
| 本地回归 | 404 通过，3 项门控跳过 |
| 静态检查与构建 | 通过 |
| CI | 必需检查通过；未运行 Docker 旅程 |
| Docker Engine | 阻塞：Server 为 null / EOF |
| Web 面板与 CLI frame | 未运行 |
| 视觉检查 / Human QA | 未运行 |

[PR #2023](https://github.com/BotHarness/DeepSeekBot/pull/2023) · [验收 #1977](https://github.com/BotHarness/DeepSeekBot/issues/1977)

## B 候选运行路径

```flow TB
既有运行环境 -> 独立 Profile
独立 Profile -> 面板授权启动
面板授权启动 -> 面板和 CLI 画面
面板和 CLI 画面 -> 停止与拒绝
停止与拒绝 -> 同一资源证据
```

首次运行前检查专属容器和卷不存在。普通 Profile Patch 明确选择 Container；Host、资源状态与画面仍由现有产品能力提供，不增加测试 API。

## C 什么才能算通过

面板与 CLI frame 必须看到同一测试窗口；Docker 检查只负责关联容器 ID、镜像与持久卷。停止后 frame 必须拒绝，不能悄悄再次启动。

证据行绑定准确源码提交和文件哈希。缺少画面、错误目标、被替换的容器、不同提交或缺少视觉检查回执，都不能继续显示通过。

[报告校验源码](https://github.com/BotHarness/DeepSeekBot/blob/a57db12474ec5725201f9e85ae1b4bf5804a56ea/scripts/computer-lifecycle-report.mjs)

## D 恢复后怎么验证

Human 先恢复现有 Docker Engine；不安装系统组件，不重启无法确认归属的共享容器。然后按地图选一个新的任务名，准备隔离 Host，执行真实旅程，检查截图与 ARIA，再保留脱敏共享证据。

第一份 EOF 和空 HTTP 响应记录必须保留。后续成功不能覆盖首次失败。此票不覆盖 Local Computer、输入、导入导出、手机 WebRTC、模型和 IM；不关闭 #1977，不合并本 PR。

[可运行地图](https://github.com/BotHarness/DeepSeekBot/blob/a57db12474ec5725201f9e85ae1b4bf5804a56ea/.agents/skills/verify-deepseekbot/features/computer-lifecycle.md)

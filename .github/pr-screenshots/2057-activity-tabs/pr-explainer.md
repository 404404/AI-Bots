---
title: PR 2058 · Activity 三个顶部 tab
lang: zh
---
## A 默认先看待办

| Tab | 内容 |
| --- | --- |
| 待你处理，默认 | 工具审批、正式问答、私密输入 |
| 与你有关 | 提及和回复 |
| 其他未读 | 其余未读会话 |

选中的 tab 同时显示前置图标和下沿线。图标不改变文字位置或 tab 宽度。

全部和已处理保留在筛选里。列表不再重复显示三个分组标题。

## B 切换时发生什么

```flow
点击 tab -> 更新 category: 保留其他条件
更新 category -> 原 Host 查询: 当前 Host
原 Host 查询 -> 同一个虚拟列表: 异步结果
```

搜索、排序、Bot、会话和未读条件继续生效。重置回到首个 tab，并保留搜索词。

## C 提交与切换的边界

提交完成前可能已经切换 tab。已有的 scope 校验会拒绝旧查询的回调。

接受问答后，卡片立即离开待办。已处理列表仍显示 Host 返回的历史记录。

[查询和 scope 实现](https://github.com/BotHarness/DeepSeekBot/blob/7f72e01ba13ba1e13f672348a3765d50c62cb4ea/apps/mobile/src/ui/shell/activity-feed.tsx) · [交互回归](https://github.com/BotHarness/DeepSeekBot/blob/7f72e01ba13ba1e13f672348a3765d50c62cb4ea/apps/mobile/test/activity-feed.test.ts)

## D 评审与验证范围

```kv
PR: #2058，叠在 #1966 上
Base: 37b2bc02eb47e76bc753d8c8a21e5c3590281fed
Head: 7f72e01ba13ba1e13f672348a3765d50c62cb4ea
生成日期: 2026-10-17
```

本地移动端全量 439 passed / 8 skipped。已处理历史修复和图标改动各有 19 项重点测试通过。

Android 实机使用 SDK 58 集成版本。截图分别记录改前、改后代码；不声称 SDK 57 分支直接运行于 SDK 58。

iOS 原生和 Human QA 待完成。字体和主题切换的生命周期检查单独记录，截图不代表动态切换已经通过。

回退 UI 提交即可恢复分组形式。Host、存储格式和权限没有变化。


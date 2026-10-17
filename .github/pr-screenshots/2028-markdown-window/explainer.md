---
title: Android 长回复：减少屏幕外排版
subtitle: PR #2133 · Release 实机对比
lang: zh
template: doc
theme: paper
PR: https://github.com/BotHarness/DeepSeekBot/pull/2133
base: 390630e0dc81b0e776758bc420c1622b2ad51981
head: 34a42447e12acb58a799c4852fbf59911894e866
date: 2026-10-18
---

## A 已测量的改善

固定内容通过真实 QA Host 到达手机。测试使用模拟模型，没有调用真实 LLM。

| 三轮中位数 | 旧版 | 新版 |
| --- | ---: | ---: |
| 首次观察到完整回复 | 79.470 秒 | 52.095 秒 |
| 后段 App 帧时长均值 | 19.619 毫秒 | 11.939 毫秒 |
| 后段错过 App 截止时间的帧 | 234 | 2 |
| 完成后的原生 View 数 | 924 | 287 |

使用 arm64 Release，按 A B B A A B 交替运行。
两版均接收 21,492 字符、281 个固定分块。
每轮采集 45 秒，期间不截图、不查询页面层级。
后段指 trace 开始后的 22～42 秒。
完整回复时间是首次观察到完成的上界。

## B 谁负责什么

```flow
[播放文本] -> [窗口模块]: 段落与测量
[聊天视口] -> [窗口模块]: 可见范围
[窗口模块] -> [原有渲染器]: 可见段与尾段
[窗口模块] -> [等高占位]: 屏幕外内容
```

窗口模块只拥有临时布局测量值。
消息正文、缓冲策略、播放进度和持久化仍由原模块负责。
用户滚回时，渲染器恢复原段落。

[窗口计算](https://github.com/BotHarness/DeepSeekBot/blob/34a42447e12acb58a799c4852fbf59911894e866/apps/mobile/src/ui/markdown-window.ts) · [视口通知](https://github.com/BotHarness/DeepSeekBot/blob/34a42447e12acb58a799c4852fbf59911894e866/apps/mobile/src/ui/markdown-viewport.ts) · [Android 渲染器](https://github.com/BotHarness/DeepSeekBot/blob/34a42447e12acb58a799c4852fbf59911894e866/apps/mobile/src/ui/markdown-view.android.tsx)

## C 保留正确性的边界

- 活动尾段保持挂载，沿用原有文字淡入。
- 占位保留实测高度和气泡最小宽度。
- 窗口宽度或系统字号变化时，重新测量。
- 未测量内容先完整渲染。
- 屏幕阅读器与原生媒体路径使用完整渲染。
- 一个不分段的超长段落仍需后续优化。

这是可以撤回的 JavaScript 变更，不迁移数据。
最需要审查的是占位尺寸、滚回恢复和尾段身份。

## D 验证与限制

| 检查 | 结果 |
| --- | --- |
| 移动端自动化测试 | ok 571 通过，8 跳过 |
| 类型、lint、格式、feature map、变更记录 | ok |
| iOS 与 Android SDK 58 bundle | ok |
| Android 默认、1.3、2 倍字号 × 明暗主题 | ok 六种组合 |
| 默认与最大字号的真实键盘动画 | ok |
| 草稿、窗口缩放与流式历史回归 | ok |
| iOS 原生设备 | warn Windows 无法验证 |
| Human QA | warn 等待体验反馈 |

手机当前运行在 60 Hz。
后段应用内容更新的中位数为每秒 47.007 次。
这个指标不是滚动 FPS，也不能证明 120 FPS。
原始 trace 和设备信息保持私有，只发布应用聚合数据。

新回复发送约 2.1 秒时上滑，阅读锚点保持到回复提交之后。
旧回复恢复后，返回最新消息可继续播完第 100 段。
窗口缩到 1000×2400 时，输入草稿保持可编辑。

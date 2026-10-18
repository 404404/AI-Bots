---
title: Android 流式渲染 Arena
subtitle: 18 次匹配测试后，保留有界原生逐字渐显
lang: zh
template: sheet
cols: 2
PR: 2133
head: 85f185120d9bfacc9a16bee7109b83d3e57fc85b
behavior_head: a2a9dcf7801b5b5c68e17679c7ef1ea3297d2021
base: 390630e0dc81b0e776758bc420c1622b2ad51981
date: 2026-10-18
---

## A 本轮结论
```callout ok 保留原生 48 字渐显
保持现有 Markdown 布局和缓冲播放，只把逐字透明度动画交给 Android 绘制时钟。
```
固定长回复中的呈现频率接近 120 次/秒。仍有慢帧，尚未证明所有交互稳定达到 120 FPS。

## B 胜出组的中位数
| 指标 | React 对照 | 原生 48 字 |
|---|---|---|
| 活跃窗口呈现频率 | 77.343 次/秒 | 119.845 次/秒 |
| UI 主线程 p95 | 7.433 ms | 7.002 ms |
| 超过 8.33 ms 的主线程帧 | 68 | 44 |
| JS CPU 合计 / 20 秒 | 15.581 秒 | 11.253 秒 |
| 播放游标到末尾 | 40.242 秒 | 38.862 秒 |

每种方案各测三次，顺序为 A B B A A B。呈现频率代表流式动画，不能代替滚动 FPS。

## C 拆分后的职责
```flow
Host 正式消息 -> 缓冲播放游标: 固定回放输入
缓冲播放游标 -> Markdown 缓存: 仅追加变化尾部
Markdown 缓存 -> 可见块窗口: 保留已测量高度
可见块窗口 -> RN 原有文本: 排版和选择
RN 原有文本 -> 原生渐显时钟: 最多 48 个字素
```
解析、排版和消息存储仍由原有模块负责。原生模块只处理临时绘制效果，不接管文本数据。

## D 淘汰了哪些方案
| 方案 | 实测结论 |
|---|---|
| 完整原生 Markdown 解析器 | 试跑收尾明显更慢，淘汰 |
| 原生 256 字渐显 | 呈现更密，但主线程 p95 变差 |
| 整段统一失效通知 | 三次匹配测试更慢，撤回 |
| 原生 48 字渐显 | 保留自然淡入，并限制每帧工作量 |

没有测试 Worker 解析和整泡显示模式，不把研究建议计为已验证方案。

## E 这次验收到了哪里
你在 80 多段时上滑，画面回到第 76 段并显示返回底部按钮。返回后继续到第 86 段，最终显示第 100 段。

正常 Release 包的逐字淡入与完整提交通过。关闭动画时直接显示完整文字；一次 CLI 等待超时后，重新读取 Host 确认正文已完整提交。

Android 100%、130%、200% 明暗截图中的正文完整可见。200% 深色截图暴露了现有时间标签裁切，暂不算整页大字验收通过。

## F 验证范围与回放
通过：587 项移动端测试、9 项原生测试、29 项 CI 规划测试、类型检查、lint、格式检查和两端导出。

待验：滚动帧率、跨正式提交的历史停留、超长单段落、键盘、选择、链接、TalkBack 和 iOS 原生回归。新 head 的云端 CI 单独报告。

[原速逐字回放](https://github.com/BotHarness/DeepSeekBot/raw/a2a9dcf7801b5b5c68e17679c7ef1ea3297d2021/.github/pr-screenshots/2028-markdown-window/native-gentle-1x.mp4) · [0.5 倍慢放](https://github.com/BotHarness/DeepSeekBot/raw/a2a9dcf7801b5b5c68e17679c7ef1ea3297d2021/.github/pr-screenshots/2028-markdown-window/native-gentle-half.mp4) · [手动历史回放](https://github.com/BotHarness/DeepSeekBot/raw/a2a9dcf7801b5b5c68e17679c7ef1ea3297d2021/.github/pr-screenshots/2028-markdown-window/native-history-1x.mp4)

[PR 与完整数据](https://github.com/BotHarness/DeepSeekBot/pull/2133)。录屏限于 60 fps，历史片段导出为 30 fps；它们用于观察节奏，不证明 120 FPS。

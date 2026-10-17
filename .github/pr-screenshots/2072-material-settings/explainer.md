---
title: Android 设置组件首轮
subtitle: PR 2073 · OCAT 参考与原生 Material 3
template: doc
theme: paper
lang: zh
head: 41637d6652dc28ab08452e1b2a11bb344bc97180
base: 2bda25af3c1a2f2562990e6c3b110e0d8012ae5a
date: 2026-10-17
---

这一轮把视觉规则收进共用组件，并接入原生开关。设置的状态和存储继续由原来的模块负责。

## A 从参考图提炼什么

| 部位 | 首轮调整 |
| --- | --- |
| 分组 | 28dp 圆角，16dp 内缩分隔线 |
| 文字 | 强调色标题，独立的标题与说明层级 |
| 选中 | 底色、文字和勾选标记共同表达状态 |
| 开关 | SDK 58 的原生 Material 3 Switch |

保留已有抽屉手势和二级页面。模型选择弹窗留给下一轮原生验收。

## B 一个值仍然只有一个存储方

```flow
用户点击开关 -> 原生 Switch: 一次变更
原生 Switch -> 原有偏好模块: onChange
原有偏好模块 -> 本地存储: 保存
原有偏好模块 -> 原生 Switch: value
```

只读设置行使用普通 View。一个无障碍开关表达名称、选中和禁用状态。

Compose 继续负责触摸。无障碍激活也调用同一偏好模块。

## C 原生边界保持小

```tsx src=apps/mobile/src/ui/primitives/toggle.android.tsx lines=11-43
```

React Native 继续负责分组和滚动。Compose Host 只容纳一个开关，并使用当前主题。

强调色标题和选中文字经过对比度修正。深浅主题及自定义颜色都有自动检查。

## D 验证与限制

移动端全套 541 项测试通过，8 项跳过。最终提交的 CI 全绿。

深浅主题与三档字号的前后图已采集。六组开关都暴露正确状态，点击区域为 52×48dp。

测试 Bot 的显示偏好已通过实际点击和冷启动检查。本地存储与界面一致，原设置已恢复。

原生包已安装，原有配对和历史保留。原速片段只裁切画面和时长，慢速版明确标为 0.5x。

iOS 保留既有呈现，但新增原生依赖仍要求重建客户端。手动 TalkBack、iOS 原生、推送送达和 120 FPS 均未验收。

[PR 2073](https://github.com/BotHarness/DeepSeekBot/pull/2073) · [研究依据](https://github.com/BotHarness/DeepSeekBot/blob/41637d6652dc28ab08452e1b2a11bb344bc97180/docs/research/2072-android-material-settings.md)

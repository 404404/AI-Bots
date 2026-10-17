---
template: sheet
theme: paper
title: Android 导航浮岛
subtitle: PR2078 · 源码 3cd35d2381265d2203882a4a2c251f914aaca312 · 基线41637d6652dc28ab08452e1b2a11bb344bc97180
cols: 2
lang: zh
---

## A 外观与状态

| 条件 | 动态位置显示 |
|---|---|
| 聊天页，待办大于零 | 等宽数字，最多99+ |
| 动态页已选中 | 铃铛图标 |
| 待办为零 | 铃铛图标 |

默认176×64dp圆角矩形，选中图标底块40×32dp。系统elevation为零，仅保留一层轻淡阴影。默认仅计工具审批。全局设置可多选正式问答、私密输入、其他待办、未读提及回复、其他未读会话；选择保存在本机。

## B 过渡如何运行

```flow TB
实际选中路由与待办 -> 图标或数字状态
图标或数字状态 -> UI线程160ms过渡
UI线程160ms过渡 -> 固定位置的透明度与缩放
系统字号与安全区 -> 浮岛扩宽增高
```

导航库会同时绘制选中和未选中的图标副本，因此过渡状态跟随实际路由。每帧只在UI线程更新透明度和缩放，不更改布局。数字使用tabular-nums；无障碍Tab名称使用相同的99+上限。

## C 代码边界

```tsx src=apps/mobile/src/ui/shell/navigation-icon.android.tsx lines=28-46
```

NavigationButton保留原有点击和无障碍属性。新NavigationIcon仅负责装饰形态；底栏选择、滚动收起、安全区保持原来的职责。计数通过现有humanAttention接口按分类分页读取，去重后最多累积100项；同一选择保留缓存，切换选择与Host时丢弃旧请求结果。

Host当前仅允许auto-rejection的kind参数，因此按动作类型在客户端过滤；不更改Host API或推送设置。

## D 原生证据与边界

源码：[精确提交](https://github.com/BotHarness/DeepSeekBot/commit/3cd35d2381265d2203882a4a2c251f914aaca312)。

本次Android证据覆盖聊天与动态、浅深色和系统字号1/1.3/2；截图、原速及0.5倍录屏另存证据目录。549项移动端测试通过，8项跳过；类型、lint、格式和更新记录通过。

当前QA有一条正式问答：默认工具审批数字为零；额外选择正式问答后为1。多选与冷启动保存、零状态图标在实机验证；99+原生状态未实测，分页、去重与100项饱和由测试覆盖。iOS原生、TalkBack和Release120FPS尚未认证。预测返回仍沿用前一轮记录：SDK58实验栈缺少当前弹窗与header所需能力，本PR保留稳定Stack。

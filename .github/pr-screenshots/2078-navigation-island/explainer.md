---
template: sheet
theme: paper
title: Android 导航浮岛与预测返回
subtitle: PR2078 · 源码 e6e42ebcb0ecebbb4841466c19416052ab683734 · 基线41637d6652dc28ab08452e1b2a11bb344bc97180 · 2026-10-17
cols: 2
lang: zh
---

## A 底栏的变化

| 项目 | 之前 | 现在 |
|---|---|---|
| 外形 | 接近全宽的胶囊 | 居中的小圆角矩形 |
| 默认尺寸 | 屏幕左右各留24dp |176×64dp，外圆角20dp |
| 选中图标 | 中性色胶囊 | 强调色矩形底块，圆角12dp |
| 大字号 | 固定高度 | 字号放大时扩宽并增高 |

保留聊天、动态两个入口及待处理角标。浮岛底色与页面底色有区别。

## B 交互沿用现有链路

```flow TB
系统字号与安全区 -> 浮岛尺寸: React布局
浮岛尺寸 -> 列表底部留白: 末行可达
列表滚动 -> UI线程隐藏进度
UI线程隐藏进度 -> 浮岛位移与淡出
```

选择、长按和角标仍由现有 BottomTabBar 管理。此改动不增加持久化状态或原生依赖。iOS保留原有系统底栏。

## C 图3能否直接启用

[Expo SDK58 官方说明](https://docs.expo.dev/versions/v58.0.0/sdk/router/experimental-stack/)提供实验导航栈的预测返回。

| 必要能力 | ExperimentalStack现状 | 本应用用途 |
|---|---|---|
| 手势进度与取消 | 支持 | 图3的效果 |
| formSheet与弹窗 | 不支持 | 设置、资料、远程视图 |
| 自定义header | 不支持 | 抽屉内的二级导航 |
| Android混用稳定Stack | 不支持 | 不能只迁移一个页面 |

因此本次保留稳定Stack。不能把manifest开关或返回桌面动画，当成应用内页面预览。

## D 实现依据与验收边界

源码：[精确提交](https://github.com/BotHarness/DeepSeekBot/commit/e6e42ebcb0ecebbb4841466c19416052ab683734)。QA运行与截图另有完整提交记录。

```ts src=apps/mobile/app/(tabs)/_layout.android.tsx lines=57-68
```

自动检查：541项移动端测试通过，8项跳过；类型、lint、格式、更新记录均通过。

手机完成12组前后对照、选中状态与点击范围检查。短列表保留底栏，长列表收起并恢复。

ACTION_CANCEL保留聊天，完整边缘滑动返回列表；反向拖回边缘的注入异常，Human取消手势尚未认证。解释页不替代这些实机证据。120FPS与iOS实机尚未认证。PR2073及本PR均待Human验收。




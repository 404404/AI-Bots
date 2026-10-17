---
template: sheet
theme: paper
title: Android 导航浮岛与预测返回
subtitle: PR2078 · 源码 75175fcb348aeafddbf8eacb1026aa392074eef4 · 基线41637d6652dc28ab08452e1b2a11bb344bc97180 · 2026-10-17
cols: 2
lang: zh
---

## A 底栏的变化

| 项目 | 之前 | 现在 |
|---|---|---|
| 外形 | 接近全宽的胶囊 | 居中的小圆角矩形 |
| 默认尺寸 | 屏幕左右各留24dp |176×64dp，外圆角20dp |
| 选中图标 | 中性色胶囊 | 强调色矩形底块，40×32dp，圆角12dp |
| 大字号 | 固定高度 | 字号放大时扩宽并增高 |

保留聊天、动态两个入口及待处理角标。浮岛底色与页面底色有区别。

## B 修正内部垂直布局

```flow TB
系统字号与安全区 -> 浮岛尺寸: React布局
浮岛尺寸 -> 列表底部留白: 末行可达
列表滚动 -> UI线程隐藏进度
UI线程隐藏进度 -> 浮岛位移与淡出
```

BottomTabItem内部原本使用顶部对齐和默认内边距，图标宿主也小于选中底块。现在由NavigationButton居中排列，图标宿主与底块都为40×32dp，角标落在宿主内。既有点击、长按与无障碍属性完整转发。

实机可见内容偏移从上偏6.46dp降至1.54dp；高亮宽度从56dp收至40dp。iOS保留原有系统底栏。

```tsx src=apps/mobile/src/ui/shell/navigation-button.android.tsx lines=1-6
```

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

源码：[精确提交](https://github.com/BotHarness/DeepSeekBot/commit/75175fcb348aeafddbf8eacb1026aa392074eef4)。QA运行与截图另有完整提交记录。

```ts src=apps/mobile/app/(tabs)/_layout.android.tsx lines=60-71
```

自动检查：541项移动端测试通过，8项跳过；类型、lint、格式、更新记录均通过。

手机完成12组前后对照、选中状态与点击范围检查。本次短列表保留底栏、切换Tab通过；长列表收起与恢复也在当前版本补测通过，并另存原速录屏。

此前稳定栈基线的ACTION_CANCEL保留聊天，完整边缘滑动返回列表；反向拖回边缘的注入异常，Human取消手势尚未认证。解释页不替代这些实机证据。120FPS与iOS实机尚未认证。PR2073及本PR均待Human验收。




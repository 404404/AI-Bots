---
title: Android 菜单：操作清楚，关闭轻松
subtitle: PR 2109 · 2026-10-18 · head 9c150b971
template: doc
theme: paper
lang: zh
---

## A 菜单的操作层级

普通操作使用带图标的 Tonal 底色按钮，同级操作保持相同强调。危险操作使用淡红底色。选择菜单没有重复的取消按钮，点击空白处或按返回即可关闭；确认危险操作时仍有明确的取消。所有按钮均无描边。

这是结合 Android 按钮层级和既有 OCAT 设置风格的应用设计，不是对原生系统弹窗外观的复刻。

## B 一个共用入口

```flow TD
电脑菜单和配对 -> showAppDialog
新建选项 -> showAppDialog
群组确认 -> showAppDialog
showAppDialog -> AppDialogHost: Android
showAppDialog -> 系统Alert和ActionSheet: iOS
AppDialogHost -> 设置底色与圆角
AppDialogHost -> Tonal与危险底色按钮
```

系统权限与分享仍由系统管理。此次没有新增原生依赖、数据库或 Host 接口。弹窗只拥有临时显示状态，不接管配对或群组权限。

## C 关闭与提交

```flow LR
选择危险操作 -> 二次确认
二次确认 -> 关闭: 取消或返回或空白处
二次确认 -> 执行中: 明确确认
执行中 -> 关闭: 成功
执行中 -> 保留重试: 失败
```

执行中阻止重复提交和关闭。请求标识保证旧菜单回调不会关闭新确认框。颜色和按下反馈来自共享 Token；文字保持系统缩放。

## D 验证与边界

571 项移动端测试通过，8 项跳过。类型、lint、格式和颜色对比检查通过。Android 16 的深浅色、字号 1 / 1.3 / 2 共六组菜单与确认检查通过，操作至少 48dp。返回、空白关闭、自定义入口和取消确认保留原配对。

此次实机运行源为 f960d6e1b，之后只有图片与来源记录提交。旧群组、键盘和异步状态证据保持各自的来源标识；旧录屏不展示最终按钮样式。字号切换中的开发客户端问题由 #2110 单独跟踪。iOS 实机、TalkBack、实机危险操作提交与故障注入未验证。没有 120 FPS 声明。

## E 对照来源

Head：[9c150b971897104787a26585db3dc8f9bbc659b9](https://github.com/BotHarness/DeepSeekBot/commit/9c150b971897104787a26585db3dc8f9bbc659b9)。比较基点：[ccfcbd17175df2eb019cf5e71b2e038ddd41d14f](https://github.com/BotHarness/DeepSeekBot/commit/ccfcbd17175df2eb019cf5e71b2e038ddd41d14f)。原生矩阵：[六组检查与 20 张图片](https://github.com/BotHarness/DeepSeekBot/tree/9c150b971897104787a26585db3dc8f9bbc659b9/.github/pr-screenshots/2106-android-dialogs/actions)。规范：[Android 按钮](https://developer.android.com/develop/ui/compose/quick-guides/content/create-button)。PR 保持草稿，等待视觉审阅。

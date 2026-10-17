---
title: Android 弹窗统一为 OCAT 风格
subtitle: PR 2109 · 2026-10-18 · head 16c7c9af9
template: doc
theme: paper
lang: zh
---

## A 视觉与入口

取消配对、电脑菜单、新建选项和群组确认框，统一使用与设置页相同的圆角、底色、文字和按钮。默认字号的两个操作等宽，大字时上下排列；内容过长时可滚动。系统权限弹窗保持系统管理。

| 元素 | 复用来源 |
| --- | --- |
| 浮层底色与遮罩 | theme.overlay.fill / theme.scrim |
| 圆角 | androidSettings.radius |
| 菜单选项 | SettingsRow |
| 操作按钮 | Button，危险操作使用 danger |

## B 共用组件

```flow TD
电脑菜单与配对 -> showAppDialog
新建菜单 -> showAppDialog
群组成员与解散 -> showAppDialog
showAppDialog -> Android请求: Android
showAppDialog -> 系统弹窗: iOS
Android请求 -> AppDialogHost
AppDialogHost -> 设置页组件和Token
```

弹窗请求只保存临时显示状态，不保存业务设置，也不替代 Host 和配对存储的权限判断。屏幕直接调用 Alert.alert 会被样式检查拒绝。此次没有新增原生依赖或 Host 接口。

## C 确认与取消

```flow LR
选择危险菜单项 -> 二次确认
二次确认 -> 关闭: 取消或返回或点遮罩
二次确认 -> 执行中: 明确确认
执行中 -> 关闭: 成功
执行中 -> 保留并重试: 失败
```

执行中禁用重复提交和关闭。每个请求有自己的标识，上一级菜单回调结束时，不会误关刚打开的二次确认框。关闭弹窗不触发危险操作。

## D 已验证与边界

Android 深浅色、字号1/1.3/2的六组检查通过。默认和中等字号的两个操作等宽，大字时上下排列；操作至少48dp。取消、返回和遮罩路径保留配对与抽屉，群组取消、搜索键盘收起和冷启动保留状态也通过。

570项移动端测试通过、8项跳过；另有15项CLI检查测试和28项CI计划测试通过。根目录与移动端类型、lint、格式和变更记录检查通过。PR的精确提交CI单独记录。

16组前后对比保留真实设备像素，使用同一裁剪范围展示完整弹窗。原速录屏21.64秒，0.5倍速43.13秒，都保留227帧。两者不是120FPS测试。

基线和新版在ADB调整字号时均出现Expo Router重复链接警告；此改动不声称修复该开发客户端问题，正常冷启动已单独验证。iOS实机、TalkBack、实机危险操作提交与故障注入仍未验证。共享配对、群组、待办和聊天内容未被提交更改。

比较基点：[ccfcbd171](https://github.com/BotHarness/DeepSeekBot/commit/ccfcbd17175df2eb019cf5e71b2e038ddd41d14f)。Head：[16c7c9af9](https://github.com/BotHarness/DeepSeekBot/commit/16c7c9af96803f2dde580328ecabb8aa0098dc10)。审阅时目标main为[2202bef4d](https://github.com/BotHarness/DeepSeekBot/commit/2202bef4d744893fddf66cdd0a6b0c58f710dfb6)。原生运行代码为704fa745b，后续只调整格式、测试隔离和证据。PR未合并，等待视觉审阅。

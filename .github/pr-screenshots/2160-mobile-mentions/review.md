---
title: 移动端行内提及
subtitle: PR 2163 · 人工选择 B
lang: zh
cols: 2
base: 810ae5398deda703b9c2840dbdf0d29eb627c9ed
head: 226d71680364b22f86d657147f0137255a4f7b0f
date: 2026-10-18
---

## A 最终样式

头像、@ 和当前姓名与正文共用一行。
姓名使用与 Web 相同的 primary 颜色函数。
背景保持透明，不增加块状高度。
头像按缩放后的正文行距调整视觉中心。
长姓名随正文换行。

人工已选择 B，临时 A/B 开关已移除。

## B 数据与渲染

```flow
Host 日志 -> 手机会话: 保留结构化 mentions
手机会话 -> 行内提及: 校验正文位置
当前名册 -> 行内提及: 按 ID 查姓名与头像
行内提及 -> 对应私聊: 原始 Bot ID
```

机器人首段与提及共用原生文字容器。
后续 Markdown 块保留原有渲染器。
换行先归一化，避免 CRLF 导致重复文字。

## C 兼容与边界

- 改名不改变目标 ID。
- 缺失 ID 保留历史标签，并关闭导航。
- 普通 @文字不创建身份关联。
- 颜色按实际气泡底色调整对比度。
- 行内尺寸遵循人工要求的控件高度例外。
- 复制保留原始正文，不重写历史标签。

[精确版本渲染代码](https://github.com/BotHarness/DeepSeekBot/blob/226d71680364b22f86d657147f0137255a4f7b0f/apps/mobile/src/ui/chat/message-body.tsx)

## D 验证与限制

613 项测试通过，8 项跳过。
B 版移除开关后，53 项聚焦测试通过。
头像对齐后，9 项聚焦与样式检查通过。
根目录和移动端类型、lint、格式检查通过。
Standards 与 Spec 审查均无剩余发现。

Android 深浅主题与三档字号已拍摄。
六次行内点击均进入正确私聊。
加粗、列表、代码和长姓名保持正常。
Android 采用兼容的 SDK58 原生开发客户端。

iOS 与 TalkBack 未运行。
原生流式性能未测量。
旧块状截图已由当前行内截图替换。
PR 保持 Draft，未合并。

[公开截图与来源记录](https://github.com/BotHarness/DeepSeekBot/tree/226d71680364b22f86d657147f0137255a4f7b0f/.github/pr-screenshots/2160-mobile-mentions)

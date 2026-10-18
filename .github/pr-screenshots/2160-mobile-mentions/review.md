---
title: 移动端 @ 提及按身份显示
subtitle: PR 2163 · 结构化 Bot 提及
lang: zh
cols: 2
base: 810ae5398deda703b9c2840dbdf0d29eb627c9ed
head: 6bd192689015c740791ca442bdfb1623d6bf4967
date: 2026-10-18
---

## A 从文字到身份块

原先，移动端把结构化提及显示成普通文字。
现在，头像与当前姓名组成可点击的提及块。
点击按 Bot ID 打开私聊。

```diff
- ChannelMessage → body → 普通文字
+ ChannelMessage → mentions + body
+ mentions → 当前姓名、头像、私聊
+ 剩余正文 → 原有 Markdown 渲染器
```

## B 数据归属

Host 继续保存提及的 ID、历史标签和正文位置。
手机保留这些字段，不修改消息或路由语义。

```flow
Host 日志 -> 手机会话: 保留 mentions
手机会话 -> 提及块: 校验正文位置
当前名册 -> 提及块: 按 ID 查姓名与头像
提及块 -> 对应私聊: 使用原始 Bot ID
```

## C 边界与兼容

- 改名后显示当前姓名，目标 ID 保持不变。
- ID 缺失时保留历史标签，并关闭导航。
- 手写的普通 @名字不创建身份关联。
- 错误或重叠的位置不能吞掉正文。
- 机器人开头的提及采用 Web 的处理方式。
- Markdown 中间的提及保留 Web 的现有行为。
- 人类正文中的提及块支持换行和完整触摸区域。

## D 验证与待验收

移动端测试通过 596 项，跳过 8 项。
规范审查和规格审查均无剩余发现。
Android 对照图使用同一设备和同一组测试消息。

Android 深浅主题的 1.0、1.3、2.0 字号均通过。六次点击均进入正确私聊，提及块不小于 48dp。

iOS 原生验收缺少可访问的 Mac 队列。
源码测试和 Android 截图不能代替 iOS 验收。
PR 保持 Draft，等待原生与人工评审。

[查看精确版本代码](https://github.com/BotHarness/DeepSeekBot/tree/6bd192689015c740791ca442bdfb1623d6bf4967/apps/mobile/src/ui/chat)


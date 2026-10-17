---
title: 聊天背景实现说明 · PR 2122
lang: zh
---

## 审查范围

照片与偏好仅留在本机。编辑器保存成功后才更新聊天背景。

- PR：[2122](https://github.com/BotHarness/DeepSeekBot/pull/2122)
- 规格：[2118](https://github.com/BotHarness/DeepSeekBot/issues/2118)
- 来源版本：`acb14a6de94775edf41450fb27b6053607ad8ac3`
- PR 合并基准：`390630e0dc81b0e776758bc420c1622b2ad51981`
- 固定复查基准：`0f75f3e38f7d0e3b59189203998bd7c817aad496`
- 生成日期：2026-10-18

本页解释代码与验收范围，不代替原生运行证据。

## 谁保存什么

```flow TB
资料或设置 -> 编辑草稿 -> 完成保存
完成保存 -> [(本机完整记录)] -> 聊天背景
编辑草稿 -> 取消丢弃
本机完整记录 -> 图片引用检查
图片引用检查 -> 清理无引用图片
```

Host、PersonaBot 身份、Memory 和消息保持各自原有归属。

| 对象 | 归属 | 保存内容 |
| --- | --- | --- |
| 默认背景 | 此安装 | 主题底色、纯色或自有图片 |
| 聊天覆盖 | 保存的 Host ID 与 Channel ID | 此聊天的选择 |
| 编辑草稿 | 当前编辑页 | 尚未确认的修改 |
| 图片文件 | 本机文档目录 | 归一化 JPEG，相对文件名 |

## 保存失败如何恢复

```flow
选图 -> 校验尺寸 -> 调整分辨率 -> 复制自有文件 -> 草稿预览
草稿预览 -> 点击完成 -> 写入新记录
写入新记录 -> {完整写入？}
完整写入？ -> 更新已保存背景: 是
完整写入？ -> 保留旧背景与可重试草稿: 否
```

启动时忽略不完整的新记录，读取最近的完整记录。
读取失败后禁止保存与图片清理。重开后成功读取才恢复。
清理前重新检查已保存选择与活跃草稿。

## 图片与文字如何分层

```tree
Conversation
  Canvas
  Image
  Theme veil
  Keyboard-responsive content
    Timeline
    Composer
```

淡化值只控制背景遮罩。消息、附件和按钮保持原有不透明度。
填充保留比例并裁剪；适应保留整张图片。
只允许调整有裁剪方向的位置。继承图片只读，明确选图后才编辑。

## 原生边界与取舍

- 源图最多 1600 万像素，输出长边最多 2048 像素。
- 先检查尺寸，再安排缩放与渲染。
- Android 资料与群详情抽屉固定全高，确保编辑操作可达。
- iOS 保留原抽屉高度设置，尚需独立验收。
- 图片不上传 Host，不随 PersonaBot 导出。

实现：[本地偏好模块](https://github.com/BotHarness/DeepSeekBot/blob/acb14a6de94775edf41450fb27b6053607ad8ac3/apps/mobile/src/host/chat-background.ts)、[原生文件适配器](https://github.com/BotHarness/DeepSeekBot/blob/acb14a6de94775edf41450fb27b6053607ad8ac3/apps/mobile/src/host/native-chat-background.ts)。

## 验证状态

| 检查 | 状态 |
| --- | --- |
| Standards 与 Spec 源码审查 | 未解决问题为零 |
| 聚焦测试与类型检查 | 通过 |
| 安卓首条选图、保存、冷启动 | 通过，Human 已确认效果 |
| 安卓设置、群聊与 DM 矩阵 | 六组交互与保存复核均完成 |
| Windows 本地全量测试 | 未通过；移动端590通过，1项bad port，复跑通过 |
| CI | 6a81全通过，修复后版本等待检查 |
| iOS 原生 | 无设备入口，未验收 |

实时字号切换后的导航重建已在基线复现，见 [2110](https://github.com/BotHarness/DeepSeekBot/issues/2110)。冷启动矩阵不证明实时切换后保留草稿。




TalkBack 手势受系统弹窗阻断，尚未验证。iOS 无原生入口。

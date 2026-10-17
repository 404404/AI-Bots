---
title: 移动端模型设置与键盘避让
subtitle: PR 2073 · 2026-10-18 · head e1c0de9637004394b9e8e76e7a0adefba079b050
template: doc
theme: paper
lang: zh
---

## A 用户能做什么

Android 设置沿用已验收的 Material 分组和紧凑底栏。动态数字默认统计四类待处理请求，保留设备上已有选择。模型选择增加搜索；全局设置与单 Bot 设置复用 Host 的模型方案和预设。

```tree
全局设置
  Host 默认模型与推理强度
  共享模型预设
Bot 资料
  Orchestrator 模型与推理强度
  Assignment 默认、允许模型与推理强度
  应用预设 / 另存预设 / 恢复全局默认
所有文本输入
  随键盘调整布局
  当前输入位置可见，提交操作可达
```

## B 模型设置的权威

```flow LR
手机设置 -> HostClient: 认证调用
HostClient -> 全局默认: onboardingModel
HostClient -> Bot方案: modelPlanSet / Customize / Inherit
HostClient -> 共享预设: modelPresetCreate / Update / Apply
Host设置 -> 手机缓存: 写入后重新读取
```

Host 保存模型设置。手机缓存按 Host、Bot 和预设隔离，只用于显示。首次显示加载状态；再次打开先显示缓存并刷新。刷新失败保留内容并提供重试。保存失败保留输入。

现有预设 RPC 增加可选的 Assignment 策略参数，避免静默丢失允许模型、推理强度和备注。在线 CLI 创建预设也支持 `--plan-stdin`。没有新增 RPC 方法名或数据库迁移。

完整策略的预设写入需要同时更新 Host。AX 启动配置锁定的全局模型会拒绝修改。可写全局设置使用独立测试 Host 验证，原 Host 模型状态保持不变。Expo UI 原生依赖需要重建 SDK 58 客户端。

## C 继承、复制与保留

| 操作 | 影响 | 保留 |
| --- | --- | --- |
| 修改全局默认 | 跟随默认的 Bot | 单 Bot 独立方案 |
| 修改 Bot Orchestrator | 此 Bot 对话模型 | Assignment 选择、强度与备注 |
| 修改 Assignment 默认 | 此 Bot / 此预设 | 其他允许模型和元数据 |
| 应用预设 | 把模板复制给此 Bot | 其他 Bot |
| 编辑共享预设 | 更新模板 | 已应用的 Bot 副本 |
| 恢复全局默认 | 移除此 Bot 的独立方案 | 全局默认和共享预设 |

Bot 与预设写入沿用 Host 的 revision 检查。全局默认仍沿用现有契约，没有新增全局 Assignment 配置层。

## D 每个输入场景的键盘布局

```flow TD
文本输入 -> 滚动表单: 配对、问答、预设、外观、定时任务
滚动表单 -> KeyboardFormScroll: 跟踪焦点与原生键盘
文本输入 -> 虚拟列表: Chats / Activity / 模型预设
虚拟列表 -> renderKeyboardFormScroll: 保留虚拟化
文本输入 -> 固定编辑器: 搜索头部、展开草稿、远程控制
固定编辑器 -> KeyboardAvoidingView: 跟随键盘调整可用高度
聊天输入 -> KeyboardChatFrame: 保留已有同步动画
```

开发规范覆盖 iOS 和 Android，要求检查真实软键盘、焦点切换、多行增长、失败后的草稿，以及提交、取消和重试是否可达。聊天内的复杂问答复用展开草稿编辑器。动态页搜索获得焦点时，列表关闭自己的键盘补偿，由固定搜索头部统一调整高度。

实机首先复现预设输入框被完整键盘盖住。首轮修复露出了输入框，但保存按钮仍被压住约 6dp。增加随字号增长的操作空间后，输入框和按钮都通过了原生边界检查。

## E 验证与边界

移动端测试 562 通过、8 跳过。模型 RPC 与 CLI 的 35 项相关测试已通过。此 head 的必需 CI 检查均通过，包括类型、lint、格式、构建、测试、双平台打包、文档与隔离 Host smoke。跳过项仍保留跳过状态。

Android 预设表单在深浅色、字号 1 / 1.3 / 2 的六组实机检查均通过。配对、Host 名称、定时任务、群组改名、动态页与独立问答页、聊天列表与动态页搜索也通过各自的原生键盘检查。

展开编辑器关闭后重开，输入内容仍在；任务草稿随后已清空，没有发送消息或回答。聊天输入框动画测到 13 个中间位置，录屏为 30fps。证据逐项标注源码版本；最终运行代码为 c7dc11f，后续 head 只增加规范与证据。

本机不提供 iOS 原生、TalkBack、Release 120 FPS 或推送送达结论。远程控制、内嵌网页输入、原生保存失败恢复和长文本光标移动仍待专项验证。原有 Material 视觉验收与本轮键盘验收分开记录。PR 在新增交互经过 Human QA 前保持草稿。

Base: be4a35da8d144b3ca9a7a29121a077a543ef3893。Head: e1c0de9637004394b9e8e76e7a0adefba079b050。解释页仅帮助审阅，不代替原生证据或验收。

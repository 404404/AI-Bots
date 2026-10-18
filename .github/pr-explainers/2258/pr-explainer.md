---
title: T1：DeepSeekBot 本地主题
subtitle: "PR #2271 · 独立配色、持久化与验证边界"
lang: zh
template: doc
source: 2026-10-19
base: da1112c34ac21c6238a62d2a29f843f2d2eb7eeb
head: 17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae
---

## A 改变了什么

DeepSeekBot 可以独立选择浅色、深色或跟随系统。
浅深分别保存经典蓝、雾紫及自定义 Primary。

| 行为 | 原来 | T1 |
| --- | --- | --- |
| 主题选择 | 写 DSH 原生主题 | 写设备本地偏好 |
| 浅深混搭 | 无独立配置 | 两套分别保存 |
| Web 与 Desktop | 原生 Host 偏好 | 两端独立保存 |
| 自有弹窗 | 跟随原生模式 | 跟随 DeepSeekBot 模式 |

[查看 PR #2271](https://github.com/BotHarness/DeepSeekBot/pull/2271)。此 PR 只关闭 #2258。

## B 谁保存，谁渲染

```flow
设置界面 -> 本地外观模块: 修改
指定客户端的CLI -> 临时Host投递: 已认证
临时Host投递 -> 本地外观模块: 单目标请求
本地外观模块 -> 本地存储: 先保存
本地存储 -> 已接受快照: 成功
已接受快照 -> 自有界面与弹窗: 限定作用域
```

Web 使用浏览器和站点的 localStorage。
Desktop 使用固定应用 origin，不含 Host 标识。
Host 只保留临时投递状态，不保存外观副本。

[外观模块](https://github.com/BotHarness/DeepSeekBot/blob/17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae/packages/client/src/client/appearance.ts) · [投递模块](https://github.com/BotHarness/DeepSeekBot/blob/17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae/packages/core/src/appearance/control.ts)

## C 失败与边界

| 情况 | 行为 |
| --- | --- |
| 存储失败或版本不可读 | 保留原内容，返回明确错误 |
| 重新选择预设 | 清除该模式自定义 Primary |
| 修改一个模式 | 保留另一模式与未知字段 |
| CLI 缺少目标或目标过期 | 拒绝，不广播 |
| CLI 投递后超时 | 结果可能已发生，重读后再决定 |
| 同站点并发写入 | 最后写入生效；不是跨标签事务 |

原生 DSH 模式和 PersonaBot 身份源色不变。
菜单、modal 与已标记浮层有明确作用域。
上游通用 tooltip 和 toast 保留原生渲染。

[设计决策 ADR-0236](https://github.com/BotHarness/DeepSeekBot/blob/17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae/docs/adr/0236-deepseekbot-appearance-is-client-local-and-scoped.md)

## D 已验证与未验证

| 类别 | 结果 |
| --- | --- |
| 聚焦测试 | 23 项新测试通过，52 项既有回归通过 |
| 静态检查 | lint、类型、格式与构建通过 |
| 实际 Web | 模式、持久化、CLI、隔离与重入通过 |
| macOS Desktop | UI、CLI、应用重启及不同 Host 重启恢复通过 |
| 全量测试与 CI | 查看 PR 最新验证评论；不能由聚焦测试替代 |
| Human QA | 待用户验收，未合并 |

不同 Host 验证使用同一应用目录重启到另一独立 Profile。
尚未验证交互式 Host 切换界面和 Windows。
运行时 Plugin 卸载未执行，作用域释放有源测试。

[截图与复现记录](https://github.com/BotHarness/DeepSeekBot/blob/17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae/.github/pr-screenshots/2258-local-appearance/README.md)

## E Human QA 路径

1. 打开 Bot 设置中的外观。
2. 为浅深分别选择配色和主色。
3. 切换模式，检查两套设置是否恢复。
4. 退出再进入 Bot mode，比较原生 DSH。
5. 重启，检查保存结果与视觉效果。

全部切片继续以独立 Draft PR 交付。
本页不是 Human 验收、合并或发布授权。

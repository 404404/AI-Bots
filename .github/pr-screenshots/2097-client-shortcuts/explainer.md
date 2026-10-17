---
title: 指定 Client 的布局与快捷键
subtitle: Draft PR #2135 / #2136 · 2026-10-18
lang: zh
template: doc
theme: paper
---

只改变选定的实时 Client。布局与快捷键继续由现有所有者保存。

## A 审阅版本

| 项目                 | 固定版本                                                     |
| -------------------- | ------------------------------------------------------------ |
| 布局 PR              | [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135) |
| 布局依赖源码         | `757dad603e814349aac2cd1a2aea115ea200a2da`                   |
| 布局审阅源码及证据   | `35dcde43749bfe45c3ebd3805bc66ed9e95c2561`                   |
| 快捷键 PR            | [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136) |
| 快捷键审阅源码及证据 | `90df9fd8d3082769cded808f39d983f7a65deaca`                   |
| 实际构建与 Web 验证  | `6eea6b76828c94c7a4dbcab00ff101a2cde16ca1`                   |

构建后只添加了证据并重排提交。产品源码与验证版本相同。
本页是审阅说明，不是合并批准。原生覆盖仅限明确列出的用例。

## B 请求经过哪些边界

```flow
HumanCLI -> Host: 选定 ClientTarget
TobApproval -> Host: 审阅后的操作
Host -> Client: generation 与授权校验
Client -> LayoutOwner: 指纹与当前 Channel 校验
Client -> ShortcutOwner: 指纹与 profile 校验
LayoutOwner -> LayoutStorage: 现有 v8 布局
ShortcutOwner -> ShortcutStorage: 既有保存所有者
```

ClientTarget 包含实时 Client 身份与 generation。
刷新后必须重新发现目标。布局写入不会自动切换 Channel。
同源标签页共享布局存储。过期所有者停止保存，等待刷新。

## C 布局可以改什么

| 操作                 | 检查与结果                   |
| -------------------- | ---------------------------- |
| 面板移动、尺寸、间距 | 目标必须存在且可用           |
| 控制栏顺序与位置     | 保留稳定面板 ID              |
| 子面板方向与比例     | 需要明确当前 Channel         |
| 隐藏后恢复           | 保留嵌套树与已保存比例       |
| 旧布局升级           | 复用原迁移与备份规则         |
| 保存结果不明         | 返回 uncertain，先读回再决定 |

[布局操作实现](https://github.com/BotHarness/DeepSeekBot/blob/35dcde43749bfe45c3ebd3805bc66ed9e95c2561/packages/client/src/client/client-layout-control.ts)

## D 快捷键怎样保存

```flow
ReviewedEdit -> Checks: 指纹、授权、生命周期
Checks -> NavigationOwner: 既有导航命令
Checks -> NativeOwner: 面板命令与 revision
NavigationOwner -> Profiles: 保存当前平台配置
NativeOwner -> SerialQueue: 排队后再次比较 revision
SerialQueue -> AtomicStorage: 写入被接受的配置
```

导航覆盖迁移为六个独立 profile。null 表示明确禁用。
恢复默认只影响单项命令。冲突不会抢占已有绑定。
Web 实测发现默认 Command+K 被误拒绝，现已修复。
原生面板仍拒绝不支持的浏览器组合。

[快捷键处理实现](https://github.com/BotHarness/DeepSeekBot/blob/90df9fd8d3082769cded808f39d983f7a65deaca/packages/client/src/client/client-shortcut-control.ts)

## E 原生保存的取消边界

| 时刻                   | 可承诺的行为                       |
| ---------------------- | ---------------------------------- |
| 调用 owner 前          | 再查授权、signal 与状态指纹        |
| owner 接受后           | API 没有取消参数，不能承诺撤销保存 |
| 回包丢失或生命周期失效 | 返回 client-outcome-uncertain      |
| 结果不确定后           | 重新发现 Client 并读回，不自动重放 |

已读安装版 Desktop 0.2.0-rc.2 的实际代码。
其构建为 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`。
实际 owner 在串行队列里、写入前比较 revision。
这项源码审阅不能代替原生运行验证。

## F 已有证据与剩余门槛

主任务完成独占原生运行和重启，并逐次恢复主应用。
Electron 按键事件真正打开 Home。此结果不等于物理键盘验证。

原生布局验证了移动、比例、隐藏恢复、切换频道及重启持久化。
两次原生脚本选择器失败均保留；它们未验证任何嵌套修改。
布局尺寸证据来自实际所有者读回，不代表物理拖拽或像素适配审查。

| 证据类别                        | 状态                                       |
| ------------------------------- | ------------------------------------------ |
| 19 文件定向覆盖                 | 修复初始失败后覆盖 165 个用例              |
| 最新快捷键回归                  | 7 / 7 通过                                 |
| TypeScript、lint、format、build | 通过                                       |
| Web 双 Client 隔离与布局迁移    | 通过                                       |
| Web 真正按键、禁用、恢复与刷新  | 通过                                       |
| 原生单 Client 运行与重启        | 嵌套树、比例、间距及快捷键持久化通过       |
| 物理键盘、IME 与模态边界        | 未验证                                     |
| Web Tob 模型审批与读回          | 布局与快捷键通过；拒绝和过期保留原状态     |
| 完整远端 CI                     | 产品等同版本通过三个测试分片及所有必需检查 |
| 原生 Tob 模型审批               | 未验证                                     |
| Human QA 与合并                 | 未批准                                     |

[布局截图与验证范围](https://github.com/BotHarness/DeepSeekBot/blob/35dcde43749bfe45c3ebd3805bc66ed9e95c2561/.github/pr-screenshots/2096-client-layout/evidence.md)

[快捷键截图与验证范围](https://github.com/BotHarness/DeepSeekBot/blob/90df9fd8d3082769cded808f39d983f7a65deaca/.github/pr-screenshots/2097-client-shortcuts/evidence.md)

自然语言请求经 Home 进入现有审批卡片。四个模型回合均完成，消息均已处理。
独立第二个 Client 的布局与快捷键指纹保持不变。

[实际 Tob 审批记录](https://github.com/BotHarness/DeepSeekBot/blob/90df9fd8d3082769cded808f39d983f7a65deaca/.github/pr-screenshots/2097-client-shortcuts/natural-tob-verification.json)

[原生嵌套树与重启记录](https://github.com/BotHarness/DeepSeekBot/blob/35dcde43749bfe45c3ebd3805bc66ed9e95c2561/.github/pr-screenshots/2096-client-layout/native-verification.json)

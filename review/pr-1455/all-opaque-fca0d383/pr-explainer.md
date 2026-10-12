---
title: Lark 审批规则 · 精确与 all-opaque
lang: zh
---

## A 当前结果与验收范围

精确与 all-opaque 首片均获 Human 接受。范围变化、重启门禁及最终停用卡片已实测。

| 绑定 | 值 |
|---|---|
| Host PR | [1455](https://github.com/BotHarness/DeepSeekBot/pull/1455) · Draft |
| Host head | dbe952ad7f7261eac377d36c3694574b1e8cddaa |
| Native QA runtime | fca0d383193791ee0f5a45cdafcd6e9a5794639f |
| Host base | 5134234e18ffd41d566fd94a0ccd214534f92318 |
| Provider PR | [24](https://github.com/DoodleBears/dsh-im/pull/24) · Draft |
| Provider head | bc795b9cb576c411f0c94997e025b72a94c4f1fb |
| Provider base | 99df05b7c2a14ebb6c122e4f22d655b6b9cbacc7 |
| 日期 | 2026-10-12 |

最新 head 仅追加教程与截图，运行代码仍与 QA head 相同。
页面解释源码，不代替运行证据或合并许可。

## B 两种规则分别确认

```flow
默认卡片 -> 精确预览: 完整输入
默认卡片 -> 全范围预览: 全部工具
精确预览 -> 精确确认: 种类绑定
全范围预览 -> 全范围确认: 独立风险
精确确认 -> 原生拥有者: 复查
全范围确认 -> 原生拥有者: 复查
原生拥有者 -> 同一规则存储: 再次检查
```

精确确认不能授予 all-opaque。切换种类前先返回。
默认允许一次只处理当前调用。返回不保存规则。
全范围规则会匹配不同工具和不同命令。
命令可能访问其他文件或网络，需明确确认高风险。

## C 范围与当前权限

| 条件 | 行为 |
|---|---|
| 同一 Bot、执行角色、目录与 Grant 版本 | 规则才可能匹配 |
| 当前批准和独立保存规则能力 | 每次使用前检查 |
| 原配对或能力被撤销 | 永久停用创建人的规则 |
| 恢复权限或重新配对 | 旧规则仍停用，需重新创建 |
| 原生会话授权要求 Web | 外部规则不能自动批准 |
| 原生、Workspace、Service 授权 | 保存规则不会扩大它们 |

Generation 82 沿用既有规则表，记录外部创建人。
升级前备份；旧程序回退需要备份或兼容修复。

代码：[审批拥有者](https://github.com/BotHarness/DeepSeekBot/blob/dbe952ad7f7261eac377d36c3694574b1e8cddaa/packages/core/src/workspaces/tool-approval.ts)、[规则存储](https://github.com/BotHarness/DeepSeekBot/blob/dbe952ad7f7261eac377d36c3694574b1e8cddaa/packages/core/src/workspaces/tool-approval-rules.ts)、[ADR-0175](https://github.com/BotHarness/DeepSeekBot/blob/dbe952ad7f7261eac377d36c3694574b1e8cddaa/docs/adr/0175-external-tool-rules-retain-current-creator-authority.md)。

## D Provider 与账户资格

| 资格 | 可用规则 |
|---|---|
| 规则卡片版本 1 | 精确规则 |
| 版本 2，账户仅支持精确 | 保留精确与允许一次／拒绝 |
| 版本 2，账户支持受校验的 all-opaque | 另加全范围入口 |
| 账户或 fingerprint 改变 | 重查资格，不能沿用他人状态 |

发卡前再次读取当前 Provider 资格。
失去更广能力时拒绝宽卡片，并更新账户记录。
重新发卡可回到精确规则。
Questions 与群执行目的地保留独立边界。

## E 已完成检查与下一门槛

| 检查 | 状态 |
|---|---|
| 当前 Host／Client 回归 | 64 项修复相关测试通过，既有宽卡片回归保持通过 |
| Provider | 86 项相关测试通过，构建成功 |
| 类型、格式、lint、构建 | 通过 |
| 规范／规格复核 | 两个轴均无剩余源码发现 |
| 双语教程 | 包含已接受精确路径的真实脱敏截图 |
| 文档构建 | 476 页构建成功 |
| 精确路径真实 Lark | 已接受；原窗口释放、接收器停止 |
| all-opaque 真实 Lark | QA1：返回、宽确认、不同输入、范围变化、撤销重启已实测 |
| 当前 CI | 运行源码 fca0d383 的完整 CI 通过；当前文档 head 请见 PR |

隔离 Host 复用原端口；当前任务接收器已停止。
真实截图包含基线卡片、宽确认与 Back、不同输入回复。

仅 IM 使用的 Bot，无需先打开 Web DM 即可请求审批。
重启时中断了一次停用卡片更新；重发相同撤销命令后更新成功。
这不会再次执行调用；刷新后网页显示已停用且无按钮。

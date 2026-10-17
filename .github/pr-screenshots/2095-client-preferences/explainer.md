---
lang: zh
template: doc
theme: paper
title: Tob 偏好控制：目标、范围与现有 owner
subtitle: Draft PR 2126 · Issue 2095 · 2026-10-18
source: CI 修复源码 5b4cc293fa2ab661543b0a464a1ada38268d3115
---

## A 用户能做什么

Tob 可通过普通 Shell CLI 读取和申请修改偏好。
审批展示目标、旧值、新值与实际作用范围。
所有写入复用现有 owner，不建立偏好的第二份状态。

| 偏好                       | 现有 owner            | 实际范围                    |
| -------------------------- | --------------------- | --------------------------- |
| 主题、语言                 | native Settings       | Host，影响所有连接的 Client |
| 动效、图标、发送键、群邀请 | BotHarness Settings   | Host                        |
| 桌面通知开关               | desktop-notifications | 同一浏览器 origin 共享      |
| 默认 Human 名称            | humanIdentity         | Human profile               |
| IM 消息默认值              | messagingDefaults     | Host 中指定平台             |

主题和语言要求显式 Host scope。
误标为当前 Client 的请求返回 host-scope-required。
OS 通知权限仍由 Human 控制。

## B 当前 Client 如何可信

```flow TB
Human提交 -> 认证adapter: 校验私有proof
认证adapter -> SourceEvent: 固定Client目标
SourceEvent -> TobCLI: 从已接受来源求当前目标
TobCLI -> 现有审批: 目标和实际scope
现有审批 -> Client派发: 校验generation和lease
Client派发 -> 原有owner: apply前再次authorize
```

发现目标不等于获得修改权。
注册、轮询、完成和来源绑定都检查私有 proof。
模型不能自行提供可信的 current Client。
固定版本的 HTTP 请求共享 OperatorPeer。
这个 peer 是认证 operator，不能代表独立浏览器身份。
私有 mount proof 和 tab-owner proof 区分 Client incarnation。

## C 并发与生命周期

同 origin 的通知开关使用同一个 localStorage key。
UI 与 CLI 写入都通过同一个 WebLock 串行执行。
owner 先刷新真实存储，再比较 expectedState。
等锁后再次校验来源权限，再提交原有 owner。

| 情况                       | 行为                            |
| -------------------------- | ------------------------------- |
| 同 origin 另一 tab 已修改  | 刷新 UI，拒绝旧 fingerprint     |
| tab reload 替换 generation | 拒绝旧目标                      |
| mount 已卸载               | signal 中止排队写入             |
| 没有 WebLocks              | scoped CAS 明确拒绝             |
| 已派发后超时               | outcome uncertain，先 reconcile |
| 请求 OS 权限               | 保留 Human 原有界面流程         |

[ADR-0229](https://github.com/BotHarness/DeepSeekBot/blob/eb0f85116d934d56d8c60b92e88117e6f2b18725/docs/adr/0229-client-control-dispatch-keeps-existing-preference-owners.md) 记录这些边界。

## D 已取得的证据

| 检查                              | 结果与边界                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| 原运行源码 focused checks         | 187/188；修正新增 RPC 清单后相关 33/33 通过                   |
| 原运行源码 typecheck、lint、build | 通过；lint 保留原有 warnings                                  |
| Web 真实双 tab                    | UI 同步、旧 CLI 拒绝、新 CLI 两端可见                         |
| 独立 browser context              | 通知值隔离，Host 主题共同变化                                 |
| 自然 Tob 通知请求                 | 来源、审批、普通 Shell trace、owner readback 通过             |
| 自然 Tob Host 主题请求            | 审批明确 all connected clients，native Settings readback 通过 |
| Host 与浏览器进程重启             | 同 Profile、保留浏览器存储，先读后写验证通过                  |
| 原生单 Client                     | 实际通知控件、普通 CLI、自然 Tob 审批与 Host 主题通过         |
| 原生进程重启                      | 同绝对 Profile 与 userdata，通知和主题先读后写验证通过        |

CI 的 9 个失败来自准确清单和无浏览器启动假设。
没有 OOM 或 timeout 失败证据。
修复后五个 focused 文件通过 48/48。
cleanup 返回值修正后，相关两个文件通过 14/14。
最终 root/mobile typecheck 和 build 通过。
实际浏览器挂载与无浏览器启动都有回归覆盖。

最初 Go provider 返回 429。
保留失败后，使用已授权官方 provider 和全新 Human 请求。
成功 Web journeys 的 page-error 列表为空。
截图展示真实动作前后，不代表基线版本的像素差异。

## E 仍需验证与回退

父级已完成原生 Desktop 单 Client 与重启验证。
两次进程退出均为 0，page-error 列表为空。
真实 OS 权限提示和通知投递仍未验证。
原生脚本和截图只覆盖选定的一个 Client。
它不证明双窗口、独立 context 或三个 Client 的行为。

exact-head 6783 的完整 CI 已通过。
Human QA、合并与部署仍未完成。

该变更可通过 revert 恢复，未新增持久化迁移。
影响范围较大，涉及可信来源和现有共享偏好写入。
重点审查 proof、generation、审批重检与原有 owner。

基线为 a3e2c4e64d131191e686e33cb207d3db9b3a0937。
运行图像和模型证据来自 eb0f85116d934d56d8c60b92e88117e6f2b18725。
CI 修复为 5b4cc293fa2ab661543b0a464a1ada38268d3115。
它加入无浏览器环境的启动 guard。

该修复之后，父级补跑原生 direct 阶段并通过。
实际通知控件、刷新持久化与旧 generation 拒绝已验证。
它只覆盖一个原生 Client，page-error 为空。
Web、模型与外部进程重启旅程仍使用原证据。
本页是 review 说明，不是 native 验收或 Human 批准。

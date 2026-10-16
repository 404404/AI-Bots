---
title: Browser 启动 404 修复
subtitle: "PR #2018 · 首帧、所属标签页与失败证据"
lang: zh
template: doc
source: 5d81064d78ee4c2dabfa78c755c00908c780b423
base: 0f9f690071c5345eed4427bdcc5ad2471ff77474
date: 2026-10-16 UTC
---
## A 问题与结论
Browser 进程开始运行时，Provider 可能还没有登记当前标签页。
旧 observation 已经给出 viewer 地址，画面请求因此可能返回 `404 no browser tab`。
新实现等当前所属标签页存在后再发布地址。

原始偶发失败的响应正文没有保存，不能断言历史 404 只可能来自这一个分支。
本次通过暂停真实 Host 路由测试中的窗口创建，稳定重现了过早发布地址的竞争条件。
修复前测试失败，修复后通过。

## B 状态由谁决定
```flow
打开 Browser -> Runtime: 启动进程
Runtime -> Provider: 创建并登记所属标签页
Provider -> observation: 当前标签页存在
observation -> Viewer: 发布本地画面地址
Viewer -> Host: 等待同一 Bot 的首帧
```
没有新增产品状态库。Browser Provider 继续拥有标签页，Runtime 继续拥有进程。
延迟画面返回前再次核对 Access、Runtime 和当前标签页；切换标签页时丢弃旧画面。

[查看 Host 修复](https://github.com/BotHarness/DeepSeekBot/blob/5d81064d78ee4c2dabfa78c755c00908c780b423/packages/browser/src/index.ts)

## C 等待与失败
| 状态 | 可观察结果 |
|---|---|
| 进程运行、尚无当前所属标签页 | observation 的 viewerUrl 为空 |
| Viewer 等待首帧 | 显示等待文字，每次请求最多 15 秒 |
| Browser 停止 / 没有标签页 | 保留不同正文的 HTTP 404 |
| 有界等待后仍无首帧 | HTTP 503：frame unavailable |
| 请求失败或超时 | 自动画面轮询结束，由现有 Reconnect 显式恢复 |
| 等待期间 Access 撤销 | 拒绝返回画面 |

HTTP 和 console 错误仍由验证器记录。正常持续观测仍会轮询；首帧等待不构成通过证明。

[查看 Viewer 修复](https://github.com/BotHarness/DeepSeekBot/blob/5d81064d78ee4c2dabfa78c755c00908c780b423/packages/browser/src/viewer-local.ts)

## D 验证与评审边界
本地相关回归 497 项通过、8 项按前提跳过；lint、格式、类型检查和构建通过。
两路独立代码审查均无发现。完整本地套件没有运行；CI 和最终提交运行结果见同目录 README。

真实路径为 Bot mode → Browser → 打开 → 同一标签页的确定性本地页面 → 停止 → Access-off 拒绝。
验证器不再自动点击 Reconnect 来恢复初次启动。
截图、ARIA、权威读取、诊断、首次失败和修复后的记录分别保留。

Human QA、模型执行、原生设备及 IM 均未运行。
本 PR 不包含合并、发布或部署授权。
评审者可按同目录 human-qa.md 启动自己的隔离 Host 复验；证据中的本地页面地址已停止。

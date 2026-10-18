---
template: doc
theme: paper
lang: zh
title: Tob 管理能力 · 父任务审阅索引
subtitle: 从用户行为进入，再检查权限、持久化与交付门槛
source: 审阅源码54c09227 · 运行证据205a5bda · 新CI待完成
---

## A 现在可以审阅什么

16 个 owner PR 已实现各自切片，并公开范围内的实际证据。现已可审阅；最终整栈、Human QA 和发布仍有独立门槛。

```callout warn 尚未宣布整体完成
这是审阅源码快照，不是合并或发布批准。17层已经公开；205a Native 已通过。v7审阅源码已冻结为54c09227；新CI仍待完成。最终评论将绑定资产提交与CI结果。
```

快照：2026-10-18T00:40:04.555857+00:00。状态来自交付矩阵及公开 PR。负责人补充事实会单独注明。

| 状态              | 含义                                           |
| ----------------- | ---------------------------------------------- |
| 已公开证据        | 可查看固定提交的截图与记录；不自动覆盖后续代码 |
| 负责人已验证      | 实际检查有结果；公开资产或独立复核仍待完成     |
| 待验证            | 不把测试、截图或启动成功替代实际行为           |
| **2 / 16 已关闭** | Issue 关闭数量，不是 Draft 交付完成率          |

原有 15 个子任务加上 #2134，现为 16 个。Home #2140 是父任务切片。Human QA、合并和发布各自保留。

## B 建议怎样审阅

先看用户行为，再看共享边界。下表是审阅顺序，当前 PR 已形成17层公开依赖链。

| 顺序 | 用户行为                   | 入口                                                                                                                                                                                       | 审阅重点                                 |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1    | 从 Home 查看工作、创建 Bot | [#2140](https://github.com/BotHarness/DeepSeekBot/pull/2140)                                                                                                                               | 先看四卡片、审批来源和无模型创建         |
| 2    | 管理 Channel 与定时任务    | [#2119](https://github.com/BotHarness/DeepSeekBot/pull/2119) · [#2127](https://github.com/BotHarness/DeepSeekBot/pull/2127) · [#2123](https://github.com/BotHarness/DeepSeekBot/pull/2123) | 核对选中目标、审批、暂停与重启           |
| 3    | 读取与修改 Memory          | [#2128](https://github.com/BotHarness/DeepSeekBot/pull/2128) · [#2132](https://github.com/BotHarness/DeepSeekBot/pull/2132) · [#2143](https://github.com/BotHarness/DeepSeekBot/pull/2143) | 核对只读范围、版本冲突和内容分页         |
| 4    | 管理当前 Client            | [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126) · [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135) · [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136) | 核对两个 Client 隔离、嵌套布局和实际按键 |
| 5    | 管理授权与设备             | [#2139](https://github.com/BotHarness/DeepSeekBot/pull/2139) · [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129)                                                                | 核对撤销、同次连接流程与设备失效         |
| 6    | 转移、导入与恢复           | [#2142](https://github.com/BotHarness/DeepSeekBot/pull/2142) · [#2147](https://github.com/BotHarness/DeepSeekBot/pull/2147) · [#2141](https://github.com/BotHarness/DeepSeekBot/pull/2141) | 核对导入保留内容、回执重放和恢复后激活   |
| 7    | 安装与最终整合             | [#2144](https://github.com/BotHarness/DeepSeekBot/pull/2144) · [#2149](https://github.com/BotHarness/DeepSeekBot/pull/2149)                                                                | 区分本地产物安装、正式版本安装和整栈验证 |

依赖主线：Channel 基础 → Schedules → Memory 只读 → Memory 编辑 / Home / 内容读取。

Client 主线：Channel 基础 → Client 偏好 → 布局 → 快捷键。这些概念主线在下面的实际17层链中顺序组合。

当前实际公开合并依赖链，共 17 层：

1. [#2119](https://github.com/BotHarness/DeepSeekBot/pull/2119) · Channel preferences
2. [#2123](https://github.com/BotHarness/DeepSeekBot/pull/2123) · Schedules
3. [#2128](https://github.com/BotHarness/DeepSeekBot/pull/2128) · Memory read
4. [#2132](https://github.com/BotHarness/DeepSeekBot/pull/2132) · Memory edit
5. [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126) · Client preferences
6. [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135) · Layout
7. [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136) · Shortcuts
8. [#2139](https://github.com/BotHarness/DeepSeekBot/pull/2139) · Grants
9. [#2140](https://github.com/BotHarness/DeepSeekBot/pull/2140) · Home
10. [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129) · Devices
11. [#2141](https://github.com/BotHarness/DeepSeekBot/pull/2141) · Backup
12. [#2127](https://github.com/BotHarness/DeepSeekBot/pull/2127) · Channel transfer
13. [#2142](https://github.com/BotHarness/DeepSeekBot/pull/2142) · Bot transfer
14. [#2147](https://github.com/BotHarness/DeepSeekBot/pull/2147) · Marketplace
15. [#2143](https://github.com/BotHarness/DeepSeekBot/pull/2143) · Selected content/progress
16. [#2144](https://github.com/BotHarness/DeepSeekBot/pull/2144) · Maintenance
17. [#2149](https://github.com/BotHarness/DeepSeekBot/pull/2149) · Final shared corrections Draft

此链是当前公开 base 与祖先关系。Human 可按上面的行为分组审阅。全部17个 PR 尚未合并，auto-merge 未启用。

最终整合需重新核对所有共享契约。这里不授权重排、合并或关闭 Issue。

## C 日常操作的实际证据

| 行为 / PR                                                                                                                           | 实际结果                                                                     | 截图与记录                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home [#2140](https://github.com/BotHarness/DeepSeekBot/pull/2140)                                                                   | 四卡片、真实问题与审批来源、创建及重启已验证。嵌入 Git/ZIP 新结果已公开。    | [Web](https://github.com/BotHarness/DeepSeekBot/raw/5bafc55f0feefbc895565dbb83f07546f03a8b8d/.github/pr-screenshots/2081-home/after-no-model-creation-web.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/5bafc55f0feefbc895565dbb83f07546f03a8b8d/.github/pr-screenshots/2081-home/after-dashboard-native.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2140)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Channel [#2119](https://github.com/BotHarness/DeepSeekBot/pull/2119) / [#2127](https://github.com/BotHarness/DeepSeekBot/pull/2127) | 偏好、删除和附件上传有 Web/macOS 结果。含 Bot 的群清理仅有源码覆盖。         | [Web](https://github.com/BotHarness/DeepSeekBot/raw/a3e2c4e64d131191e686e33cb207d3db9b3a0937/.github/pr-screenshots/tob-channel-preferences/web-after.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/a3e2c4e64d131191e686e33cb207d3db9b3a0937/.github/pr-screenshots/tob-channel-preferences/desktop-after.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2119)<br>[Web](https://github.com/BotHarness/DeepSeekBot/raw/6396cbd26d98042898443dda7333781b5f2e7a79/.github/pr-screenshots/tob-channel-transfer/attachment-upload-after.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/25907692054fa4320ac598326fbedd3f5bdc87c3/.github/pr-screenshots/tob-channel-transfer/native-attachment-upload-after.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2127) |
| Schedules [#2123](https://github.com/BotHarness/DeepSeekBot/pull/2123)                                                              | 实际到期触发、回复、暂停和启动恢复。旧失败记录保留。                         | [Web](https://github.com/BotHarness/DeepSeekBot/raw/308ae4cd6a8f85e9489952f93f350bbc2a264415/.github/pr-screenshots/tob-schedules/after-paused-restart.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/6a6cc80b8f8c06c3327e79df025e1be954e50eb0/.github/pr-screenshots/tob-schedules/native-startup-recovered-paused.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2123)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Client 偏好 [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126)                                                            | 两 Web Client 隔离；Native 代际拒绝和重启。后加 guard 未重跑完整 Web/model。 | [Web](https://github.com/BotHarness/DeepSeekBot/raw/70a81a941fb5b622c84de0fc6698c5498ab518a5/.github/pr-screenshots/2095-client-preferences/tob-host-theme-result.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/757dad603e814349aac2cd1a2aea115ea200a2da/.github/pr-screenshots/2095-client-preferences/native-guard-restart-readback.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2126)                                                                                                                                                                                                                                                                                                                                                                                                   |
| 布局 [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135)                                                                   | 真实 Tob 审批、双 Client 隔离；Native 嵌套比例、移动、显隐和重启。           | [Web](https://github.com/BotHarness/DeepSeekBot/raw/35dcde43749bfe45c3ebd3805bc66ed9e95c2561/.github/pr-screenshots/2096-client-layout/natural-tob-approved.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/35dcde43749bfe45c3ebd3805bc66ed9e95c2561/.github/pr-screenshots/2096-client-layout/native-nested-restart.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2135)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 快捷键 [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136)                                                                 | 真实 Tob 审批、实际 Electron 按键、提示、输入框与弹窗保护、可信组合事件。    | [Web](https://github.com/BotHarness/DeepSeekBot/raw/c088e6aae31476ea5516e6091dfd519840804258/.github/pr-screenshots/2097-client-shortcuts/natural-tob-approved.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/c088e6aae31476ea5516e6091dfd519840804258/.github/pr-screenshots/2097-client-shortcuts/native-tob-actual-key-hint.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2136)                                                                                                                                                                                                                                                                                                                                                                                                           |

主题和语言受当前 DSH Host 范围约束。仅修改当前 Client 的不支持操作会拒绝。

Native 默认 Quick Switcher 的 K 与既有 session.search 冲突。复位请求正确拒绝并保留 J。Home 的 U → H 复位另有成功证据。

物理键盘、物理拖拽和具体系统输入法流程未覆盖。

## D 权限与数据边界怎样证明

| 能力 / PR                                                                | 实际结果与限制                                                                                                         | 截图与记录                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory 只读 [#2128](https://github.com/BotHarness/DeepSeekBot/pull/2128) | 限定范围的比较与继续读取；拒绝原始文件读取、写入和撤销后的访问。综合Web/macOS已通过，最终CI和HumanQA待完成。           | [Web](https://github.com/BotHarness/DeepSeekBot/raw/6450b21107d70f681873fa0507375d42a50897ce/.github/pr-screenshots/tob-memory-read/after-revoked-scope.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/057b3f2e6fbddbc5821bf37624d36bd544d23572/.github/pr-screenshots/tob-memory-read/native-stable-assignment-session.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2128)               |
| Memory 编辑 [#2132](https://github.com/BotHarness/DeepSeekBot/pull/2132) | 审批后写入、拒绝、过期版本、审阅后恢复和同目录重启。保留原运行版本，未冒充新整栈。                                     | [Web](https://github.com/BotHarness/DeepSeekBot/raw/910f38d35163b265bd428e4b470e977021daeba8/.github/pr-screenshots/tob-memory-edit/reviewed-edit.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/910f38d35163b265bd428e4b470e977021daeba8/.github/pr-screenshots/tob-memory-edit/native-after-restart.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2132)                                 |
| 内容 / 进度 [#2143](https://github.com/BotHarness/DeepSeekBot/pull/2143) | 三个 Channel 类型、签名游标、Unicode 分块、真实模型回复和 Native 重启。原 owner 版本完整 CI 通过；新公开 head 见附录。 | [Web](https://github.com/BotHarness/DeepSeekBot/raw/f24527f167c1dd350da1e1701011bf987a25e505/.github/pr-screenshots/tob-content-read/after-expanded-reply.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/f24527f167c1dd350da1e1701011bf987a25e505/.github/pr-screenshots/tob-content-read/native-expanded-reply.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2143)                       |
| 授权 / 连接 [#2139](https://github.com/BotHarness/DeepSeekBot/pull/2139) | 授予、撤销、策略、同次 Feishu 配置继续/取消和重启。未提交真实凭据或验证外部投递。                                      | [Web](https://github.com/BotHarness/DeepSeekBot/raw/b9b8529a5bca353638a141dccdd1bc0dd6b2ee00/.github/pr-screenshots/tob-policy-management/same-attempt-form-light.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/061b36566b5524bd3b2f8366946f9b14baf10b7b/.github/pr-screenshots/tob-policy-management/native-same-attempt-form-light.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2139) |
| 设备 [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129)        | 两个 Human、配对、审批撤销、流关闭和旧设备 401。没有物理手机或 Windows ACL 结论。                                      | [Web](https://github.com/BotHarness/DeepSeekBot/raw/e734b55dc6b74fa07ec9b0e8d1a9e6b762b67f51/.github/pr-screenshots/2098-paired-devices/tob-safe-receipt.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/5f3892c42eb0ada6c326344bde60ac17d4f1e1e3/.github/pr-screenshots/2098-paired-devices/native-full-revoked.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2129)                       |

Native 写入前必须复查授权、signal 和当前 revision。已受理的保存不能被描述成取消。连接丢失应返回 uncertain，再读取结果；不得自动重放。

## E 创建、转移和恢复走到哪里

| 能力 / PR                                                                | 已证明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 仍需审阅                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bot 转移 [#2142](https://github.com/BotHarness/DeepSeekBot/pull/2142)    | Web 导出、ZIP/文件列表/导入、审批拒绝、过期、回执重放与重启。[Web](https://github.com/BotHarness/DeepSeekBot/raw/c6e813114df7bf6470f50ab9ba38a7b1751b2d72/.github/pr-screenshots/tob-bot-transfer/after-export.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/c6e813114df7bf6470f50ab9ba38a7b1751b2d72/.github/pr-screenshots/tob-bot-transfer/native-export.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2142)                                                              | Native 导入、导出、拒绝、过期、原 key 重放和重启均已公开。原 owner 版本c6完整 CI 通过；保留此前断言失败。 |
| Marketplace [#2147](https://github.com/BotHarness/DeepSeekBot/pull/2147) | 公开 Web 与 Native 证明：真实搜索、自定义提案、Git SOUL / ZIP Memory、拒绝、同 key 恢复和同目录重启。[Web](https://github.com/BotHarness/DeepSeekBot/raw/a9527dfbaf5fa299681672043b959c77b943b06d/.github/pr-screenshots/tob-marketplace-2100/zip-memory-after.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/a9527dfbaf5fa299681672043b959c77b943b06d/.github/pr-screenshots/tob-marketplace-2100/native-zip-personality.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2147) | 原 owner 版本9d完整 CI 已通过。原测试清单遗漏已修复并保留失败记录；最终整栈与 Human QA 待完成。           |
| 备份恢复 [#2141](https://github.com/BotHarness/DeepSeekBot/pull/2141)    | 导出→检查→离线新目录恢复→冷恢复→只激活选中 Bot。Native 预览、激活与进程替换通过。[Web](https://github.com/BotHarness/DeepSeekBot/raw/eee077dbade9b73fd26ffb6008c2b96ae5704cfe/.github/pr-screenshots/tob-profile-backup-2099/recovery-after.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/d586c1b1e91d262ef0d8883f40fef7f06b79d717/.github/pr-screenshots/tob-profile-backup-2099/native-recovery.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2141)                        | 整合 schema 100–102 的恢复仍需验证。恢复后模型凭据不可用时正确阻止，未声称 Native 模型回复。              |
| 安装维护 [#2144](https://github.com/BotHarness/DeepSeekBot/pull/2144)    | 实际 Web/macOS 遥测开关、审批及重启；本地 0.0.0 产物安装与模型回复。[Web](https://github.com/BotHarness/DeepSeekBot/raw/3f994eb1c1ad5a730f6212d8f3447a934f01f2db/.github/pr-screenshots/2088-maintenance/web-direct-on.png) · [macOS](https://github.com/BotHarness/DeepSeekBot/raw/3f994eb1c1ad5a730f6212d8f3447a934f01f2db/.github/pr-screenshots/2088-maintenance/native-approve-result.png) · [证据与限制](https://github.com/BotHarness/DeepSeekBot/pull/2144)                                              | 零产品差异的资格记录。原 owner CI 仅受影响测试；正式当前 Tob 发布版安装/重启尚未证明。                    |

Home 嵌入 Git/ZIP：公开证据确认真实表单创建成功。新 Bot 在同一 section 打开 DM；SOUL / MEMORY 与选中源一致。原 owner 版本6b的 Home 完整 CI 已通过。URL-only Git 表单没有 commit 选择器。

## F 两张屏幕，先看最终用户感受

以下为已公开切片的真实 macOS 截图。它们不代表最终整栈已完成验证；图片打开时需要网络。

![Home：工作与审批入口来自现有 owner](https://github.com/BotHarness/DeepSeekBot/raw/5bafc55f0feefbc895565dbb83f07546f03a8b8d/.github/pr-screenshots/2081-home/after-dashboard-native.png)

![快捷键：审批后的实际按键打开切换器，并显示新提示](https://github.com/BotHarness/DeepSeekBot/raw/c088e6aae31476ea5516e6091dfd519840804258/.github/pr-screenshots/2097-client-shortcuts/native-tob-actual-key-hint.png)

## G 最终交付还缺什么

| 门槛                   | 负责人                      | 完成条件                                                                                           |
| ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Owner 切片交付         | 16 个 PR 的 owner           | 范围内实现、原 owner 证据与原 CI 已完成。当前17个新 head 的 CI 另行验收；#2144原为受影响测试。     |
| 公开堆叠 CI            | 各 owner + root             | 17层均已公开。当前新 head 的 CI 独立验收；原 owner 的绿色结果不继承。                              |
| 最终整栈               | channels 整合 owner + root  | 普通fresh-Human Web9备份与此前Triage偏好/只读Memory分别通过。205a构建和Native通过；54c新CI待完成。 |
| schema 100–102 恢复    | 整合 owner + Backup owner   | 实际导出、全新目录恢复、canonical 状态与冷恢复行为。                                               |
| Home 覆盖边界          | Home owner                  | Git/ZIP 实际创建、公开证据和原 owner CI 已通过；degraded usage 仍只有渲染/owner 测试。             |
| 正式发布安装           | models/runtime owner + root | 真正包含当前 Tob 的 npm 发布版本安装与重启尚未验证；本地 0.0.0 tarball 不替代。                    |
| Human QA / 合并 / 发布 | Human + root                | 逐项审批；不以子任务关闭数量替代验收。                                                             |

最终修复 PR 为 #2149。审阅源码为54c09227，运行证据对应205a5bda。第14层测试契约已修复，14–17层审阅源码已冻结。Backup 层保留 nullable Source 修复及 schema102 导出测试。

MemoryRead 使用 ADR0231，Home 保留0230。普通 fresh-Human Web9 的备份通过不等于同一 Triage Turn 通过。205a构建及同一Human跨重启的Native已通过。只读恢复没有新模型请求；两张展开截图已通过。不可变资产链接待冻结。

高风险点：数据库迁移不可直接降级。回退需要升级前备份或兼容的后续修复。

权限、跨 Human 范围、Client 目标和持久化影响较广。以真实 owner 的拒绝、版本比较和读取结果为审阅重点。

物理设备与外部行为仍有边界。手机、Windows ACL、物理键盘和系统输入法未统一验证。真实通知及外部连接投递也不在已验证范围。

历史失败单独保存。失败后的成功恢复，不把原失败改写成首次通过。

## H 精确版本、CI 与证据来源

以下绑定当前17层公开提交。CI 取同 head 的活动替代运行；取消的重复运行另存历史。前13层保留已通过的CI；v7末4层的新CI待完成。

#2126第2次运行通过；首个50ms失败保留。v7只改一份测试，新增9行、删除2行。最终CI结果由父任务评论绑定。

| PR                                                           | 公开 head                                                                                             | 当前公开 base               | 该 head 的 Verify                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| [#2119](https://github.com/BotHarness/DeepSeekBot/pull/2119) | [a3db52dc](https://github.com/BotHarness/DeepSeekBot/commit/a3db52dcc6d4d474d2aeef944f0268e32107cfe7) | main                        | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082107773) · 范围见运行     |
| [#2123](https://github.com/BotHarness/DeepSeekBot/pull/2123) | [971deaf3](https://github.com/BotHarness/DeepSeekBot/commit/971deaf3a6a1896d734ca778eb24ae4e229ce9e6) | 2090-channel-preferences    | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082068549) · 范围见运行     |
| [#2128](https://github.com/BotHarness/DeepSeekBot/pull/2128) | [7180b04f](https://github.com/BotHarness/DeepSeekBot/commit/7180b04f8970eaac4e604cd050f6401d66d7e0b5) | 2093-tob-schedules          | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082062042) · 范围见运行     |
| [#2132](https://github.com/BotHarness/DeepSeekBot/pull/2132) | [9d0b8169](https://github.com/BotHarness/DeepSeekBot/commit/9d0b8169f86d5a2dc24e56ee3b33c7be4e78e1a1) | 2091-tob-memory-read        | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082102840) · 范围见运行     |
| [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126) | [3deaf029](https://github.com/BotHarness/DeepSeekBot/commit/3deaf029b735ede953e8ff584c17b1eafe71a70b) | 2092-tob-memory-edit        | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082091871) · 范围见运行     |
| [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135) | [0a2f07e8](https://github.com/BotHarness/DeepSeekBot/commit/0a2f07e8b6ebb31b7d149037aec8939f25b31f49) | 2095-tob-client-preferences | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082098354) · 范围见运行     |
| [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136) | [ebd8b6b8](https://github.com/BotHarness/DeepSeekBot/commit/ebd8b6b8ed0046b5e1dbaf16fcfddf7c79172cdf) | 2096-tob-layout             | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082103758) · 范围见运行     |
| [#2139](https://github.com/BotHarness/DeepSeekBot/pull/2139) | [682da245](https://github.com/BotHarness/DeepSeekBot/commit/682da245cc3ba9a2f89d4f682c3072541ab57e2d) | 2097-tob-shortcuts          | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082094024) · 范围见运行     |
| [#2140](https://github.com/BotHarness/DeepSeekBot/pull/2140) | [b9149515](https://github.com/BotHarness/DeepSeekBot/commit/b91495157f28781233fad372af7f2e3934182345) | 2094-tob-grants             | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082085002) · 范围见运行     |
| [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129) | [60cbd2be](https://github.com/BotHarness/DeepSeekBot/commit/60cbd2be3a4c82d6b8335ddebd4e95e3cf533b95) | 2081-home-dashboard         | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082097296) · 范围见运行     |
| [#2141](https://github.com/BotHarness/DeepSeekBot/pull/2141) | [4b7b2e47](https://github.com/BotHarness/DeepSeekBot/commit/4b7b2e47e7b14f976409ab184bb367ae5ed1461d) | 2098-tob-devices            | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082360181) · 范围见运行     |
| [#2127](https://github.com/BotHarness/DeepSeekBot/pull/2127) | [e2da8bc3](https://github.com/BotHarness/DeepSeekBot/commit/e2da8bc3934ee344d01ecca9d0df6e739bfa90c4) | 2099-tob-backup             | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082360587) · 范围见运行     |
| [#2142](https://github.com/BotHarness/DeepSeekBot/pull/2142) | [c68c8388](https://github.com/BotHarness/DeepSeekBot/commit/c68c8388ed237505b274b0416d5379cf2455c904) | 2090-channel-transfer       | [通过](https://github.com/BotHarness/DeepSeekBot/actions/runs/39082360540) · 范围见运行     |
| [#2147](https://github.com/BotHarness/DeepSeekBot/pull/2147) | [21195830](https://github.com/BotHarness/DeepSeekBot/commit/21195830d17595083fad6f78b23e9af1c41e397a) | 2089-bot-transfer           | [待完成 · pending](https://github.com/BotHarness/DeepSeekBot/pull/2147/checks) · 范围见运行 |
| [#2143](https://github.com/BotHarness/DeepSeekBot/pull/2143) | [ccb09d73](https://github.com/BotHarness/DeepSeekBot/commit/ccb09d739908bd288cdec93f22041fb93f6c97c4) | 2100-tob-marketplace        | [待完成 · pending](https://github.com/BotHarness/DeepSeekBot/pull/2143/checks) · 范围见运行 |
| [#2144](https://github.com/BotHarness/DeepSeekBot/pull/2144) | [d3421e2a](https://github.com/BotHarness/DeepSeekBot/commit/d3421e2a76cd24c6881ca36d5431393af6a331ae) | 2134-tob-content-read       | [待完成 · pending](https://github.com/BotHarness/DeepSeekBot/pull/2144/checks) · 范围见运行 |
| [#2149](https://github.com/BotHarness/DeepSeekBot/pull/2149) | [54c09227](https://github.com/BotHarness/DeepSeekBot/commit/54c09227a05d08a107bbe28e157d6e21249daf17) | 2088-model-qualification    | [待完成 · pending](https://github.com/BotHarness/DeepSeekBot/pull/2149/checks) · 范围见运行 |

原 owner 的 CI 与运行证据保留在旧版本。下表不是上述新 head 的 CI。

| PR                                                           | 原 owner head                                                                                         | 原 CI                                                                         | 范围       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| [#2119](https://github.com/BotHarness/DeepSeekBot/pull/2119) | [a3e2c4e6](https://github.com/BotHarness/DeepSeekBot/commit/a3e2c4e64d131191e686e33cb207d3db9b3a0937) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39068383749) | 3 分片     |
| [#2123](https://github.com/BotHarness/DeepSeekBot/pull/2123) | [6a6cc80b](https://github.com/BotHarness/DeepSeekBot/commit/6a6cc80b8f8c06c3327e79df025e1be954e50eb0) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39074112846) | 3 分片     |
| [#2126](https://github.com/BotHarness/DeepSeekBot/pull/2126) | [757dad60](https://github.com/BotHarness/DeepSeekBot/commit/757dad603e814349aac2cd1a2aea115ea200a2da) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39076265613) | 3 分片     |
| [#2127](https://github.com/BotHarness/DeepSeekBot/pull/2127) | [25907692](https://github.com/BotHarness/DeepSeekBot/commit/25907692054fa4320ac598326fbedd3f5bdc87c3) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39073680172) | 3 分片     |
| [#2128](https://github.com/BotHarness/DeepSeekBot/pull/2128) | [5d44b7a6](https://github.com/BotHarness/DeepSeekBot/commit/5d44b7a6507d661415881808ab67e74275d54182) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39074946590) | 3 分片     |
| [#2129](https://github.com/BotHarness/DeepSeekBot/pull/2129) | [5f3892c4](https://github.com/BotHarness/DeepSeekBot/commit/5f3892c42eb0ada6c326344bde60ac17d4f1e1e3) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39078469295) | 3 分片     |
| [#2132](https://github.com/BotHarness/DeepSeekBot/pull/2132) | [910f38d3](https://github.com/BotHarness/DeepSeekBot/commit/910f38d35163b265bd428e4b470e977021daeba8) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39075300025) | 3 分片     |
| [#2135](https://github.com/BotHarness/DeepSeekBot/pull/2135) | [35dcde43](https://github.com/BotHarness/DeepSeekBot/commit/35dcde43749bfe45c3ebd3805bc66ed9e95c2561) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39077357771) | 3 分片     |
| [#2136](https://github.com/BotHarness/DeepSeekBot/pull/2136) | [c088e6aa](https://github.com/BotHarness/DeepSeekBot/commit/c088e6aae31476ea5516e6091dfd519840804258) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39078961466) | 3 分片     |
| [#2139](https://github.com/BotHarness/DeepSeekBot/pull/2139) | [061b3656](https://github.com/BotHarness/DeepSeekBot/commit/061b36566b5524bd3b2f8366946f9b14baf10b7b) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39077925684) | 3 分片     |
| [#2140](https://github.com/BotHarness/DeepSeekBot/pull/2140) | [6b743a7f](https://github.com/BotHarness/DeepSeekBot/commit/6b743a7f01bb0d56b350db86be9c54220e7ae49d) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39080222031) | 3 分片     |
| [#2141](https://github.com/BotHarness/DeepSeekBot/pull/2141) | [d586c1b1](https://github.com/BotHarness/DeepSeekBot/commit/d586c1b1e91d262ef0d8883f40fef7f06b79d717) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39078896747) | 3 分片     |
| [#2142](https://github.com/BotHarness/DeepSeekBot/pull/2142) | [c6e81311](https://github.com/BotHarness/DeepSeekBot/commit/c6e813114df7bf6470f50ab9ba38a7b1751b2d72) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39081130009) | 3 分片     |
| [#2143](https://github.com/BotHarness/DeepSeekBot/pull/2143) | [f24527f1](https://github.com/BotHarness/DeepSeekBot/commit/f24527f167c1dd350da1e1701011bf987a25e505) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39079651601) | 3 分片     |
| [#2144](https://github.com/BotHarness/DeepSeekBot/pull/2144) | [3f994eb1](https://github.com/BotHarness/DeepSeekBot/commit/3f994eb1c1ad5a730f6212d8f3447a934f01f2db) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39079099037) | 受影响测试 |
| [#2147](https://github.com/BotHarness/DeepSeekBot/pull/2147) | [9d4750d1](https://github.com/BotHarness/DeepSeekBot/commit/9d4750d1dc37f9c148ddee0fad987aab3a5afea6) | [success](https://github.com/BotHarness/DeepSeekBot/actions/runs/39081072625) | 3 分片     |

已合并基础：[#2085](https://github.com/BotHarness/DeepSeekBot/pull/2085) · [#2102](https://github.com/BotHarness/DeepSeekBot/pull/2102) · [#2105](https://github.com/BotHarness/DeepSeekBot/pull/2105) · [#2108](https://github.com/BotHarness/DeepSeekBot/pull/2108) · [#2113](https://github.com/BotHarness/DeepSeekBot/pull/2113) · [#2114](https://github.com/BotHarness/DeepSeekBot/pull/2114) · [#2116](https://github.com/BotHarness/DeepSeekBot/pull/2116) · [#2117](https://github.com/BotHarness/DeepSeekBot/pull/2117). 它们不等同于尚未合并的父任务整体完成。

审阅源码与资产提交分开绑定。运行源码为205a；v7审阅源码已固定为54c09227。不可变资产提交由最终父任务评论绑定。索引不引用它自身尚未产生的提交。

运行版本与截图提交可以不同。布局/快捷键运行源码为 6eea6b76；后续提交保存证据。Memory 只读与编辑保留旧运行版本，新继承源码仍需整栈验证。完整版本与依据见私有交付矩阵。

本索引只引用公开 PR 与不可变截图。私有路径、身份、凭据和原始日志不进入未来公开版本。

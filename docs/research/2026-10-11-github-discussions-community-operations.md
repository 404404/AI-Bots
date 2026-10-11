# GitHub Discussions 社区运营调研

日期：2026-10-11。目标：为 BotHarness / DeepSeekBot 建立从交流、反馈到 Issue、PR 和长期维护的参与路径。

状态：以下保留发布前的调研基线与建议；本次落地由 [#1396](https://github.com/BotHarness/DeepSeekBot/issues/1396) 跟踪，已发布[欢迎帖](https://github.com/BotHarness/DeepSeekBot/discussions/1397)和[贡献帖](https://github.com/BotHarness/DeepSeekBot/discussions/1398)，贡献指南及模板通过关联 PR 评审。官方能力、案例观察与本项目建议分开记录，不声称某种运营方法已带来增长。

## 结论

把 Discussions 当作贡献入口，而不是另一个聊天群：用轻量欢迎帖降低第一次参与成本，用 Q&A 留下可检索答案，用 Ideas 澄清问题，再把已明确的工作链接到 Issue 和 PR。GitHub 官方明确建议用 Discussions 探索想法、收集反馈，在工作可界定后进入 Issue。[S1]

## 平台能力与官方实践

| 已核实事实                                                                                                          | 来源 | 对项目的建议                                                |
| ------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| Discussions 适合探索、反馈和非代码协作；Issue 适合明确的 bug 和计划改进，PR 讨论实际变更                            | S1   | 不要求所有 bug 先发 Discussion；明确 bug 可直接开 Issue     |
| Announcement 格式仅 maintain/admin 可开新帖，其他成员可评论                                                         | S2   | 欢迎和正式更新放 Announcements；成员分享放独立开放分类      |
| Q&A 分类可接受答案；作者及 triage 或以上权限可标记答案                                                              | S3   | 安装与使用帮助选 Q&A 格式，不只是名字叫 Q&A                 |
| 支持仓库级置顶和分类内置顶，讨论可关闭或调整分类                                                                    | S4   | 全局置顶导航；分类内置顶简短发帖说明                        |
| 讨论表单位于 `.github/DISCUSSION_TEMPLATE/`，文件名匹配 category slug；Polls 不支持表单                             | S5   | 仅 Q&A 和 Ideas 使用轻量表单，不给介绍帖加复杂必填项        |
| GitHub 会在 Issue/PR 和其他贡献入口展示 `CONTRIBUTING.md`                                                           | S6   | 新增面向人的指南，不把 AGENTS.md 当作新人唯一入口           |
| Issue chooser 的 `contact_links` 可引导到其他交流入口                                                               | S7   | 提供“使用求助 → Q&A”“想法交流 → Ideas”，保留直接报 bug 路径 |
| Insights 提供活动、浏览、新参与者、每日独立参与者统计；参与包含 reaction/upvote 等行为                              | S8   | 不把参与者总数当成代码贡献者数；贡献转化另行追踪            |
| Open Source Guides 建议降低用户→贡献者→维护者各阶段摩擦，回应新人，提供 good first issues，认可非代码贡献和给予署名 | S9   | 给出明确下一步和小任务，而不只写“欢迎贡献”                  |

## 成熟项目案例

| 项目     | 一手资料中的做法                                                                                                                       | 可借鉴点                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Next.js  | 分诊规则将 feature requests 放 Discussions，将用户项目的问题转为 Help；需要缺陷复现，另定义 `good first issue` 作为新人起点            | 把分流落实到入口和维护者回应，不只放一份规范。[S10]                         |
| Supabase | 欢迎帖邀请介绍自己与正在构建的项目，区分长篇非紧急讨论和实时 Discord 交流；CONTRIBUTING 推荐新手任务、修复关联 Issue，新功能先讨论设计 | 欢迎帖邀请分享实际场景；贡献指南提供具体出口，而不是只说欢迎 PR。[S11][S12] |

这些观察不证明贡献转化率改善。Next.js 的大规模自动关闭/锁定规则不建议直接复制到冷启动社区；Supabase 的组织级分类规模也不是本项目必须照搬的模板。案例来源是可变分支或页面的本次读取，不是固定历史政策。

## 本地入口观察

本次检查当前工作树，而非 GitHub 线上设置：

- `README.md` 的“贡献指南”指向 `AGENTS.md`；社区段落列 Discord、QQ 和 Issues，未列 Discussions。
- 未找到仓库内专用 CONTRIBUTING、Code of Conduct、Security 或 Issue/Discussion 表单文件；未核验组织继承的默认社区文件。
- `docs/agents/triage-labels.md` 的 `ready-for-agent`、`ready-for-human` 表示执行准备状态，不表示适合新手。
- `docs/agents/agent-work-trace.md` 已规定 coding-agent 的 claim、Issue 与 PR trace；外部贡献指南应链接进阶规范，而非把全部操作细节塞进欢迎帖。

## 建议的最小分类

以下是项目建议，不是 GitHub 强制或经实验验证的最佳分类数量。

| 分类                     | 格式                | 用途                                           |
| ------------------------ | ------------------- | ---------------------------------------------- |
| Announcements / 公告     | Announcement        | 欢迎、版本更新、社区动态                       |
| Q&A / 使用求助           | Question and Answer | 安装、配置、使用疑问与可检索解答               |
| Ideas / 想法建议         | Open-ended          | 先说明场景、问题、当前替代方案，再讨论解决办法 |
| Show and tell / 作品分享 | Open-ended          | Bot、工作流、集成案例、教程                    |
| Contributing / 参与贡献  | Open-ended          | 新人找任务、结对复现、测试招募和维护认领       |

中文和英文可在同一分类使用，不默认复制两套分类。暂不以高赞投票承诺 roadmap 或维护优先级。

## 三个置顶导航主题

1. **欢迎来到 DeepSeekBot：分享你的 Bot，一起把它变得更好。** 用一句话介绍项目，说明各入口，列非代码贡献，最后只问一个低门槛问题：“你想让 Bot 帮你做什么，现在最卡在哪一步？”
2. **第一次贡献：从一个小改进开始。** 链接 CONTRIBUTING、小任务清单、开发指南。给每项任务明确验收标准、相关文件、验证方式和愿意帮助的人。
3. **本期一起解决的 3 个问题。** 只列维护者确认可做且未被认领的工作，链接真实 Issue；结束后回帖说明结果和参与者。

## CONTRIBUTING 的信息架构建议

按新人决策顺序组织，而非维护者内部流程顺序：

1. 不写代码也可贡献：复现、测试、文档、翻译、回答问题和分享案例。
2. 该去哪里：求助、想法、明确 bug、实施变更与敏感安全问题分别走哪个入口。
3. 第一次贡献：选小任务，查看评论/已有 PR，留言确认范围，避免重复工作。
4. 最小开发环路：链接 README 与隔离 Profile 指南，说明密钥留在本机。
5. Issue 最小信息：版本、环境、复现步骤、预期/实际、脱敏证据；不强迫普通用户先定位源码。
6. PR 最小信息：单一范围、关联 Issue、变更理由、已执行与未执行的验证、UI before/after。
7. AI 辅助贡献：欢迎使用，但提交者负责理解、复现与验证；区分自动测试、实际运行和 Human QA。
8. 维护边界：评审和合并由谁负责，如何表达不同意见，安全和行为投诉的私下渠道。

敏感问题的私下渠道需先由维护者确定；不在草稿中伪造邮箱或声称 private vulnerability reporting 已启用。

## 冷启动与持续运营建议

- 发布前准备 3–5 个真实种子帖：维护者实际案例、一个希望得到具体反馈的问题、一个小任务招募。不要伪造用户或互动。
- 首月每周安排固定 triage：回应新人、补充下一步、标记有效答案、汇总能进入 Issue 的工作，并互相链接。
- 初期可把 2–3 个工作日首次回应设为内部试行目标；不是 GitHub 标准，也不是已经承诺的服务 SLA。
- 解答被验证后邀请答题者补一段文档；复现清楚后邀请报告者写回归测试；连续参与后邀请协助 triage。先确认意愿，不把额外工作强加给新人。
- 从 Discord/QQ 汇总有用结论到公开 Discussion 时须征得必要同意并脱敏；聊天内容不自动公开。
- 每月公开感谢具体贡献，包括测试、文档、回答和 review；维护权限另行按职责与最小权限审批，不按发帖量自动授予。
- 不因沉默自动关闭所有求助；关闭重复帖时链接已有答案，暂不采纳的想法说明原因和可重启条件。

## 30 天验证计划

第一周：确认值班维护者，补人类贡献指南，配置最小分类、入口和欢迎帖。第二周：发布真实案例与小任务，主动接住每个新参与者。第三周：推动一个有明确范围的 Discussion→Issue→PR 路径。第四周：复盘投入和结果，调整分类与模板。

除了 Insights，还手动记录：首次回应中位时长、超过 7 天无人回应的求助、得到验证答案的求助数、明确链接的 Discussion→Issue→PR 数、首次和再次贡献人数、维护者每周投入。这里的指标是建议，需要去重与人工判断；GitHub 不自动提供完整归因漏斗。[S8]

## 证据与限制

官方资料证明平台功能与官方建议；社区案例只能证明项目采用了某种做法，不能证明它直接提高了贡献转化率。调研本身未修改 GitHub 设置或扩大权限；后续实施与验证以 #1396 和关联 PR 为准。仓库当前规范名称为 `BotHarness/DeepSeekBot`，旧 `BotHarness/BotHarness` 地址会重定向；新社区入口使用当前名称。

## Sources

- S1: [GitHub — Best practices for community conversations](https://docs.github.com/en/discussions/guides/best-practices-for-community-conversations-on-github)
- S2: [GitHub — Managing categories](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions)
- S3: [GitHub — Participating in a discussion](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/participating-in-a-discussion)
- S4: [GitHub — Managing discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-discussions)
- S5: [GitHub — Creating discussion category forms](https://docs.github.com/en/discussions/managing-discussions-for-your-community/creating-discussion-category-forms)
- S6: [GitHub — Setting contributor guidelines](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
- S7: [GitHub — Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)
- S8: [GitHub — Discussions insights](https://docs.github.com/en/discussions/managing-discussions-for-your-community/viewing-insights-for-your-discussions)
- S9: [Open Source Guides — Building welcoming communities](https://opensource.guide/building-community/)
- S10: [Next.js — Repository triaging](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)
- S11: [Supabase — Welcome to the community](https://github.com/orgs/supabase/discussions/203)
- S12: [Supabase — CONTRIBUTING](https://raw.githubusercontent.com/supabase/supabase/master/CONTRIBUTING.md)

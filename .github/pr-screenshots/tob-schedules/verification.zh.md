# #2093 分阶段验证

产品版本：`cc4f14d6db734830cba46dc8a5df2da5c014f5ba`；基线：`a3e2c4e64d131191e686e33cb207d3db9b3a0937`。

| 阶段          | 证据与结果                                                                                                                            | 边界                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 源码          | 最终产品代码的 3 个文件、48 个针对性测试通过，单 worker；根类型检查和构建通过。                                                       | 共享资源压力下中止了本地全套测试，不能标为通过。                                    |
| CLI 传输      | 受限 CLI → broker 回归覆盖创建、重放和暂停；独立 Human CLI 在真实 Host 验证日历预览、创建、修改、启停、历史及准确测试任务的确认删除。 | Human CLI 单独通过不等于 Tob 模型行为通过。                                         |
| 自然 Tob 请求 | Home 的 Human 请求触发审核后的创建、改名和暂停，经 native Shell CLI 执行；保留新调用 ID、完成轮次、已处理 Human delivery 和真实回复。 | 捕获早于最终一次性任务过期重放校验修正；新成功流程没有调用旧的本 Bot 定时任务工具。 |
| 实际调度      | 真实 planned occurrence 已处理，关联规范 Source Event 与 Session；同 Session 的成功 `channel_send` 返回准确的合成私聊消息 ID。        | 预览或下次时间本身不算执行证据。                                                    |
| Web 展示      | 既有定时任务 UI 展示下次时间、改名后的历史和暂停状态。                                                                                | 图片是候选版本的交互状态，不是基线与新版的 UI 改版对照。                            |
| 最终重启      | 重建后的已提交版本重启同一隔离 Profile；任务身份、名称、停用状态和真实触发记录保留并展示。                                            | 最后的小范围校验修正后没有重跑完整模型流程。                                        |
| 原生／Human   | 等待父任务独占 macOS 验证及 Human QA。                                                                                                | Web 不能代替原生证据。                                                              |
| CI／发布      | CI 待运行；未合并、发布或部署。                                                                                                       | 本地源码／构建与远端 CI、发布分别记录。                                             |

首个失败保留在私有记录：共享 AX Go 返回 `429 GoUsageLimitError`，之后仅为本隔离 Profile 通过既有 owner 选择可用的官方 DeepSeek 路由。首次官方路由流程额外读取了 Tob 自身的定时任务；明确的 Tob 指引修正后，新成功流程只走受限管理 CLI。证据脚本的 author 字段和面板可见性修正与产品行为分别记录，旧驱动已停止。

Generation 100 虽仅新增一张表，仍推进共享 operational database 的代次；旧版本会拒绝新代次。已升级 Profile 不能仅靠 Git revert 降级，恢复需兼容的新版本或升级前备份，恢复前先保全后续状态；不得删除回执或降低代次标记强行降级。

原生续跑诊断：第一次复制 Profile 的尝试，在模型步骤和工具调用前即 `blocked`；其 Session cwd 仍指向原 Web home，而 Registry 按复制后的 Desktop home 计算路径。该次仍为失败，改为在最终绝对 home 新建 Profile，不修旧历史。新的第二次原生尝试已完成审核后的创建与改名；离线读取停机 Profile 的规范任务名称与已处理 Human Source Event，确认改名确已发生。验证器因 Shell 参数仅展示前 200 字符、隐藏了 update 命令而误报。修正版按审核命令及准确、新鲜的 `parentShellCallId` 匹配，保留完成轮次／已处理 delivery／真实回复／规范状态检查，提供只读 `change-read` 续跑。离线重放该截断调用通过新匹配，并拒绝错误和过期调用 ID。此诊断不代表后续原生触发、暂停、独立 CLI、重启验收已通过。


原生续跑后的重启发现真实启动缺陷：前两次 planned firing 确实完成并发送合成标记，但后一个错过的 occurrence 在 Desktop 启动时、native credentials Service 尚未供给前被 admission。规范 Source Event 留在 retryable，未产生 Session、observation 或副作用；不是关机中断了运行中的模型。原驱动只要求历史中至少一条 handled，因此其 PASS 不足以证明启动补跑验收。[失败画面](native-startup-failure-before-fix.png) 与[脱敏规范关联](native-startup-failure.json) 已保留。候选修复让 core recovery／catch-up 在真实 credentials Service 依赖就绪后启动；此记录时源码回归与新的原生启动验证仍待执行。没有删除或改写失败历史。


启动修复源码：`fb6cf4ff011594bcc80bdaa28e4b03136306dc94`。延后真实原生 Credential Provider 初始化的回归，在旧声明下复现竞态（2 项失败）；增加依赖后两项通过：补跑只有一个 handled Source Event，重复 tick 不新增；Provider 无 key 时 core／bridge 可用而模型仍安全拒绝。根 TypeScript 与一次构建通过。源码证明不能代替待执行的原生启动复验，原有 48 项管理回归仍对应此前产品版本。


最终恢复源码：`5ae3ed1f8dd966a64756bfb93dede338ad668cf1`。旧 Runtime 在持久重启回归中未唤醒安全 pending／retryable 定时项；修复后 3 个文件 30 项检查通过，含两项凭据生命周期、一项混合状态／再次重启恢复以及既有 Schedule owner 测试，根 TypeScript 与一次构建通过。启动与 harvest 收集重复同一条件，不让安全项夹带不确定、已有副作用、悬空、已解决、未来 snooze 或已暂停 Bot 的任务。只有真正 handled 后才清除该定时 Admission 的旧规范错误；捕获的首次失败证据保留。禁用只停止未来 occurrence，不撤销已 admitted 工作。此 head 的原生 startup-arm／prove 仍待执行。

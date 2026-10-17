# #2093 验证阶段

当前产品源码：`5ae3ed1f8dd966a64756bfb93dede338ad668cf1`；原管理流程源码：`cc4f14d6db734830cba46dc8a5df2da5c014f5ba`；堆叠基线：`a3e2c4e64d131191e686e33cb207d3db9b3a0937`（#2119）。

| 阶段                         | 结果                                                                                                                          | 准确边界                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 原管理源码                   | 48 项针对性检查、当时根类型与构建通过                                                                                         | 对应旧产品；本地全套因共享资源中止，不能标通过                                                                 |
| 当前启动／恢复源码           | 旧代码复现失败；3 文件 30 项针对性检查、根 TypeScript、一次构建通过                                                           | 含 3 项新增生命周期／恢复回归和既有 Schedule owner 检查，没有重跑全套                                          |
| 自然 Web 管理                | Tob 审核创建、改名、暂停；真实 planned firing 与合成私聊回复；独立 Human CLI 预览／创建／修改／启停／历史／删除               | 自然模型捕获早于最终一次性任务过期重放修正；重建后原版本重启读回通过                                           |
| 原生原管理流程               | 最终绝对 home 的新 Profile 完成自然审核创建／修改、只读续验、实际触发、暂停、direct CLI 与重启读回                            | 产品 cc4f14d6；最初复制 Session cwd 失败及验证器修正均保留                                                     |
| 当前原生旧事件恢复           | 原 SourceEvent `0a0fe08b-9cdd-453a-ab4d-276f9d862765` 经既有启动 harvest 正常 handled                                         | 保留同 SourceEvent／firing，没有额外 Human DM、SQL 或 Session 修复                                             |
| 当前原生错过时间后的启动补跑 | 新 firing `2183edff-9aff-4a0f-b645-16c8adc26658`；应运行 22:08:10.712Z，重启后 22:08:31.614Z admission，22:08:36.672Z handled | Session 第 4 轮真正完成、channel_send 成功、准确新消息 `0c9d2fe8-c715-4570-ab13-807d925fafad`；原 3 条历史保留 |
| 当前原生最终状态             | 同任务已处理并暂停；候选已停止；父任务恢复主 Desktop                                                                          | 截图保留历史红失败卡；卡片下两条回复按顺序分别是旧事件恢复、新启动补跑                                         |
| Human QA／CI／发布           | Human QA 待判断；最终 push head 请求 full CI；PR 未合并                                                                       | AX 运行不代替 Human 判断、远端 CI、合并或部署                                                                  |

[脱敏规范关联与图片信息](native-verification.json)。[原生改名审核](native-reviewed-edit.png) 是原管理交互状态，不是 UI 改版。[当前原生状态](native-startup-recovered-paused.png) 特意保留历史红卡，后续恢复与新触发成功不改写最初失败。

原启动缺陷保留[截图](native-startup-failure-before-fix.png)和[规范快照](native-startup-failure.json)：凭据 Service 尚未供给，Admission 为 retryable，未观察、无 Session、无副作用。之前两次成功不能证明这条路径。修复声明真实 Service 依赖，并让既有 harvest 只恢复规范 owner 仍存在、未观察且无副作用的 pending／retryable 定时项；收集时重复同一条件，拒绝不确定、悬空、已解决、未来 snooze 或已暂停 Bot 的工作。只有真正 handled 后才清除旧规范错误。禁用停止未来 occurrence，不撤销已 admitted 工作。

环境／脚本失败单独保留：最初 AX Go 配额 429；复制后 Session cwd 在模型前 blocked；Shell 参数截断隐藏已完成修改，改用审核后的准确新 call ID 关联；第一次 startup-arm 错把布尔开关写成带值参数，已修为裸开关。那次旧事件已恢复，但任务没有启用；后续 arm／prove 独立通过。原始启动 manifest 与凭据仅保留私有副本。

Generation 100 即使只新增回执表，也推进共享 operational database 代次；旧版本拒绝新代次。不能仅 Git revert 降级，应使用兼容的新版本或升级前备份，并保全后续状态；不得删回执或降低代次标记。

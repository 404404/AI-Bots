# GK50 独立 Bot 迁移范围评估

独立运行和数据归属决定已记录于 [ADR-0243](adr/0243-fork-bot-product-owns-an-independent-runtime.md)。当前候选、固定身份及剩余门禁见 [GK50 独立运行说明](standalone-bot-gk50.md)；评估不替代验收记录。

评估日期：2026-10-29；源码基线 `650e5fce39d7c2548aded93f402f5c0699ccb49f`。这是用户 fork 的**新独立产品方向**，不是当前 DSH 产品已经完成迁移的声明。仅 GK50、网页优先；不向 BotHarness 上游提交、推送或同步。原部署 `deepseekbot-gui`、20443 入口、DSH Home 和所有未提交部署调整保留。

## 代码依据与处理清单

| 范围                              | 结论                             | 代码依据与首片处理                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot 身份                          | 解耦后复用规则                   | `packages/core/src/bots/persona-bot.ts:12` 的身份记录是应用定义；但它导入外观、Standing Limits 和模型计划。`registry.ts:1` 又引入 Tob、导入/恢复、Memory owner 和 OperationalDatabaseOwner。首片保持稳定 ID、名称和身份提示，复用 `slug.ts` 的校验规则，不载入整个 Registry。                                                                           |
| SQLite                            | 复用机制，重写产品 schema/owner  | `database/owner.ts:1` 使用 Node SQLite，非 DSH 数据库；但 `mountOperationalDatabase` 在 :232 接受 `dshHome` 并挂载原 schema、writer lease 和迁移。新产品独立数据库、独占进程锁、事务、schema 版本与中断恢复；不连接旧 `botharness.db`，不假装原 schema 可直接独立运行。                                                                                 |
| 文件记忆                          | 提取小模块，逐步解耦             | `memory/jail.ts`、`fs/atomic-write.ts` 只使用 Node。`memory/store.ts:1` 的路径/原子写入/Git 思路可复用；完整链含 YAML、Git、Standing Prompt；`memory/service.ts:3` 还依赖 Registry、Session Ownership、Acceptance。首片提取路径约束和原子写入，限定人工明确保存的 Markdown，按 Bot 隔离、字节上限、revision 冲突检查；Git 历史、导入、分支与恢复后移。  |
| Messaging / Channel               | 解耦；首片重写一对一对话         | `messaging/conversations.ts` 使用 SQLite，`provider.ts` 是应用契约；`dsh-im.ts` 是 DSH/IM provider adapter。现有 Channel/Admission/Outbox 与群权限、Inbox 等互相引用。首片新建受认证的一对一 Conversation owner，不导入 IM bridge，不迁移旧消息。                                                                                                       |
| BotAgentAdapter                   | 复用 seam 的思想，不直接复用接口 | `runtime/bot-runtime.ts:637` 包含 Orchestrator、Assignment、直接工具、steer/stop 等；runtime 本身有八千余行并连接数十个应用模块。不能只给接口换名。首片执行入口只承担提交、状态、取消、恢复，Web 与 CLI 共用同一业务模块。                                                                                                                              |
| Agent / Session / 模型 / 凭据     | 重写装配，复用独立 SDK           | `runtime/dsh-bot-agent-adapter.ts:1` 使用 DSH AgentHandle、SessionId、LLM、Tools、Approval、Sandbox；`plugin.ts:1036` 从 Cordis Context 装配，:1097/:1138 等使用 `ctx.llm`、`ctx.agents`。新后台拥有会话事实、配置和私密凭据；按用户后续确认优先复用独立 pi-ai SDK 的 Codex OAuth/模型协议，替代 DSH 装配，不接旧 Host。首片不实现通用 Agent 工具循环。 |
| Web 装配                          | 重写独立页面                     | `packages/client/src/client/index.ts:20–34` 引入 DSH store、Cordis、UI Slots、Session/Workspace remote；:204 `apply(ctx)` 依赖 shell 注册和 Host bridge。不能仅隐藏 shell。新产品有自己的 HTML 入口、认证、静态资源和版本化 HTTP 接口。                                                                                                                 |
| 启动与构建                        | 重写独立产物                     | `packages/deepseekbot/src/deepseekbot.mjs:1` 转入 Core CLI；根 `tsdown.config.ts:210` 构建 Core 且显式 external DSH executor 包；CLI bundle :115 还可把 `@deepseek-ai/*` 打入产物。新产品置于 `standalone/`，独立 manifest、lock、构建上下文、容器与 CI，不使用根 workspace 安装或旧 dist。                                                             |
| 工具审批/Browser/Computer         | 延后，必须替代后再迁移           | 原工具与安全生命周期由 DSH 提供，首片无 shell、文件系统工具、网页浏览或电脑控制。后续需独立工具目录、授权 owner、调用审计、取消和沙箱验证；保留迁移清单，不声称删除这些能力。                                                                                                                                                                           |
| 群聊/IM/多 Agent/调度/附件/客户端 | 延后                             | 原实现保留用于评估；独立产品首片只完成网页一对一对话。各能力按完整用户路径迁移，先由用户体验首片，再扩展。                                                                                                                                                                                                                                              |

基线扫描：Core 有 40 个 TS 文件直接引用 `@deepseek-ai/dsh*` 或 Cordis，Client 有 178 个 TS/TSX 文件；这是直接引用清点，不是完整传递依赖证明。当前 package.json 的 devDependencies/peerDependencies 和构建 external 同样构成运行绑定。独立产物必须另外检查锁文件、所有运行 import、启动进程和实际请求，不能从这些计数推出“已剥离”。

## 新产品的数据归属（首片方案）

- `standalone/` 是 fork 自有代码与产物入口；MIT 许可证和 BotHarness 来源声明随镜像保留。旧 DSH 产品和文档仍描述旧产品，不把新设计混写成旧实现事实。
- 独立 `BOT_DATA_DIR` 下的 SQLite 是新 Bot、Conversation、Message、Run、幂等回执和诊断的唯一业务权威。所有 ID 由后台生成；浏览器只生成可重复使用的提交幂等键。
- 每个 Bot 的 `memory/*.md` 是人工明确保存的文件记忆权威。路径严格限于所属 Bot 的受管目录，拒绝穿越、`.git`、符号链接和超限内容；请求中带 revision 防止覆盖。模型只接收有界已保存快照，不自动把对话变成记忆。
- 模型凭据通过密码输入或 CLI stdin/file 进入后台，使用独立本机密钥加密存储，目录 0700、文件 0600；响应仅返回 configured 布尔值。凭据不进入 prompt、日志、浏览器存储、版本库或镜像。后台管理访问码与模型凭据分开。
- 不读写旧 DSH Home、OAuth、Session 或数据库。旧数据导入以后另做只读导出/校验/显式导入方案。首次验证使用新目录和 22443（预检空闲），保留 20443 作对照与回退。

## 第一条端到端切片

网页登录 → 创建有稳定 ID 的 Bot → 设置身份、模型服务/模型及私密凭据、显式代理 → 创建 Conversation → 幂等发送 → 后台异步模型执行和可取消状态 → 真实回复写入 SQLite → 重启恢复历史、活动执行标记为 interrupted 且不自动重发 → 人工保存一条 Markdown 记忆 → 新对话中真实模型使用该记忆。

用户补充确认首选 Codex Auth。旧 `dsh-codex-oauth@3f4fdec…` 的 `src/service.ts` 仅调用 DSH authorization/credentials/settings；其底层实际是独立 `@earendil-works/pi-ai@1.3.0`。新产品直接复用该 SDK 的 Codex provider、OAuth 和 SSE 实现，拥有自己的加密 grant、登录状态、刷新串行化与取消，不加载旧插件或 DSH。OAuth 在独立 Worker 内配置专属 fetch（避免修改后台全局 fetch），模型请求强制 SSE 并通过 SDK fetch 入口注入 dispatcher；每次请求显式选择 Undici Agent/ProxyAgent。浏览器登录的私密回调输入与设备码均只在认证页面显示；access/refresh token 不回传。兼容 Chat Completions 接入作为已有协议入口保留，不代替 Codex 验收。

直连/代理状态、上游状态码、耗时与有界错误码可见；不记录异常原文、密钥、完整请求或回复。拒绝 URL 内凭据；容器中的 proxy localhost 明确报错并指向 host-gateway 配置。代理只改变受支持的请求路由，不承诺消除提供方地区限制；现有 Codex 403 保留独立故障记录。[Undici 8.12.2 的 ProxyAgent 文档](https://github.com/nodejs/undici/blob/v8.12.2/docs/docs/api/ProxyAgent.md)明确支持 fetch dispatcher 和 CONNECT；实现仍须由受控代理与真实模型分别验证。

应用使用单 owner 认证、HttpOnly SameSite cookie、Origin/CSRF 检查和 68 网段来源限制；健康检查不暴露业务数据。LAN HTTP 从入口加载真实页面，不依赖 `crypto.randomUUID` 安全上下文；幂等键用 `getRandomValues`，缺失时禁用发送并显示可恢复错误。剪贴板缺失/拒绝显示可手工选择的文本。

## 状态和失败约定

- 消息和 queued Run 在同一 SQLite 事务提交，`(conversationId,idempotencyKey)` 唯一；同键同内容读回回执，同键不同内容拒绝；断线不取消已接收任务，不自动重复创建任务。
- 每个 Conversation 至多一个活动 Run。执行状态 queued/running/completed/failed/cancelled/interrupted 持久化；取消先提交终态再 abort，完成与取消用条件提交防竞态。关闭或崩溃后未完成任务恢复为 interrupted，用户可明确发起新操作，禁止自动重试可能已计费的请求。
- 模型上下文仅为所属 Bot 身份、当前 Conversation 的有界历史和明确保存的有界文件记忆。Bot 隔离在业务查询和文件操作都执行，不能依赖 UI 隐藏。
- API/CLI 返回一个 JSON 文档、稳定 ID/时间戳/分页游标及明确错误码。Web 与 CLI 通过同一受认证 dispatcher 调用同一业务模块，CLI 不直接改数据库。

## 验收与风险

主代理先在 `docs/acceptance/standalone-bot-test-cases-2026-10-29.md` 写用例，再交 GPT 6.1 Terra 执行。清洁独立构建、依赖/网络检查、真实 192.168.68.x HTTP 页面、真实模型回复和重启/记忆、幂等/断线/取消/错误、凭据泄漏、隔离、固定 digest/回退均要分别取证。模拟模型和测试代理只证明协议与故障处理；真实服务没有成功回复则模型相关验收阻塞，不能宣布首片完成。

风险：原产品功能面很大，首片不等于全部迁移；Node SQLite 的单进程 owner 需拒绝多实例；文件和 SQL 不能假装跨存储原子事务；LAN HTTP 无传输加密；可配置 endpoint/代理是 owner 级网络能力；模型协议兼容性和费用须有限真实验证；取消不保证提供方停止计费；历史上下文窗口有界。第一片不上线多用户、不做后台自动重试、不引入第二个旧数据权威。

历史评估写入时，独立产品尚未实现、构建或部署；上述范围划分是当时的迁移设计。原 HTTP 白屏与 Codex 登录失败是两个独立问题，详见 [HTTP 评估](acceptance/gk50-http-compatibility-assessment.md) 和 [阻塞补查](acceptance/gk50-blockers-followup-2026-10-29.md)。

## 2026-10-29 当前实施状态

独立 `standalone/` 已构建并在 22443 运行，真实 Codex 登录、API/LAN 页面回复及人工保存文件记忆使用、更新与重启恢复已取得证据。完整结论以[原验收记录](acceptance/standalone-bot-test-results-2026-10-29.md)顶部和 PX-01–12 为准；部分隔离、取消和输入边界仍待补测。历史“待登录”或“尚未实现独立产品”不能作为当前状态。

本轮按[扩展计划](standalone-bot-expansion-plan.md)增量实现主身份、真实委派、自定义头像和产品浏览器；[新验收记录](acceptance/standalone-bot-expansion-test-results.md)独立于旧记录。ADR-0244–0246 描述本 fork 新设计，尚未验收的能力不算当前产品事实。不迁移群聊、IM、定时任务、Computer 或客户端，也不操作旧 DSH 数据。

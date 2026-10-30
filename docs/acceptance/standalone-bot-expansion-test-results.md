# 独立 Bot 扩展验收记录

执行者：GPT 6.1 Terra。用例见 [扩展验收用例](standalone-bot-expansion-test-cases.md)。本记录汇总首片独立自动测试和真实 LAN 候选验收；真实模型和后续功能另行验证。

## 当前结论（2026-10-30）

当前候选 `e5444f66` 的 LAN 与本机 EasyTier 地址均通过真实浏览器登录和主身份一致性验证；真正的 EasyTier 远端对端尚未测试。DG03 已通过真实 Codex 创建、修改、委派及主 Bot 汇总，并完成两个不同工作 Bot 的任务；早期 `700e072d` 的两次失败证据保留。390px 抽屉的打开、选择后关闭和输入区可见已复验；新候选故障页面、活动取消及完整跨 Bot 权限矩阵仍待测。头像旧候选的已测上传、替换、删除与重启通过。产品浏览器尚未交付，模拟测试不代表真实浏览器通过；发布门禁未达到。

下文按执行时间保留历史记录；“未实现委派”等第一片措辞仅指当时运行镜像，不替代本段的当前源码结论。模拟、真实 API、真实模型及真实网页分别计证。

## 第一片状态

| 用例 | 状态 | 证据与限制 |
| --- | --- | --- |
| MB-01 | 通过 | 自动单例与锁通过，候选重启保持同一主 ID。 |
| MB-02 | 通过（合成） | 真实基线 v1 源码创建隔离样本，迁移保留数据并处理碰撞。 |
| MB-03 | 部分通过（合成） | 冲突注入回滚、坏引用、未知 schema、旧版拒绝新版及备份读取通过；其他故障点未覆盖。 |
| MB-04 | 通过（已测路径） | LAN 主入口、目录、创建编辑、刷新及候选重启通过；未实现委派。 |
| MB-05 | 部分通过 | 两个同名工作 Bot 可按 ID 区分，HTML 名称按文本显示；输入边界由自动测试覆盖，历史归属矩阵未完整验证。 |
| MB-06 | 部分通过 | 伪造字段、缺省和 Bot 上下文拒绝自动测试通过；更广权限矩阵待测。 |
| MB-07 | 部分通过 | 已提交运行的版本和非秘密快照保持；后续运行及真实模型消费未验证。 |
| MB-08 | 部分通过 | 候选 CLI 主身份/目录与页面 ID 一致；隔离 HTTP/CLI 未认证及非法游标通过，完整写入命令待测。 |
| MB-09 | 部分通过 | CI 成功产物与固定 OCI 身份、独立数据、对照服务快照已核验；进程网络追踪未完整覆盖。 |

## 只读准备（历史）

- 2026-10-29 预检：20443 无 TCP 监听；需在候选启动前重新检查。当前独立产品容器健康，旧 `deepseekbot-gui` 已停止；其他容器未操作。
- 现有 QA 浏览器使用固定镜像、非 root、原 seccomp、专用桥网和短时受限转发。其脚本及访问码挂载现指向 22443 产品，不能直接用于候选；执行前须独立调整至 20443 和候选私有目录，重查网络/端口，并保持真实 LAN HTTP、Origin 和浏览器沙箱。
- 测试数据与证据须使用隔离目录；不复制旧 DSH 授权，不把现有 Bot 的登录状态隐式赋予新主 Bot。首次运行前记录候选身份和对照服务状态。
- 后续委派、头像、产品浏览器及真实模型端到端结果尚未实施或验收。既有独立 Bot 的真实模型验收另见原记录，不等于新主 Bot 已通过。

## 第一片独立自动测试（历史，2026-10-30）

- `npm test` 26/26、`npm run build` 成功；独立 `main-independent.test.mjs` 7/7。脱敏输出保存在 `.local/standalone-bot-expansion/evidence/`，真实模型未调用。
- MB-01：空目录同一主 ID、重复打开及并发 owner 拒绝通过；真实候选重启待测。
- MB-02：由基线 `8b0a6ee4` 的真实 v1 Storage 创建合成数据；同名和保留 slug 不被采用，旧身份、历史、记忆和加密合成凭据保持。重开仅验证可用，迁移后主 ID 重启一致性仍待候选检查。
- MB-03：冲突表触发迁移失败，schema 与列回滚，修复冲突后 owner 可重新打开；未知 schema 和断裂引用拒绝；v1 代码拒绝 v2，隔离备份可由 v1 读取。尚未覆盖所有故障注入点。
- MB-05/06：同名中文 HTML 字符串、名称边界、主名称修改保持 ID、伪造字段及缺省/非 owner 上下文拒绝通过；真实页面纯文本表现及更广的权限矩阵待测。
- MB-07：提交时 revision 和非秘密身份/模型快照保持，修改后 revision 增加；尚未独立验证后续新运行及真实模型消费。
- MB-08：隔离 HTTP 未认证拒绝，CLI 与 HTTP 主 ID 一致，非法游标拒绝；完整 CLI 命令和真实候选待测。
- MB-09：本地独立构建成功；清洁复制、候选固定镜像身份和环境快照待测。
- 20443 专用 QA 浏览器配置已准备，访问码挂载固定到候选私有数据目录，转发仅指向该候选；未启动候选或 QA 资源。执行前重新检查端口、子网和候选身份。

## 真实候选 LAN 验收

- 候选来源：源码 `e841d49c15ef169f8e2e32bbd1e7226f3d2e1d5b`，CI 40942085923 成功产物；manifest `sha256:54b393c84048928f27cb6f33cee43f194347b3aa88ee3a21afe83e312cb9540c`、config `sha256:e6fa8b7b44ed664439af5badc45f4f5b2128e8249216dd36e0f198362d6ad443`。这是未发布 CI 归档候选，不是 GHCR 发布声明。
- 真实 `http://192.168.68.11:20443` 通过主入口与 canonical ID、管理目录、两个同名工作 Bot 的不同 ID、HTML 名称纯文本、身份编辑、刷新及同浏览器候选重启；候选 CLI main.get/main.catalog ID 与页面一致。截图、ARIA、console 类别及结果保存在 `.local/standalone-bot-expansion/evidence/lan/`；截图像素与人工检查非空。pageerror 0，console error 2 仅记录类型，原因未判定。
- 普通 LAN HTTP：secureContext=false、randomUUID undefined、getRandomValues function、clipboard undefined。临时 QA 浏览器/网络和转发已清理，对照服务前后快照一致，候选仍健康；旧 GUI 保持停止。新增候选数据为两个 QA 工作 Bot。
- 本片没有验证模型委派或新主 Bot 的真实模型调用；现有独立 Bot 的真实模型结果保留原记录。
- 清洁复制：仅独立构建上下文复制到空临时目录，`npm ci --ignore-scripts` 与 `npm run build` 成功，审计 89 包无漏洞；输出见 `.local/standalone-bot-expansion/evidence/clean-build.log`。对照服务快照分别见 `services-before.txt` / `services-after.txt`，两者一致。
- 已交实现方的首片审查项：启动失败的原始异常堆栈尚未结构化；目录角色提示和中文标签仍需改善。这些是待修复项，不以本次验收结果掩盖。

## DG / TS 独立测试准备（历史）

先依据冻结后的契约构造隔离样本与受控模型，核对主到工作 Bot 的父子 task、指定 Bot 及授权引用、有限输入和结果来源；同一幂等键并发与重放仅产生一次副作用，同键变内容拒绝。逐项验证跨 Bot 记忆、历史和凭据拒绝，以及未经 owner 授权不能共享连接。模拟取消、超时、迟到结果、循环/深度/并发上限和重启后的 interrupted 状态，不自动重放。随后在独立 LAN 候选通过真实模型完成一条主→工作 Bot→主的完整链，分别保存 CLI、页面和持久 task 的一致证据；模拟不能代替真实模型事实。具体断言及边界以冻结实现与主代理用例为准。

## MB-07 模拟请求补验

独立测试现为 8/8：受控本机 HTTP 模型实际收到两次请求，旧运行使用提交时的旧名称、身份和模型，新会话运行使用更新后的名称、身份和模型；两次 Run 均完成，revision 相差一。该结果证明模拟协议下配置被消费，真实模型角色行为仍未覆盖。未认证 `main.catalog` 拒绝也已覆盖。旧版 `unknown schema` 测试此前写死 schema 2；第二片迁移至 schema 3 后已改为恢复测试开始时的实际版本，当前通过。

首次 LAN 验收只保存了 console 类型，两个 error 的原因仍未判定。后续 UI 复验将只记录失败请求的路径和状态、console 类别，不记录查询参数、正文或请求头；在查明前不将该项视为完全通过。前文自动测试段落中“真实候选待测”为当时记录，当前候选已完成上述 LAN 和 CLI 验证。

后续新增未知命令和分页重复读取测试时，正在并行修改的第二片 `connection-resolver.ts` 使用 strip-only 不支持的 TypeScript 参数属性，导致测试文件加载失败（`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`）；已报告实现方。上面 8/8 是该并行变更前的结果，新增两项断言尚待修复冻结后重测。

## 第二片独立源码测试（未部署）

- 冻结但尚未提交的源码由 Terra 独立执行 `npm test`：46/46 通过；`npm run build` 成功。结果见 `.local/standalone-bot-expansion/evidence/delegation-full.log` 和 `delegation-build.log`。先前 TypeScript strip-only 加载失败已修复，MB07/MB08 补测现在通过。
- DG/TS 模拟覆盖：锁定 SDK 的真实 toolCall 与 typed toolResult 经模拟 transport 进入主→子→主路径；本机模型请求检查执行者记忆与凭据脱敏。连接引用的消费者作用域、模型 epoch、撤销、无凭据复制；同键重放与冲突、取消及迟到结果；子任务取消保持根任务运行、截止时间、关闭中断及 Bot 上下文拒绝通过。连接分页与稳定游标也通过。
- 这些是合成凭据、受控本机 HTTP 或 SDK transport 测试；真实 Codex 主→子→主、网页轨迹、完整故障和跨 Bot 权限矩阵仍未验收。头像内部测试通过不表示 API 或 UI 已交付。
- 本轮未启动或升级容器，未执行授权种子脚本，也未触碰候选数据。候选仍为首片；真实授权和任务执行需另行执行并取证。

## 第二片最新冻结源码补验

- 独立完整测试 48/48 通过，随后新增独立边界测试单独 6/6 通过；独立构建成功。日志分别为 `delegation-final-host.log`、`delegation-boundaries.log` 和 `delegation-final-build.log`，位于本地私有 evidence 目录。
- 借用连接的主 Bot 不能作为新的连接来源，绑定及解绑会递增主配置 revision；请求前拒绝保留原 `BotError` 且 transport 调用为零。独立检查 `tasks.get` 的配置快照、记忆路径/revision manifest、任务诊断 ID，未暴露合成密钥或记忆正文。
- 完整套件的受控 SDK 测试检查超长子结果被截断为可解析 JSON，包含 `truncated=true` 和真实父子 ID；这些仍是模拟结果。真实模型和候选 UI 验收保持待执行，未运行种子或修改候选。

## 第二片真实 LAN 与 CLI 验收（2026-10-30）

- 候选源码 `35a24e2877a99148c249ea2360be0213f34ff4d5`，CI 40949050605，运行 manifest `sha256:6d7fff4898953b99dbb4a30d00243afa86d7718096ee003f4c951f71d0d7b68a`；20443 候选独立数据，未发布。主代理执行隔离 schema2 备份、schema4 升级、旧版拒绝新版及备份恢复；这些不是 Terra 独立执行的结果。授权源是独立产品的只读快照，不是旧 DSH；种子仅新增指定 source 的 OAuth 一行，主/工作 Bot 未复制凭据。首次只读 SQLite errcode 14 已由主代理诊断并改用私有 tmpfs 数据库副本后成功，源保持只读。
- DG-01 真实链通过已测路径：在真实 LAN UI 绑定来源并授权工作 Bot；工作 Bot 唯一保存的合成记忆标记不在主输入中，真实主模型发出 `delegate_to_worker` 工具调用，子任务实际完成并返回标记及 17×23=391，主真实回复包含相同结果。root `bcbc09f0-8746-43d8-a6ef-f1d601d0ddf8`、child `169ab421-e6c0-4913-a300-c3b9d8d98a65`、run `bfc9af8c-88b0-443e-897c-e672d07d4537`、worker `4115ebfb-bab3-4304-aecf-7fc24fcea9ab`、工作配置 revision 1 与记忆 revision 已关联。只读工具元数据确认真实 tool call ID、completed、child ID 和 `untrusted-worker-result`；OAuth 行数为 source 1、main 0、worker 0。子任务公开快照未包含主/未授权 Bot 哨兵。
- UI 终态：首图 `dg-lan.png` 捕获中间状态；未重发模型，重新打开同一对话后 `dg-terminal.png` / `dg-terminal-aria.txt` 确认主与工作任务均已完成，截图经像素及人工检查。`dg-terminal-network.json` 仅含 console 类别、pathname 和状态：未登录 session 401 对应一条资源错误；另一条 favicon 资源错误，监听未捕获其状态，原因仍未完全确认；pageerror 0。
- DG-02 / TS-03 已测部分：真实 CLI 任务 `2fa5b10c-04f8-425e-b497-78d25ec5c215` 同键同输入返回同 ID，改变输入返回 `idempotency-conflict`，任务完成；另一个真实活动任务 `dfcfeb9f-5b4c-42c2-865c-934645782294` 取消后保持 cancelled。没有独立上游请求计数，不能由同 ID 推断精确计费调用次数；取消后仅短时间观察，不能保证提供方停止计费。
- 本轮未执行 DG-03 对话内创建配置工作 Bot、真实故障 UI、完整跨 Bot 执行上下文矩阵或真实模型断线恢复，均保持未覆盖；已有模拟测试不能代替它们。真实授权不输出，不触碰旧 DSH。新增两个 QA Bot、三条验收记忆、一次根对话和两条 CLI 任务留在候选。
- QA 浏览器及网络、22998 转发已清理；对照服务前后快照一致，候选保持健康。证据保存在 `.local/standalone-bot-expansion/evidence/dg-real/`。

## 头像源码独立测试（尚未部署）

- 上一轮独立头像测试 4/4、完整测试 58/58、构建通过；本轮复跑完整测试 58/58 和构建再次通过。日志位于私有 evidence 目录，最新为 `avatar-rerun.log` 与 `avatar-rerun-build.log`。
- 独立测试生成 PNG 并解码实际像素，覆盖认证读取、两 Bot 隔离、并发 revision 冲突、旧 URL 拒绝、CLI 普通文件及符号链接、畸形/超限/压缩膨胀和 2 MiB 边界。支持合同为非隔行、8 位 RGB/RGBA PNG。
- 源码与自动测试核查了头像文件同一描述符的有界读取、UI 异步前捕获 Bot ID/revision、头像相关界面刷新、可折叠任务轨迹状态和 favicon 204。真实浏览器中的切换竞态、各界面刷新、折叠布局、上传与重启尚待新候选验证，不能视为 LAN 通过。
- 本轮未升级候选、未运行 LAN 头像脚本。

## 头像候选真实验收（2026-10-30）

- 候选源码 `f08fd7752293d69e7b0fa870fc880e0f38ba24d3`，CI 40981572807，manifest `sha256:6bc20c379611c4e41d9a54278229903350d4c4e217e481bc02d5580f24665e4d`；主代理验证归档来源与完整 schema4 私有备份，非本地重建。
- AV-01/02 已测路径通过：真实 LAN 上传两个 Bot 的不同 PNG、替换 A 后 B 保持、刷新与候选重启后两者 revision 保持，删除 A 后 B 保持。运行镜像 CLI 上传成功；HTTP 未认证读取拒绝，独立解码 B 的实际像素与输入一致。
- AV-03/04/05 已测路径：运行候选拒绝 SVG/script、错误 CRC、截断及超 2 MiB，原头像保持；2 MiB 边界可上传，普通命令的约 49 KiB 限额仍拒绝大请求。更广格式与压缩膨胀边界由隔离自动测试覆盖，不将所有可能输入视作已验证。AV-06 并发 CAS 与跨 Bot/旧 revision 由隔离自动测试覆盖；真实 LAN 替换删除隔离通过。
- 任务轨迹：1280×900 截图中任务区折叠并保持输入区可见，展开在轮询后仍保持；390px 截图中侧栏占据较大宽度，正文及标题/控件截断，窄屏可用性失败，已交实现方修复。证据 `avatar-lan/trace-desktop.png`、`trace-narrow.png` 与 `avatar.png` 经人工查看。
- 页面网络仅预登录 session 401，pageerror 0；QA 浏览器、网络和短时转发已清理，对照服务快照一致，候选健康。本轮新增三个 QA Bot；头像 A 已删除、B 保留、API QA Bot 有合成头像。未调用真实模型。

## 头像 schema4→5 隔离回退验收

- Terra 独立验证指定私有 schema4 备份 SHA-256 `7f632eff0fdf0de82423add34e6b4c7b328b2b4f1113e68e23f4bcb852912147`；仅将备份解到两个临时私有目录。固定旧镜像 `6d7fff…b68a` 读取 schema4；固定新镜像 `6bc20c…5e4d` 升级副本到 schema5，Bot、对话、运行、消息、文件记忆和加密授权字节的内部指纹一致（6 Bot、1 对话、1 Run、2 消息、1 OAuth、3 记忆文件）。未输出凭据或内部指纹。
- 升级后在测试副本写入一条合成 Bot，旧镜像明确以 `schema-upgrade-required` 拒绝 schema5；另一独立目录恢复同一 schema4 备份后，旧镜像可读且数据与升级前一致，合成写入不存在。镜像回退和数据恢复是两步：恢复旧备份会丢弃升级后新增写入。
- 所有短时容器为 nonroot、只读 rootfs、无网络及端口，仅挂载各自测试数据目录；精确清理了本次容器和临时目录，私有原备份保留。当前候选与生产服务仍健康、旧 GUI 保持停止。未对当前候选数据或生产数据执行迁移实验；avatar 表冲突故障注入未执行。

## Browser module independent unit（未接入产品）

- Terra 在本机已有固定候选镜像 `sha256:6bc20c…5e4d` 的 Node 24.21.0 中独立运行浏览器模块：原套件 25/25、加入独立网络边界后 28/28 通过；`src`、fixture 和 scripts 的 `node --check` 通过。临时测试容器非 root、只读 rootfs、只读模块挂载、network none、资源上限及独立 `/tmp`，执行后自动删除。固定 Node 基础镜像标签本机不存在，拉取未完成已取消；实际测试使用本地固定候选镜像提供的同版本 Node，未构建或启动浏览器 sidecar。依赖使用模块现有本地 `node_modules`，本轮未验证清洁 npm 安装。
- 单元覆盖精确 origin/端口、私网和元数据拒绝、IPv6 规范化与映射、DNS 混合或变化、认证租约、代理重验及取消、Bot/task scope、操作幂等、并发会话上限、迟到结果和服务令牌不传入模拟浏览器环境。独立新增 `standalone/browser/test/independent.test.mjs` 检查 IPv6 等价地址、混合 DNS、私网规则作用域及空/过量 DNS 结果。
- 以上是 fake browser、协议与受控本地代理测试，不证明真实 Chromium 沙箱、网络隔离、防绕过、DNS 重绑定下实际容器出口、cookie/storage 隔离、截图或真实模型工具链；租约到期/高并发及安全秘密全链路仍需真实环境验收。浏览器模块尚未接入应用，BW-01–10 不视为通过。

## DG03 冻结源码独立回归（2026-10-30）

- 当前冻结源码独立 `worker-management-independent.test.mjs` **13/13 通过**，`npm test` **88/88 通过**，`npm run build` 通过。数据均为隔离临时目录及合成凭据；完整测试包含尚未接入产品的 `browser-service.test.mjs` 协议测试，不能作为产品浏览器通过证据。测试文件集：`acceptance`、`avatar`、`avatar-independent`、`avatar-product`、`browser-service`、`codex`、`delegation`、`delegation-independent`、`main-bot`、`main-independent`、`qualify`、`responsive-web`、`worker-management`、`worker-management-independent`（均为 `standalone/test/*.test.mjs`）。
- 模拟测试覆盖默认策略与旧委派、owner/model 回执隔离、策略 revision 与连接 epoch、字段与主身份保护、八次工具调用、同 ID 重放与冲突、两次创建预算、三子任务、十二模型轮次、两个活动工作任务与四个活动根运行容量、取消和重新打开。十二轮使用模拟 `completeTurn`，子任务容量使用模拟执行器；根运行使用受控本地 HTTP 服务。隔离 HTTP/CLI 验证 `worker-policy.get/update`、`workers.create/update` 共用认证 owner，未认证拒绝。
- 修复前独立复现第三次创建拒绝后重放仍产生一个 Bot、管理回执和两类授权，原始脱敏证据 `management-replay-before-fix.log` 保留；修复后创建拒绝及更新拒绝的同调用重放均无新增或修改。正式结果见 `.local/standalone-bot-expansion/evidence/management-frozen-independent.log`、`management-frozen-full.log`、`management-frozen-build.log`。
- **未执行**：此 DG03 源码的新固定候选真实 LAN、真实模型、页面窄屏修复复验和完整跨 Bot 权限矩阵。先前真实委派及头像结论对应其各自旧候选，不能代替本片端到端验收。

### Browser candidate record 兼容回归（2026-10-30）

浏览器子树冻结版本在本地固定候选镜像 `sha256:6bc20c…5e4d` 的 Node 24.21.0 中以非 root、只读文件系统、network none 的短时容器运行：`node --test test/*.test.mjs` **31/31 通过**，`src`、`fixture`、`scripts`、`test` 中的 `.mjs` 语法检查通过。镜像未含 npm，首次尝试 `npm test` 启动失败已保留；随后执行 `package.json` 指定的同一 Node 命令。证据为 `.local/standalone-bot-expansion/evidence/browser-record-unit.log`、`browser-record-node-test.log`、`browser-record-syntax.log`。使用现有模块依赖，未做清洁安装，也未启动 sidecar 或真实 Chromium；此结果仅覆盖模块协议和候选记录解析。

### Schema 5→6 独立副本迁移及恢复（2026-10-30）

使用 SHA-256 `a8e338d5…b875336` 的私密 schema 5 备份，在独立临时副本上以固定旧镜像 `6bc20c…5e4d` 和新镜像 `523f04…5d2f3` 验证：5→6 后 Bot 与主身份、对话和消息、运行与任务、记忆文件、头像表、加密 OAuth、连接及授权记录的指纹保持；新管理策略默认关闭、创建关闭且允许范围为空。旧镜像拒绝 schema 6；另一份原始备份由旧镜像读作 schema 5。升级后合成写入在恢复旧备份时丢弃，故镜像回退和数据恢复是两步，恢复会丢弃备份之后的写入。备份含 9 个 Bot、1 个对话、1 次运行、2 条消息、1 行 OAuth 和 3 个 Bot 文件；未输出凭据。

容器非 root、只读 rootfs、network none、未启动服务或模型，挂载仅为专用副本；临时容器和副本已清理。证据 `.local/standalone-bot-expansion/evidence/schema6-migration-isolated.json` 与 `schema6-migration-run.log`。策略表冲突故障注入未执行，此结果不代表当前候选已升级或真实 LAN 已通过。

### DG03 真实 LAN 首轮与复测（未通过）

候选固定 `700e072d` / manifest `523f044c…325d2f3`。通过网页明确启用管理策略和允许来源连接后，两次真实 Codex 运行均完成一次 `create_worker`，模型随后表示新 Bot 不在可管理或可委派目录，直接计算并结束，没有调用更新或委派工具；canonical 任务均为 completed 且均无子任务。创建回执与本根运行新增目标记录存在，不能把模型自行计算视为委派结果。首次 root `5ca04ee2-1916-48f5-bee4-e2aeba093a56`，复测 root `4befb3a5-77ce-4a9e-8322-2f8b336b60d8`；第二次证据在 `.local/standalone-bot-expansion/evidence/dg03-r2-capture/`，首次证据另存原位置。两个 QA Bot 及测试策略保留以便诊断。模型实际收到的工具列表未捕获；需要结合实现与后续复验确认原因。

本轮按失败停止，没有继续多工作 Bot、窄屏、头像和失败页验收。QA 容器、专用网络和受限转发已清理；控制台仅记录预登录 `/api/v1/session` 401，pageerror 为零。此次曾因自动审批认为直接复制证据可能覆盖历史而拒绝该复制；随后复制到新建独立目录，历史证据未覆盖。

### 浏览器未接线源码独立检查

当前 dirty 浏览器基础镜像声明及模块测试在既有固定 Node 24 容器中 **33/33 通过**；未接线的应用 `browser-service.test.mjs` 使用隔离数据与模拟 worker **16/16 通过**。证据分别为 `.local/standalone-bot-expansion/evidence/browser-dirty-base-independent.log` 和 `browser-service-dirty-independent.log`。静态声明检查不证明新 Trixie 基础镜像可拉取、实际构建、漏洞扫描或真实 Chromium；这些结果不代表产品浏览器验收。

### 浏览器 CI 挂载失败（2026-10-30）

浏览器提交 `f27130ee` 的 CI run `41013347453` 在 unit 阶段失败：`base-image.test.mjs` 读取外层 `.github/workflows/standalone-browser.yml`，而该 CI 步骤只挂载 browser 子树，导致文件不存在。此前独立 33/33 使用整个仓库只读挂载，不能证明该 CI 挂载拓扑可用。此 run 未进入镜像构建、扫描或 sandbox 门禁，没有产生候选产物；修复由实现方处理，修复后仍需重新验证。

浏览器 CI fixture 修复冻结后，Terra 以既有固定 Node 24 候选镜像模拟修复后的挂载：browser 子树 `/work` 和唯一 workflow 文件均只读，非 root、只读 rootfs、network none；**34/34 通过**。单独去除 workflow 文件时，`base-image.test.mjs` 如预期以 ENOENT 和 exit 1 失败。证据 `browser-ci-mount-fixed.log`、`browser-ci-mount-absent.log`。该结果验证本地挂载布局，实际 CI 的构建、扫描及 sandbox 仍待新 run。

### DG03 目录修复的隔离暂存候选（2026-10-30）

从 HEAD `57493d4e` 导出 standalone，再仅应用五个已暂存文件的二进制补丁（SHA-256 `e31e9710de775733b71c743569828cf2ea68816d0c538495945d873e002d2d3f`）；核对 schema 为 6，无 browser-client/service 引用。隔离副本复用现有依赖，`npm test` **78/78**、`npm run build` 通过；独立管理测试原版 13/13，另加入独立动态目录和仅委派权限断言后 **14/14**。新断言验证原有仅委派目标不可更新，当前根运行创建的新目标可更新和委派，修改后名称和 revision 显示更新。日志 `dg03-staged-full.log`、`dg03-staged-build.log`、`dg03-staged-independent-14.log`。测试使用模拟模型及隔离数据，真实 LAN 和模型须待新的固定候选复验；独立断言新增于 `standalone/test/worker-management-independent.test.mjs`，未包含在五文件暂存补丁中。

浏览器 CI run `41013969970` 的测试和构建成功，但漏洞扫描报告 67 项 HIGH/CRITICAL 而失败，未产出 artifact，未部署；先前本地模拟通过不覆盖扫描结果。

### 网络暂存候选独立测试（2026-10-30）

以 HEAD `305510f2` 加七文件 index 补丁（SHA-256 `469c656efa14313f3379c73d28e1ce2102b48849de62078e6ede4ce96418ea25`）构造隔离 schema 6 副本，不含开发中的 browser 模块。复用本地依赖后完整测试 **85/85**、独立网络测试 **3/3**、构建通过；额外验证未认证头像 URL 和预留 screenshot API 路径均返回 401。当前候选尚无 screenshot 路由，该结果只证明通用 API 认证门禁。Compose 配置监听 `0.0.0.0:20443`，三个附加精确 URL 与文档一致。

覆盖 RFC1918、CGNAT、ULA、loopback、IPv4 mapped 与公网边界，URL/Host/Origin、伪造转发头、CSRF、认证及 CLI 同源。HTTP 使用 loopback 连接模拟 Host，不能证明实际 LAN 或 EasyTier 对端来源；真实两接口及远端验证尚待固定候选。证据 `net-staged-full.log`、`net-staged-independent.log`、`net-staged-resource-auth.log`、`net-staged-build.log`。

### Direct browser 冻结源码模拟验收（2026-10-30）

当前 schema 7 源码使用隔离临时数据与模拟 UDS worker：完整测试 **108/108**、browser service/product/task-adapter 定向 **21/21**、构建通过；另独立异步上下文断言 **1/1**，验证 owner 进入 executor 后不继承 owner，executor 可打开自己任务的会话，`runAsUntrusted` 内不继承 owner 或 executor。定向测试覆盖响应 session/task/operation 绑定、open 冲突不修改原任务、取消后的迟到截图不落库。

使用已提交 `e5444f66` 的真实 schema 6 Storage 创建合成 fixture，升级至 7 后主 ID、加密合成凭据和记忆保持；旧源码拒绝 7，独立备份可按 6 读取。冲突表故障使迁移回滚至 6，锁释放后可重新打开并迁移。证据 `direct-browser-full-independent.log`、`direct-browser-focused-independent.log`、`direct-browser-build-independent.log`、`direct-browser-scope-independent.log`、`direct-browser-migration-independent.log`。没有启动真实 browser worker 或使用扫描失败的镜像；这些模拟结果不能计为 BW 真浏览器通过，model browser 工具也尚未实现。

### e544 网络和 DG03 真实候选复验（2026-10-30）

固定 manifest `e6619dcd…caa7907` 的候选中，独立 Chromium 从 QA 桥网直接访问 `192.168.68.11:20443` 和 `10.250.250.1:20443`，两地址均登录、读取相同主 Bot/目录及同一新建 QA Bot；没有代理或 Host 改写。两次预登录 session 状态为 401，pageerror 为零。截图和 ARIA 位于 `net-lan-capture/`。本机虚拟接口直连不证明其他 EasyTier 对端可达。

真实 Codex 第一轮创建、更新及委派同一工作 Bot，子任务和主回复完成，子任务配置 revision 为 2；第二轮创建另一 Bot 并完成两个不同工作 Bot 的任务，主回复包含两个实际计算结果。指定根任务的 canonical 工具 ID、状态和回执见 `dg03-e544-capture/tool-metadata.json`，任务关系与配置版本见同目录 `dg03-e544-result.json`。原 desktop 截图为主 Bot 生成中的中间状态；主代理人工查看的 `narrow-e544-capture/narrow-drawer-closed.png` 显示主任务和两个子任务完成。两轮使用原始测试提示，未重发模型请求以取得截图。

390px 真实浏览器测试打开导航抽屉、选择主 Bot 后自动关闭，输入框可见；页面宽度与滚动宽度均为 390px，输入框宽 346px。打开/关闭截图及 ARIA 在 `narrow-e544-capture/`，主代理已人工查看关闭状态。QA 容器和专用网络已清理，候选未重启；本轮新增一个网络 QA Bot 与两个 DG03 工作 Bot，测试策略保留。新候选上的故障页、活动取消、完整跨 Bot 权限矩阵及远端 EasyTier peer 仍未验证。

冻结的未接线 browser product 测试补充回归 **1/1** 通过，包含 CLI 截图输出、会话文件移除及超限流检查，使用模拟 UDS；证据 `browser-cli-screenshot-focused.log`，不能作为真实浏览器门禁通过。

最终冻结源码在加入 CLI 截图回归和独立异步权限测试后，完整 `npm test` **109/109**、build 通过；证据 `direct-browser-final-full.log` 与 `direct-browser-final-build.log`。此为合成数据/模拟 worker，不改变真实浏览器门禁状态。

工作 Bot 私聊反馈的只读定位：本次真实委派 QA Bot 存在、委派授权有效，但没有自己的直接模型配置。源码在创建工作 Bot 时把本地模型配置设为空，并将来源引用存入委派授权；`runs.submit` 只为主 Bot 解析共享连接，工作 Bot 私聊仍要求自身模型配置，因此预计返回 `model-not-configured`。这是源码与只读状态关联的判断，本次未发送私聊或调用模型。

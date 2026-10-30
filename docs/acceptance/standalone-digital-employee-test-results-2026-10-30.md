# 数字员工独立验收记录（2026-10-30）

执行者：GPT 6.1 Terra。依据 [验收用例](standalone-digital-employee-test-cases-2026-10-30.md) 和 [ADR-0249](../adr/0249-digital-employees-share-private-and-group-chat-surfaces.md)。

## 当前状态

20443 已用固定 CI 镜像 `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea` 完成分步独立只读浏览器验收：两地址登录为同一主 Bot，15 个 Bot 可见，5 条旧历史和旧消息可读取，主 Bot 与已有授权工作 Bot 私聊、模型选择器位置及来源设置可见。组合安全回执在 `.local/standalone-bot-expansion/evidence/candidate-e872-browser/final-acceptance.json`；各步骤及先前网络和等待失败均保留，并非单次完整运行。没有提交模型 Run 或修改配置；最终数据计数待主代理核对。

源码受控测试：完整测试 125/125、定向测试和构建通过；隔离 CLI、权限和 schema 6→8 迁移恢复见[独立迁移验收](standalone-digital-employee-migration-2026-10-30.md)。源码浏览器已验证工作 Bot 受控私聊、390px 布局、部分历史分页、协作弹窗及终态刷新、历史续聊、模型迟到响应和部分来源设置竞态；来源设置前后实际时间线请求的 Bot 与 Conversation ID 一致。CI run `41077763856`（`e8721d4b3627adbd31f658002170307533801a16`）成功；固定 CI 镜像已完成真实 LAN 双地址登录及两次真实 Codex Run：工作 Bot 直接回复 391，主 Bot 真实委派工作 Bot 得到 399 并回复 399；390px 主回复终态已通过无 OAuth 的重启后只读复验，远端 EasyTier 对端未验证。群聊 GR-01–GR-06 尚未实现，均为**未执行**。旧候选的验收结果见 [既有记录](standalone-bot-expansion-test-results.md)，不能代替本片结果。

## 本片验收与切换门禁（2026-10-31）

| 状态 | 范围 |
| --- | --- |
| 通过 | 冻结源码的完整测试 125/125 与构建、定向隔离测试、schema 6→8 独立迁移和恢复检查；固定 CI 镜像真实工作 Bot 私聊 391、主 Bot 真实委派和主回复 399；无 OAuth 重启后的 canonical 历史和 390px 终态读取。 |
| 部分验证 | API/CLI、权限、幂等、分页、异步竞态、来源设置与布局分别有受控或局部证据，未覆盖所有验收条件；双地址为本机实际访问，远端 EasyTier 对端未验证。浏览器 worker 的严格扫描仍阻塞真实浏览器交付。 |
| 未实现 | 群聊 GR-01–GR-06。 |

23443 QA 已停止；主代理的 `cleanup.json` 记录来源 OAuth 0、Run 仍为 2、auth_sessions 0，最后两个测试 session 已删除。仅 QA 容器的重启策略改为 `no`；原来源服务授权未改，额外来源快照及主密钥已删除。

独立数据验收代理报告旧数据库 18 张表逐行相等（包含 bots 全部列及全部 15 个稳定 ID），owner 表 1/1、普通文件 5/5 相等并通过完整性检查。独立代理随后确认旧镜像拒绝 schema 8、可打开 schema 6 的回退门禁通过；主代理已用固定镜像启动 20443，双地址和既有数据的分步只读浏览器确认已完成。

主代理最终计数为 15 Bot、2 条 private_chat_state、6 个 Conversation、6 个 Run、12 个 Task、11 条 auth_sessions；相对浏览器前新增 2 个默认指针和 1 个工作 Bot 空私聊，Run、Task 未增加，配置未修改。本次浏览器 session 分别 logout 成功。独立 session 比对确认旧 16 条中缺失的 5 条均在首次成功 QA 登录前过期，当时未过期的旧 session 全部保留；这与登录时正常清理过期记录一致，但不能单凭比对确定具体删除时刻。候选固定镜像仍为 `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea`。

## 历史执行记录（以下各段反映当时状态）

### 后端隔离定向测试（2026-10-30）

在 Node 22.23.1 执行 `node --experimental-strip-types --test test/employee-independent.test.mjs test/private-chat.test.mjs test/browser-product.test.mjs`，**10/10 通过**。独立测试覆盖历史按 seq 升序分页、默认私聊、撤销共享引用后有本地配置也不回退且不发 transport 请求，以及 1107 条同时间消息的前后方向分页和方向/会话游标隔离。实现方测试覆盖受控模型下的工作 Bot 引用私聊、选择和幂等冲突、任务时间线与按 Conversation 限定的详情。数据和模型均为合成。

上述结果属于新增本地模型明确选择规则之前的源码快照，不能证明该规则。新规则要求未明确选择的本地新 Run 返回 `model-selection-required` 且零 transport；显式传入选择或已保存明确选择可运行，已有 Run 的省略选择幂等重放不重复执行。修复后须重新冻结并独立重测，真实 UI 不得自动提交首项。Luna 尝试以 legacy submit fallback 隐式选用本地模型的补丁被自动审批拒绝，未应用。

新冻结源码在 Node 22.23.1 上定向测试 `employee-independent.test.mjs` 与 `private-chat.test.mjs` **12/12 通过**：独立测试确认本地未选模型拒绝且零请求、显式和保存选择可运行、无选择重放不重复执行；实现方测试确认请求进行中撤销后迟到回复未发布。完整 `npm test` **125/125**、`npm run build` 通过，均使用合成数据和受控服务。测试时关键文件 SHA-256：`private-chat.ts` `af4c0d8b25cda5f6f62af308b8c0d00e116ed7e643bb40dc1b8df1060fb92121`，`application.ts` `efa62294c7a4f00594d2a0611d91f12a1f7a93c4ced5d1598158870753631d6f`，`task-engine.ts` `9aeb9eaf54d0dcec80bef0eb7b4aae205c157d30abb8f397b5faf485cbf6b476`，`migrations.ts` `a16ce4818503a2eeb1772c15b121e1af0fd8ce45424440b98ecac1ead44844de`，`cli.ts` `63ec21eb6e4d6cfde4040161ff3fb2f0b49c2b0d440799e570966224da3388c1`。真实 UI 首项选择、任务进行中 epoch 改变及迁移恢复仍待验证。

浏览器产品测试使用模拟 worker，不证明浏览器未配置拒绝或真实 Chromium 可用。真实模型、真实页面与竞态、CLI、schema 8 迁移恢复以及完整权限矩阵仍待独立验证；当时该源码测试阶段未部署或切换服务。

### 冻结源码与受控模型的浏览器预验收

源码 `ea1ce67f`，`src`、`public`、`test`、`scripts` 和 `docs` 文件名及内容的聚合 SHA-256 前后均为 `0a96190f3bdfc10681f5e8e32ac40a236b3440e92a4f95fe30687a4689f14d9c`；`public/app.js` 为 `57419fb3fe891c7372db434c543ed800260b1567aa1d1f02047689ac25f705ba`。固定本地镜像 `e6619dcd…caa7907` 仅提供 Node 运行时，源码只读挂载；浏览器镜像 `afebfa1d…48414ba` 使用非 root 和原 seccomp，sandbox 检查通过。专用 internal 网络、全新数据、受控本机模型，无 DSH 或外部模型。

真实 Chromium 在内部普通 HTTP、390px 视图中，打开工作 Bot，发送合成消息并看到受控模型回复；1107 条合成历史的初始最新页及两次加载更早、轮询后再次加载更早的指定边界标记可见。页面宽度 390、滚动宽度 375，`secureContext=false`。截图经人工检查，证据保存在 `.local/standalone-bot-expansion/evidence/employee-dev-ea1/`。该轮检查页面上的边界标记，并未逐条核对全部历史 ID。

**DE-11 窄屏布局失败**：截图中模型选择器位于发送按钮上方而非左侧，来源及 provider 前缀遮住实际模型名称；加载更早记录的按钮显示“载入后续记录”。发送和分页的已测行为只作部分验证，不代表布局通过。修复冻结后须核对两控件的实际位置、模型名称可读性及文案。

修复后的源码浏览器复验：`app.js` SHA-256 `9beeea167c2317307fd82376d3e737ed42cf175d6f07c69b05ec70269a1ee398`，相同源码目录聚合 SHA-256 `a697967a4e719f5bc7ee4a067f1238556f803b80922808437ab5655908274c1b`。390px 下选择器左边 22px、发送按钮左边 306.98px，两者垂直范围重叠；所选项显示 `fixture-model`，按钮为“更早记录”，页面滚动宽度 375px。合成私聊往返页面内容与隔离 SQLite 的 user/assistant 消息一致。截图与指标保存在 `.local/standalone-bot-expansion/evidence/employee-dev-layout-fix/`。这解决了上述已测布局失败；DE-11 其他真实 LAN、设置与竞态条件仍未完成。临时容器、网络和合成数据已清理。

CI 候选 `a749` 的 run `41077206659` 在 build/test 阶段失败：旧 `responsive-web.test.mjs` 仍要求 composer actions 换行，与新布局不一致。实现方正在修正过时断言；失败 run 不产生可验收候选，本记录不以源码浏览器结果替代成功 CI。测试修正冻结后需独立复跑响应式、employee-web、完整测试和构建，并记录新 CI run 的结果。

测试断言修正后，独立执行 responsive-web 与 employee-web **5/5**、完整 `npm test` **125/125** 和 `npm run build` 均通过（Node 22.23.1）；新 CI 结果另待核验。

追加的隔离源码浏览器病例中，协作弹窗打开并显示合成 canonical 子任务输入；切换至 `QA old history` 后续聊，SQLite 确认用户和受控模型回复均属于该历史 Conversation。来源设置阶段测试驱动按标签选择 `QA Source` 超时，属于驱动定位失败，不能判定为产品缺陷；按首个失败停止。证据位于 `.local/standalone-bot-expansion/evidence/employee-dev-extra/`。任务终态刷新、模型响应倒序、来源 loading 与保存隔离尚未验证。临时容器、网络与合成数据已清理。

一次有界驱动修正重跑中，实际选项文本包含来源名称、角色和 ID，选项值与合成来源 Bot ID 一致；按该 ID 选择后来源页显示配置的 `fixture-model`。协作输入与历史续聊再次通过；证据在 `.local/standalone-bot-expansion/evidence/employee-dev-extra-retry/`，初次失败证据保留。该重跑未验证任务终态刷新、模型迟到响应或来源 loading/保存竞态。

后续隔离浏览器竞态：合成 running 任务的弹窗打开后，夹具将 canonical 任务写为 completed 和指定结果，弹窗自动显示该结果；受控延迟的模型选择成功及合成 409 响应在切换 Bot 后释放，新页面断言未被旧响应污染。来源 loading 测试准备时，驱动尝试填写隐藏的 callback 输入并超时；这是驱动失败，未判为产品缺陷，按首个失败停止。来源 loading/保存和迟到身份回包仍未覆盖。脱敏失败和已完成项保存在 `.local/standalone-bot-expansion/evidence/employee-dev-races/`；临时容器、网络及数据已清理。

一次 C/D 有界重跑通过已测断言：延迟指定来源读取时模型及认证控件禁用，合成 key 和隐藏 callback 被清空；释放后控件启用，保存后直接查询隔离 SQLite，只有目标来源的模型改变。延迟工作 Bot 身份保存响应，在另一来源表单打开后释放，该来源模型字段保持正确。证据 `.local/standalone-bot-expansion/evidence/employee-dev-races-cd/`；此前驱动失败保留。此测试未直接断言来源设置前后当前 Conversation ID，私聊上下文保持仍待验证。临时容器、网络和数据已清理。

随后单独执行隔离浏览器上下文检查：打开合成工作 Bot 私聊，记录实际 `private-chat.timeline` 请求中的 Bot 和 Conversation ID；打开并保存另一来源设置，返回私聊后记录的新时间线请求与之前两项 ID 均一致。证据 `.local/standalone-bot-expansion/evidence/employee-dev-context/context-result.json`；临时容器、网络和数据已清理。这是源码与受控模型验证，真实 LAN 和 Codex 仍待验收。

固定 CI 镜像真实预览首轮：QA 浏览器容器启动时因非 root 用户无法读取专用 `entry.sh` 而失败，尚未连接 23443、读取访问码或发起模型请求。该项为驱动文件权限问题，不判为产品失败；按首次失败停止，QA 容器及网络已清理，证据 `.local/standalone-bot-expansion/evidence/employee-preview-e872-real/startup-failure.json`。服务前后容器状态及端口相同，运行时间自然增长；已通知主代理停止预览并清理临时授权。真实 LAN/Codex 仍未验收。

经授权的一次驱动权限修正：仅将专用 QA 目录及入口设为 755、脚本设为 644；固定 QA 镜像以 UID 10001、network none 验证两文件可读及脚本语法。随后真实预览浏览器通过两地址登录及主 ID 一致、来源授权剩余超过三分钟，并通过页面创建工作 Bot、绑定主来源和授权工作 Bot。驱动未在发送区明确选择模型，等待发送按钮启用 30 秒超时，未提交 Run 或发起模型请求；按首次失败停止。证据 `.local/standalone-bot-expansion/evidence/employee-preview-e872-retry/failure.json`。这属于驱动缺少选择步骤，不能据此判定产品失败；真实私聊、委派、弹窗和 Codex 仍未验收。QA 容器和网络已清理，已通知主代理停止预览并清理临时授权。

最终有界固定镜像预览：manifest `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea`、源码 `e8721d4b3627adbd31f658002170307533801a16`、CI `41077763856`。真实 Chromium 通过两地址登录与主 ID 一致，在页面创建工作 Bot 并明确授权和选择模型。两个用户 Run 中，工作 Bot 直接回复 17×23=391；主 Bot 真实委派该工作 Bot 计算 19×21，canonical 子任务和主回复均为 399。工作 Bot 直接 Run 保存 `gpt-6.1-sol`、来源 ID、连接 ID、epoch 1 和配置 revision 1；真实子任务 ID 和 revision 已保存。任务弹窗显示真实输入和 399，390px 坐标检查、来源设置及刷新后的身份保持通过，pageerror 为零。证据 `.local/standalone-bot-expansion/evidence/employee-preview-e872-final/`。

此次提交两个用户 Run；上游 HTTP 请求次数未测。390px 截图中抽屉展开、页面仍显示生成中，不能证明主回复终态的页面展示；终态由 `runs.get` 与 `messages.list` 验证，后续不发送模型的只读页面复验已通过，见下文。真正的远端 EasyTier 对端、重启恢复与临时授权清理结果仍待验证。QA 容器和网络已清理，主代理已获通知停止预览并执行离线审计；不再发送模型请求。

临时 QA 浏览器容器和网络已清理；23443 预览服务在额度中断期间比预期多运行约七小时，随后由主代理停止。其他容器前后状态快照一致。真实 Run 和任务弹窗已验证；完整 UI、逐条历史分页、模型选择逆序的发送快照和远端对端仍未全部覆盖。

## 停止后的离线审计（2026-10-31）

固定候选镜像以 network none、非 root、只读根和只读源挂载运行；停止的 QA 数据先复制到私有 tmpfs，再打开 SQLite。恰有两个预期用户 Run，均 completed；真实子任务 `ceff6b99-3c40-4d1d-942d-97de996c6cf5` 的父任务、执行者、连接、来源、epoch 1、模型 `gpt-6.1-sol`、revision 1 及结果 399 均匹配。该检查未发现额外 Run。来源 OAuth 仅一条，主 Bot 和工作 Bot 的 credential 与 OAuth 均为零；审计时有 4 条 auth_sessions；主代理随后报告已清理来源 OAuth 1 条与 4 条 session，剩余 OAuth 为零且两个 Run 保留。数据库 diagnostics 和本次服务日志中的 `codex-auth-refreshed` 均为零。

对来源 access、refresh 和访问码的精确字面值，在消息、Run、任务、工具调用、diagnostics 和本次结果、截图及服务日志的 26 个对象中扫描，命中零。该检查不覆盖编码、截断、其他来源、其他日志或浏览器内存。服务日志仅在私有审计目录处理，不作为公开证据。审计没有启动服务或发送模型请求。

无 OAuth 的重启后页面补验首次启动失败：Chromium 镜像声明 `/data/dsh` 卷，QA 数据只读挂载至 `/data` 导致 Docker 无法创建卷挂载点。浏览器未启动、未连接服务、未登录，未产生新 session 或模型请求；已通知主代理停止预览。此项属于驱动挂载冲突，不判为产品失败；修正后先以 network none 验证 Chromium 沙箱及文件可读性，再进行获授权的短时只读重启复验。

重启后只读浏览器复验核对了主 Bot、工作 Bot、主 Run、Conversation 和子任务 ID，canonical Run 与子任务均 completed，主回复及子任务结果包含 399；没有提交 Run 或模型请求。390px 页面的安全 DOM 显示“发送”“已完成”、停止按钮隐藏、无 pageerror，截图可见 399，但截图左侧抽屉仍遮挡约 45px，可见文字断言也未通过，因此抽屉完全关闭的终态页面验收**未通过**，不能据此认定完整窄屏终态通过。截图及脱敏状态保存在 `.local/standalone-bot-expansion/evidence/employee-preview-e872-terminal/`。只读重启验证证明上述历史可读取；未独立重新清点 Run 的总数，最终 session 清理和服务停止由主代理确认。

经授权的最后一次只读重跑修正了测量：等待侧栏实际移出视口，再以 canonical 消息 ID 定位 assistant 正文，核对正文及视口交集。390px 页面中侧栏右边界为 -12.85px，正文 `19 × 21 = 399。` 与 canonical 一致且可见；状态为“已完成”，按钮为“发送”，停止按钮隐藏，pageerror 为零。实际重启后主 Bot、工作 Bot、Conversation、Run 和父子任务 ID 均保持，canonical 记录可读取。结果和截图分别为 `.local/standalone-bot-expansion/evidence/employee-preview-e872-terminal/result-final.json` 与 `terminal-final.png`。这是无 OAuth 的历史读取，不证明授权清理后可以发送；未创建 Run 或调用模型。前次遮挡截图及失败记录保留。

20443 固定镜像首次只读浏览器确认在登录前停止：访问 `192.168.68.11:20443` 返回 `ERR_CONNECTION_REFUSED`，第二地址、业务命令和模型请求均未执行，也没有建立新 session。finally 注销返回 false 是因为该页面未连上服务。此失败需要区分监听绑定和网络可达性，不能据此判定产品缺陷；脱敏证据 `.local/standalone-bot-expansion/evidence/candidate-e872-browser/candidate-result.json`。浏览器前主代理记录 15 Bot、0 private_chat_state、5 Conversation、6 Run、12 Task、16 session，后计数待主代理核对。

后续无凭据探针从默认 Docker bridge 复现 LAN 地址 20443 连接拒绝，EasyTier 地址的 `/healthz` 返回 200；QA 容器未设置 HTTP 代理。主代理进一步定位宿主 nftables `inet gk50_bots_lan` 的 input 规则：目标 LAN 地址和 20443 只接受 `192.168.68.0/24` 来源，默认 bridge 来源因而被 TCP reset；普通 iptables 视图不能反映该独立 nft 表。主代理将按既有内网授权调整该规则，修复后需另行定向复验，以上探测未登录、读取访问码或调用模型。

主代理修复来源规则后，相同 QA 容器的两个地址 `/healthz` 均返回 200。一次有界浏览器复验在两个地址登录并确认相同主 Bot，读取到 15 个 Bot、已有授权工作 Bot、两者模型选项，以及 5 条主 Bot 历史中的实际消息。主私聊打开后，历史列表渲染数量断言失败，执行停止；该驱动在点击异步加载的历史按钮后立即计数，尚不能区分加载时序与产品问题，不能判为产品缺陷。两个本次登录 session 的 logout 均返回成功，没有提交 Run 或更改模型；工作 Bot 页面与后续布局、设置尚未检查。脱敏结果在 `.local/standalone-bot-expansion/evidence/candidate-e872-browser/retry-result.json`，前次拒绝证据保留；数据变化以主代理的前后计数为准。

历史异步等待修正后的只读复测：API 与实际历史弹窗各 5 条，旧消息可读；主 Bot 和已有授权工作 Bot 私聊均打开，模型选择器位于发送按钮左侧且垂直重叠，侧栏无独立“对话”项。来源设置检查在点击后立即读取可见性而失败；该入口先异步加载目录再显示视图，尚不能判定产品失败。两次本次 session logout 均成功；无模型请求或配置写入。脱敏证据 `.local/standalone-bot-expansion/evidence/candidate-e872-browser/history-wait-result.json`，此前失败记录保留。

来源设置入口单独补验等待异步目录加载完成后通过：来源选项 15 个，目录视图可见，pageerror 和被拦截命令均为零，本次 session 成功注销。与此前通过的双地址、历史、工作 Bot 及布局检查组合为上述安全回执；各次检查分别记录，保留首次 LAN 拒绝及两次驱动等待失败。QA 浏览器均以 `--rm` 运行，未创建专用网络；本次匿名卷随容器删除。固定镜像还对应既有 `deepseekbot-gui` 容器，该非本次资源未触碰。

## 独立测试准备

- 使用临时隔离数据和受控本机模型服务，记录请求次数与实际模型；分别检查来源授权、撤销及 epoch 变化、提交快照、同键重放与冲突。凭据只使用合成值，检查消费者和公开数据不含凭据。
- 构造多个 Bot、多个旧 Conversation 和相同时间戳的消息及子任务；检查默认指针初始化、历史上下文、稳定 ID、分页排序及任务详情与 canonical 数据一致。逐项覆盖跨 Bot 引用、游标和任务查询。
- 使用旧版本合成数据库副本检查升级前后 ID 和历史指纹、失败回滚、旧版本拒绝新版和备份恢复；不在当前候选数据上做迁移实验。
- 冻结后独立核对 API 与 CLI，并在固定候选上分别验证普通 LAN HTTP 的桌面及 390px 视图、异步切换、刷新和重启。真实模型、模拟模型、页面及迁移证据分开记录。
- 浏览器 worker 的严格扫描失败仍是阻塞项；模拟 UDS 结果不表示真实浏览器交付。

### 真实浏览器竞态待测

- 在超过三页的合成历史中连续加载至少两页更早记录，触发最新轮询后再次加载更早记录；逐页核对稳定 ID，确认无重复、遗漏或游标回退。
- 受控延迟模型选择请求，使响应倒序返回；另注入选择失败后立即切换 Bot。核对当前 Bot、Conversation、显示选择及实际发送快照，确认旧响应不能覆盖新上下文或导致误发送。
- 在全局来源设置中切换两个来源，分别操作登录和保存；核对请求捕获的来源 ID 与对应授权，确认私聊 Bot 和 Conversation 未改变，也无来源之间的授权串写。实际操作和页面证据不可由静态删除标签替代。
- 上述均为待测条件，使用隔离合成数据和受控服务；浏览器截图及请求证据不得包含访问码、会话、密钥或 OAuth 内容。

以上准备项不代表已执行；结果按通过、失败、部分验证、阻塞或未覆盖分别记录。

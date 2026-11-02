# 单用户员工与群聊独立验收结果（2026-10-31）

## 当前结论（2026-11-02）

23443 隔离预览已运行固定源码 `dbb9fb3b` 的 CI 镜像；真实 Codex 登录、两位 Bot 私聊、委派、双 Bot 群回复、响应丢失后的同键重试及重启恢复有下文证据。代理配置与对应时段的容器连接元数据均已核对。设备码流程曾报无法完成授权，单独结论仍未完成。完整测试 152/152；远端 EasyTier 设备和部分安全边界未全覆盖。产品浏览器 worker 的最新严格扫描未通过，完整发布门禁未达到；20443 旧候选未切换。以下保留各阶段失败及复验，不以早期状态替代本结论。

## 2026-11-02：隔离预览代理核查

- 23443 预览初始的模型账户未配置显式代理，容器也没有代理环境变量。Codex 登录尝试返回 `unsupported_country_region_territory`，当时 `signedIn=false`，未发送真实模型请求。
- 宿主机代理监听 `127.0.0.1:7890` 和 `172.17.0.1:7890`；从预览容器连接 `host.docker.internal:7890` 的 TCP 测试成功。已通过预览自身的认证业务接口配置 `http://host.docker.internal:7890`，保留原模型名称；等待重新登录和实际模型请求的代理路径证据。TCP 连通不证明 Codex 请求已通过代理，也不保证上游允许该账户使用。
- 20443 旧候选没有代理环境变量；15 个 Bot 配置中 1 个含 `http://host.docker.internal:7890`，其余 14 个没有显式代理。没有改动该候选，也未确认其实际请求路径。
- 网页修复版来自成功 CI `41373108047`、源码 `41e7c76e04f52cceb763d8ae2fbd3e6f4ba63261`，校验后的本机 OCI 镜像 ID 为 `sha256:66cb4affaae0e314c2bdbf56d06c10b84283418ab363df6807999bd6364f1515`，尚未发布 GHCR。24443 的专用网页验收容器测试后已停止；独立数据位于 `.local/standalone-bot-expansion/preview-41e7c76e/data`，保留供复核。23443 预览继续运行，20443 与 22443 未切换。
- 群发送修复版来自成功 CI `41377499611`、源码 `dbb9fb3bdff140b09ab04116c5c96554ad131ab6`，23443 现运行经校验的本机 OCI 镜像 `sha256:ddc43a235d3ac051460689535faa98f4b6382d44e27b9cf1b6a86c97551dceec`。升级前在停止状态备份完整目录并私下校验；备份在 `.local/standalone-bot-expansion/private/preview-before-dbb9fb3b/`，其中含授权和密钥，不得公开。重启后授权、代理及真实群历史恢复；20443 与 22443 未切换。
- 重新运行的浏览器 worker [CI 41378523337](https://github.com/404404/AI-Bots/actions/runs/41378523337) 在严格镜像扫描报告 108 项 HIGH、1 项 CRITICAL 后失败；后续代理镜像扫描、真实 Chromium 隔离测试及产物归档均未执行。此扫描不是群聊验收，也不能由验收用 Chromium 代替；完整产品发布门禁未达到。

验收依据：[用例](standalone-single-user-employee-cases-2026-10-31.md)。实现仍在集成，以下为中间态诊断，不代表最终版本验收。独立验收仅使用临时隔离数据，未访问现有 20443、22443、用户数据或凭据。

## 中间态诊断

群执行器使用临时 SQLite 与合成执行器，执行器故意忽略 AbortSignal；将 90 秒计时器缩短为 20 毫秒，超过期限后状态仍为 `running`，`close()` 在额外 100 毫秒内未完成。释放合成执行器后清理。该结果仅适用于当时的集成中源码，修复冻结后须重新验证超时终态、关闭及迟到结果丢弃。

## 最终验收

尚未执行：等待实现集成冻结。真实模型、真实 LAN 网页及真实远端 EasyTier 设备均尚未验收；合成测试不能替代这些证据。

### 群模块隔离检查（集成中）

Node 22.23.1，临时 SQLite、合成执行器和模拟凭据状态；当时 `group-chat.ts` SHA-256 `6c7566f1a52c8649bbb24c1a1de530fe885a10e20616b283a3a66c334e735249`。独立脚本 `/tmp/group-independent-audit.mjs` SHA-256 `7519fe1b1f83736e8515854c6c668e1d0c79d196313425752de1ae740c2a3e9f`，4/4 通过：同键重试和冲突、同群并发拒绝；顺序执行及第二成员收到前一群回复、不同群上下文隔离及自身记忆；成员移除后重新加入时迟到结果丢弃；取消、模拟调用 `recover()` 后中断和同键不重发；合成异常、相同时间戳下服务端插入顺序和跨群游标拒绝。首次执行因测试夹具第二次请求误复用已释放屏障超时，修正夹具后重跑通过；不是产品失败。此处恢复为同进程调用 `recover()`，并非真实进程重启；排序只测服务端响应，不覆盖网页。上述内容不证明 HTTP/CLI 集成、真实模型或真实 LAN。

独立超时脚本 `/tmp/group-timeout-audit.mjs` SHA-256 `8dfbc69d90df79ec239ec303a4df986b0e105c15f3acceeb1535a4e8ed5d70c0` 复现上文超时失败。两个脚本只使用临时数据并清理，`/tmp` 脚本为本机临时证据，不随仓库发布；集成冻结后需针对新源码复测。

### 群模块超时修复复测（仍为集成中）

修复后 `group-chat.ts` SHA-256 `c6058ada4bf6ae04f41a95f0f98b73ce08208b66c88953a58f6ae4d39d2d2e82`。独立脚本 `/tmp/group-timeout-retest.mjs` SHA-256 `ab2805d5958ddb74229d89676c74d28b9ca451fb2a9392437c0e76daad96d2be`，使用临时 SQLite、30 毫秒期限和完全忽略 AbortSignal 的合成 Promise：三个不同群执行均进入 `failed/group-deadline-exceeded`；三个未结束调用均计入容量，第四个发送被 `group-capacity` 拒绝；`close()` 在 250 毫秒内返回并报告三个未结束 ID；随后释放一个迟到结果，群消息未增加、未结束数量降为二。剩余执行均释放并清理。以上为缩短时限的模块检查，不证明真实模型或网络超时。

原独立隔离脚本对修复后源码重跑 4/4 通过，包括取消后迟到结果不发表与模拟恢复；真实进程重启、端到端页面和最终集成仍待验收。

### 后端集成首轮独立验收

被测源码 SHA-256：`application.ts` `8943e317cb7f48ed347513d276749e8485d9a72f07a73eeadd80356bb7a38f51`，`migrations.ts` `9ea38fd671d6eef7e8a54a806d02770a76904d675ba5def854eaa74a9a96a499`，`codex-auth.ts` `dfc8c80338f6b887d997e763da313cf2e3f86605290c704b0bc7a191d78eddad`，`private-chat.ts` `84a58341b581c8fb3f0f6b0f4cdb5b8327d9ebfb6ff76d75a7de04ccb8cac593`，`task-engine.ts` `799b5de467e7db9a65b8bd32754c368fd003aa96c6fe00f7e90cbf1c1663983f`，`group-chat.ts` 同前述 `c6058ada...`。以下均为独立临时数据和合成模型，未使用用户数据或现有服务。

- 集成脚本 `/tmp/single-user-integration-audit.mjs`（SHA-256 `72c6a36d416ea2ae0ecbb97209e71993684a70656a8940f42c52c7c1c127a800`）1/1 通过：空库员工列表为空，系统锚点不可选为联系人或群成员；唯一员工自动成为联系人、第二个同名员工后需要选择，显式选择以 ID 保持至重启；onboarding 预设欢迎标识与一次合成模型分析真实完成；两个员工经应用群适配器向同群回复；在途请求后更新模型使 epoch 递增且迟到结果未写入；重启后联系人、群成员及群历史保留。模型由 loopback 合成 HTTP 服务提供，重启为关闭并重新构造应用对象，非进程崩溃或真实模型。
- 迁移脚本 `/tmp/su-migration-audit.mjs`（SHA-256 `997d350694436346371df69ca2e9e938f2d000d5af124fe91096d564929a4351`）2/2 通过：从固定旧源码 `d9923cd20d3fac8273fb5618522c482f88fb42d3` 创建真实 schema 8 的合成库，0、1、2 条旧 OAuth 分别得到未配置、唯一来源采用、要求选择；旧授权行、Bot、消息、记忆保留；旧源码拒绝 schema 10，旧备份可打开。注入表名冲突使 8→9 失败，schema 与旧消息、OAuth 保持，移除冲突后可重试。备份恢复后的新写入丢失属于预期边界，未在现场恢复。
- 代码审查待修：群适配器将所有历史 Bot 发言作为 `assistant` 和内容传给模型，未携带发言者 ID 或名称；第二员工能收到前一回复，但无法从该上下文可靠区分发言者。已通知实现方。真实网页、CLI/HTTP、真实 OAuth、真实 LAN、真实模型及远端设备仍须分别验收。

- 安全脚本 `/tmp/su-security-audit.mjs`（SHA-256 `9e916eae9ce453c9e8eb3f28977280ce942ba735cc103fdec62924fff5904292`）在旧管理策略启用时验证伪造 `create_worker`、`update_worker` 均返回 `tool-not-allowed`，员工数量和资料不变；5 个伪造 owner actor 的写入口均拒绝；创建操作中注入数据库故障不留孤立 Bot。
- 账户版本脚本 `/tmp/su-epoch-audit.mjs`（SHA-256 `76be191a5802cf92a12b15cc0148504d7e9642d0309b7929abf5481a93d6a881`）：两名员工分别发起私聊与群请求并挂起合成 HTTP 上游，依次更改模型、endpoint、代理、合成凭据、provider，以及注入合成 OAuth 后退出；各次 epoch 均增加，两个请求的迟到内容均未发布。这不是实际 Codex OAuth 登录、刷新或真实网络测试，也未穷举所有员工。
- 代理脚本 `/tmp/su-proxy-audit.mjs`（SHA-256 `8ec4aa43478c0ba81381752c587d1c43a3a377f742571a2c637a1d6b62b5cf9d`）：compatible 模型指定不可用 loopback 代理时调用失败，目标合成模型服务直接请求数为 0；未验证 Codex 代理实现。
- 群发言来源修复后，`application.ts` SHA-256 `1ff5941ec762573b13e5bc6db405072df27637d4b9a45bb55c2a145eff642f7a`。修订独立集成脚本 SHA-256 `cdbedde85dbf850ce2fee4a91e4d9dab623f6cdf5c3f299ef2036d3d78f447cf`，1/1 重跑通过；两名同名员工的第二次模型实际请求包含第一人的稳定 sender ID、名称、类型和不可信来源标识。此结果解决上述已测发言归属缺口，真实模型对信封的理解尚未验证。

### HTTP、CLI 与进程中断检查（集成中）

- `/tmp/su-http-cli-audit.mjs`（SHA-256 `9c907fe6b1571d99aacb546716707033551d3e93da33deddd8c9634f6bfe4151`）在独立 loopback 服务验证：未登录群命令 401；CLI 与 HTTP 交叉创建员工、选择联系人及创建/读取同一群；活动私聊经 CLI 取消后迟到合成回复未入库；未登录认证状态提供非空模型候选；正常关闭和重启后联系人与群可由 HTTP/CLI 读取。临时会话及数据已清理；未使用真实账号。
- `/tmp/su-crash-audit.mjs`（SHA-256 `748503b304972f083c472be6df6f175c39f503054ebb438ef42344f31f4c849b`）及子进程脚本 `/tmp/su-crash-child.mjs`（SHA-256 `7af2bcc8514ef917ba548c33dc6aac2a080f26cfa5fd32a20db0420c86cbfde5`）：仅对本次隔离子进程，在群执行到达合成上游后发送 SIGKILL；重新打开同一临时数据库，执行为 `interrupted`，上游请求保持一次且未重放，历史只有用户消息。不是生产服务崩溃测试。

测试期间发现 `application.ts` 指纹继续变化，最近值 `5855b07421415ebe442b1257a465d9b1ef51b97b15b6a6039c92814e6c00266f`。上述为集成阶段证据，须在最终源码冻结后统一复跑并重新记录指纹。

### 暂冻源码统一复验

9 个独立脚本均退出 0：`group-independent-audit.mjs`、`group-timeout-retest.mjs`、`single-user-integration-audit.mjs`、`su-migration-audit.mjs`、`su-security-audit.mjs`、`su-epoch-audit.mjs`、`su-proxy-audit.mjs`、`su-http-cli-audit.mjs`、`su-crash-audit.mjs`；脚本及对应 `.log` 位于本机 `/tmp`，仅为临时证据。被测九个文件在执行前后的 SHA-256 一致：

```text
application.ts  5855b07421415ebe442b1257a465d9b1ef51b97b15b6a6039c92814e6c00266f
migrations.ts   9ea38fd671d6eef7e8a54a806d02770a76904d675ba5def854eaa74a9a96a499
codex-auth.ts   dfc8c80338f6b887d997e763da313cf2e3f86605290c704b0bc7a191d78eddad
private-chat.ts 1124aaf292c8cbb0f4b286f7ac2b56f5d4e5c2a6413e6669f6bc89bfebe1ad67
task-engine.ts  799b5de467e7db9a65b8bd32754c368fd003aa96c6fe00f7e90cbf1c1663983f
group-chat.ts   c6058ada4bf6ae04f41a95f0f98b73ce08208b66c88953a58f6ae4d39d2d2e82
model.ts        8bcbfef9fd8f5202487f7033b289fc02dd96478a6d0348b75c2a3572baa3a0a5
server.ts       89699254b21acc28aeb13429dbede9fcb5459e83ad0206d0d405607291b49479
cli.ts          0bd6d6aa529248cb8dbfb9e84265142f7755e8bf7fe710b8d0574d5fecf14691
```

这些结果覆盖上述列明的合成场景；真实 Codex OAuth 登录和刷新、真实模型、真实 LAN 网页、远端设备、最终固定镜像及完整 UI 尚未验证。源码后续若变更，需对受影响场景重新验证。

业务源码冻结后，使用 `sha256sum -c /tmp/su-audit-after.sha256` 确认上述九个文件全部一致；因此统一复验适用于当前业务源码。旧 `delegation-independent` 测试从逐员工授权切换为全局账户和联系人，仍保留任务幂等、取消与迟到、actor 隔离、记忆快照检查。旧 `employee-web` 测试删去了部分 390px 布局、分页游标和异步来源表单竞态的静态断言；旧来源表单已经改变，但这些删除不证明新网页的窄屏、分页和切换竞态通过，仍需真实浏览器检查。

### 后续修复最终源码独立复验

`application.ts` SHA-256 `bbaa9e64073b821ef75c3719f35bc648272a1c88f1d20388716317b35408df88`、`private-chat.ts` SHA-256 `16f8c21dfa1dfbde914486ff2b528a8c6b75d3020bf47ef0499bdf3b904614b5`；其余七个核心源码与上一节一致。九个独立脚本在该版本重新执行均退出 0，执行前后九个文件指纹一致；日志为 `/tmp/final-<脚本名>.log`，仅本机临时证据。

新增 `/tmp/su-codex-final-audit.mjs`（SHA-256 `8433e1084064b99505f3f0f80b1ffdfa58ba0fb351bd13ed7f37451f10d8d68c`）：临时数据库注入合成授权，两员工共享 SDK 模型目录并选择不同于账户默认值的候选模型；受控合成 SSE 传输捕获到请求中的实际模型 ID 与选择一致，完成后模型标记为 verified，目录外 ID 被拒绝。compatible 账户的 keyless false 和 true 均通过 `model-account.get` 正确回显。另启动忽略取消的合成群执行，关闭应用后直接打开临时 SQLite，确认对应 Run ID 的 `group-execution-detached`、`close-deadline` 诊断已持久化。该测试未连接真实 Codex，不能证明真实 OAuth、真实模型可用性或实际代理。

旧测试审查：`main-bot`、`main-independent` 和 `avatar-product` 的迁移 fixture 已适配 schema 10；原迁移失败回滚和租约释放、旧 Bot 与历史保留、模型与身份快照、合成秘密不出现在公开快照、HTTP/CLI 一致性和无认证拒绝断言仍在。`main-independent` 对提交前后两个配置的实际请求断言保留；创建时伪造身份标志由忽略改为拒绝，并验证员工列表无新增。上述审查不表示完整测试套件通过。真实 OAuth、真实模型、真实 LAN 页面、远端设备和固定镜像仍未验收。

### 工具委派修复独立复验

最新业务源码在本轮测试前后指纹一致：

```text
application.ts   1348ba8bcd7f83d2f7c0eb04d1cd63bf0b057518e7900b9f37ead0536e84bede
migrations.ts    9ea38fd671d6eef7e8a54a806d02770a76904d675ba5def854eaa74a9a96a499
codex-auth.ts    dfc8c80338f6b887d997e763da313cf2e3f86605290c704b0bc7a191d78eddad
private-chat.ts  16f8c21dfa1dfbde914486ff2b528a8c6b75d3020bf47ef0499bdf3b904614b5
task-store.ts    a690b86205fb58c5b5648e95c195052c8df5b381ded7cec4e270c4fae61b92d1
task-engine.ts   538628ff4abe0309353056739ff8c38fe9f43e3dc75fbcc703ae4be607f8472c
group-chat.ts    c6058ada4bf6ae04f41a95f0f98b73ce08208b66c88953a58f6ae4d39d2d2e82
model.ts         8bcbfef9fd8f5202487f7033b289fc02dd96478a6d0348b75c2a3572baa3a0a5
codex-model.ts   6c911caba15dba97bb63a9ae6ca2721968bcc623d2c2cdf6ac8c90b98501395d
server.ts        89699254b21acc28aeb13429dbede9fcb5459e83ad0206d0d405607291b49479
cli.ts           0bd6d6aa529248cb8dbfb9e84265142f7755e8bf7fe710b8d0574d5fecf14691
```

`/tmp/su-delegation-audit.mjs`（SHA-256 `32f8c28c988e5860ed589ef71011fe8fbaaa2d2f22c6836323c7dfdf1fe28f01`）1/1 通过：基于现有协议夹具扩展，使用合成 OAuth 与受控 SSE，验证 SDK toolCall、持久子任务、worker 请求、受界不可信 toolResult 和 root 后续汇总；账户默认值以外的所选模型 ID 出现在两次 root 及一次 worker 请求中。子任务读取自己的角色和记忆，不含 root 角色；合成 access 与 refresh 从结果及公开快照中脱敏；同键重放保持 Run ID 且 worker 请求仍一次。首次脚本将捕获对象外层误当请求体导致测试断言失败，修正测试夹具后通过；不视为产品失败。

`/tmp/su-delegation-race-audit.mjs`（SHA-256 `de6184ac2fc70a00e47ca1d7b6d38f8d7a9edc3a8573223cfb591128c0183d98`）2/2 通过：worker 合成请求已到达后分别更换账户模型 epoch 与取消父 Run，再释放迟到输出；子任务未 completed，任务与消息均不含迟到输出，各场景 worker 请求一次。

此前九个独立隔离脚本及 Codex 模型与关闭诊断脚本在最新源码重跑，10/10 退出 0；日志位于 `/tmp/delegation-final-<脚本名>.log`。全部使用临时数据和合成传输，不证明真实 Codex 服务、真实账户或固定镜像验收。

### 完整测试及测试差异独立审查

Node 22.23.1、npm 10.9.8，在 `standalone` 下分别以 300 秒和 120 秒超时保护执行 `npm test` 与 `npm run build`。完整测试 **145/145 通过、0 失败、0 跳过**（测试报告耗时约 26.85 秒），构建通过。Avatar HTTP/CLI 测试本轮通过，未复现此前 CLI 间歇 exit 1；单次通过不能证明该间歇问题已经消失。完整日志 `/tmp/standalone-full-independent-2026-10-31.log` SHA-256 `0e343d902590199f927a79f28d1cd0859000eb6fec882bebbf3c4fa7715b417f`，构建日志 `/tmp/standalone-build-independent-2026-10-31.log` SHA-256 `16eafac5958671e4c8adecf0a9be9479e78eb724c313a3531c1e0a492a6c206c`；均为本机临时证据。

测试前后 `standalone/src` 与 `standalone/test` 所有 `rg --files` 文件依路径排序的逐文件 SHA-256 清单一致；清单 `/tmp/standalone-test-after.sha256` 的 SHA-256 为 `14a11b028752a1d77726afeb6c3d02506321a9dce98aecd3a629ebdd83509064`，包含未跟踪文件，不代表仓库其余文件或构建产物指纹。

审查 `delegation.test.mjs`、`employee-independent.test.mjs`、`worker-management.test.mjs` 和 `worker-management-independent.test.mjs` 的差异：旧逐 Bot 连接/模型管理设置按新全局账户和用户创建员工规则替换；SDK SSE 工具调用到持久 child、worker、工具结果和主回复的链路仍有执行断言，worker 记忆隔离、合成 access/refresh 脱敏仍检查。任务预算、最大子任务数、并发容量、超时、取消、同键重放及冲突仍有独立断言；原模型创建/修改员工的成功用例按新需求改成拒绝并检查无副作用。此审查是对所列测试覆盖的核对，未证明真实外部模型、真实 LAN 页面或固定镜像。

### GK50 固定候选网页独立验收（2026-11-02）

指定隔离预览 `gk50-employee-preview` 使用镜像 ID `796245e2cb69`、端口 23443 和独立数据。非 root QA 容器使用项目 `deploy/chromium-userns-seccomp.json` 与 Xvfb；`chrome://sandbox` 显示 namespace、PID namespace 和 seccomp-BPF 均启用。QA 容器的 host 网络访问 LAN 地址成功，未启动 DSH。默认 Docker seccomp 首次启动 Chromium 报无可用沙箱；未使用 `--no-sandbox`。浏览器实际访问 LAN 页面，未使用其他实例凭据。

- **部分通过：** 空员工列表；网页创建 Alpha、Beta 两位员工；创建后各有一条可见欢迎语。唯一员工时 Alpha 自动为联系人；两员工后 canonical 要求选择；网页指定 Beta 后，`contacts.get` 确认显式选择，刷新后仍为 Beta。
- **发现：** 两个员工的 `employees.onboarding.status` 均为 `pending`、`model-account-required`，欢迎语类型 `preset-welcome`。模型账户设置中的员工列表显示“预设欢迎语 · 角色分析待完成”和重试入口，但创建后私聊中的欢迎消息本身没有预设标识，且私聊未显示分析待完成。用户在私聊无法从消息辨别其来源。
- **部分通过：** 网页创建包含两位员工的群，`groups.list` 的群 ID、名称和成员 ID 与页面一致；刷新后网页与 canonical 联系人、群成员一致。未测进程重启、真实模型发送或群回复。
- **头像：** Beta 默认头像可见；网页上传合规的 32×32 合成 RGB PNG 后，页面显示已保存，`bots.get` 返回同一头像 revision 和尺寸。首次灰度 PNG 被明确拒绝，符合页面公布的格式限制。未验证刷新后的图片呈现或删除。
- **失败：** 390px 群页面的 `document.documentElement.scrollWidth` 为 403px，水平滚动条可见；`#group-members-editor` 与 `#group-recipients` 均从 x=27 延伸至 x=403，超出视口。浏览器未报告 pageerror。

脱敏截图、脚本及 canonical/布局 JSON 保存在本机 `/tmp/employee-gk50-qa/`（`alpha.png`、`beta.png`、`settings.png`、`group.png`、`mobile.png`、`mobile-detail.png`、`avatar.png`、`result.json`、`followup.json`），不包含访问码或 cookie。两处网页问题已交实现方处理。真实 OAuth、真实模型回复、远端 EasyTier 设备及其他验收场景仍未完成；本次不构成最终通过。

### 网页修复源码独立审查（未重新部署）

欢迎标识按服务端 `welcome.kind` 和消息 ID 精确匹配，两个群成员选择框增加容器宽度限制；方向符合前述两项问题。审查时发现创建流程先渲染私聊、再保存 onboarding 状态，首次标识须等待时间线轮询；若后续状态请求失败，创建响应已使用 `roleStatus`，前端却读取 `status` 并回退为 `running`，可能误报分析进行中。已交实现方修正。新增测试是源码正则断言，不能证明实际 DOM、状态转换或 390px 布局。当前 23443 仍为旧固定镜像，上述修复尚未进行真实网页复测；须待新 CI 固定产物后复验。

### 创建竞态修订审查（未部署）

本地修订保留创建响应的 `roleStatus`，状态读取失败时使用该响应；针对性静态检查 6/6 和 standalone 完整 `npm test` 146/146 通过。独立审查发现选择版本在 `bots.create` 返回后才捕获：若用户在创建请求进行时切换 Bot，完成后仍可能跳回新员工。已交实现方修正；现有静态测试未执行这一异步时序，也未证明 retry 与定时状态读取并发时的结果。未访问或重启预览；修复后的固定镜像网页验收仍待执行。

### 异步修订与真实模型尝试（2026-11-02）

新协调器延迟响应测试覆盖创建期间切换、旧轮询迟到与重试期间抑制轮询；创建响应的 `roleStatus` 在状态请求失败时保留。审查发现新增模块最初未在服务端静态白名单中，导致网页脚本无法加载；实现方已添加白名单与临时 HTTP 回归。静态资源不经 API 登录门禁，模块与现有脚本共用该路径。针对性测试 7/7 通过。首次完整套件 146/147：短截止时间用例在 `TaskStore.begin` 抛出 `task-deadline-exceeded`；该用例单独重跑通过，修订后完整套件 148/148 通过（日志 `/tmp/standalone-review-final-20261102.log`）。首次失败不能因此视作已消除。上述 helper 测试与静态源码断言不能替代真实浏览器对修订后镜像的验证。

用户确认登录后尝试当前 23443 旧镜像的真实模型场景：网页 Alpha、Beta 模型目录全部显示 `not-signed-in`，选项禁用；脱敏 `model-account.get` 为 `configured=false`、`provider=openai-codex`、`auth.signedIn=false`、`attempt.phase=idle`、`migration.state=not-configured`。没有发送模型请求，实际模型调用数为零。当前状态不能判断登录曾否成功或如何失效；真实私聊、双成员群回复和委派均因授权状态阻塞。失败截图和脱敏状态位于 `/tmp/employee-gk50-qa/real-failure.png`、`real-failure.json`、`model-status.json`。未访问其他服务或使用其他实例凭据。

### 截止时间测试夹具复审（2026-11-02）

独立审查 `delegation.test.mjs` 的修订：先以未来截止时间成功 `begin`，调用生产 `runDirect`，等待本地 HTTP 服务器实际收到请求；随后将测试任务的持久截止时间设为过去并触发捕获的生产定时器回调，断言真实 AbortController 信号已中止、任务持久状态为 `failed/task-deadline-exceeded`。这是受控触发而非等待真实时钟到期；服务器端 `aborted` 事件没有断言。针对性用例 1/1、完整 `npm test` 148/148 通过，完整日志 `/tmp/standalone-deadline-review-20261102.log`。本轮未访问预览。

再次按用户确认检查隔离预览：`model-account.get` 返回 `configured=false`、`signedIn=false`，认证尝试状态 `failed/unsupported_country_region_territory`，Beta 模型仍为 `not-signed-in`。主代理只读确认账户代理未配置。按停止条件未发起模型请求，未修改账户或代理；本轮模型调用与在途任务均为零。授权和代理设置完成后方可继续真实模型验收；不能由本次状态推断流量实际经过何处。

### 24443 固定修复镜像网页复测（2026-11-02）

隔离容器 `gk50-employee-fix-qa` 使用镜像 `sha256:66cb4affaae0e314c2bdbf56d06c10b84283418ab363df6807999bd6364f1515` 和全新数据，非 root Chromium 使用项目窄 seccomp，namespace、PID namespace 和 seccomp-BPF 均启用。

- 创建两员工后，私聊直接显示“预设欢迎语 · 角色分析待完成 · 请先设置模型账户”；Alpha 标签所在消息 ID 与 `employees.onboarding.status` 的 `preset-welcome` ID 一致，两员工状态均为 pending/model-account-required。
- 网页创建双成员群并指定 Beta 为联系人，刷新后群成员和联系人与 canonical 数据一致。390px 时文档宽 375px，成员和回应者两个 select 均位于 x=27–348，无页面级横向溢出。
- 默认头像可见；上传 32×32 合成 RGB PNG 后页面显示已保存，`bots.get` 返回相同 revision 和尺寸。
- `/onboarding-state.js` 返回 200、JavaScript MIME；无 pageerror。console 有一次未登录时 `GET /api/v1/session` 的 401，登录后操作正常。
- 浏览器拦截并延迟创建 Gamma 请求，关闭创建对话框并切换 Alpha，再释放请求：Gamma 出现在列表中，当前页面仍为 Alpha。该检查覆盖创建请求在途的切换，不穷举所有异步交错。

截图及脱敏 JSON 位于 `/tmp/employee-fix-qa/`，浏览器 QA 容器已退出；预览容器及数据保留。未配置模型或访问 23443、20443；真实模型和远端设备不在本次结果中。

### 23443 真实模型、代理与群聊检查（2026-11-02）

隔离预览仍使用旧镜像 ID `sha256:796245e2cb69263d55c2be0560bccfcf7d30f1cbab4fa965a3b25e0cf73c084a`；本轮源码修复尚未部署。账号状态确认 `configured=true`、`signedIn=true`、认证状态 `authorized`、代理已配置。非 root QA Chromium 使用固定本地镜像 `sha256:afebfa1da0647f85774b0da832c3ca829d58608d99dc4063713417c3748414ba`、项目窄 seccomp、Xvfb 和 host 网络访问 LAN；页面报告 namespace、PID namespace、seccomp-BPF 均启用。未使用 `--no-sandbox` 或启动 DSH。临时 API 状态查询会话已清理；网页 QA 登录创建的会话未主动注销。

- **真实私聊通过：** Alpha 于 02:01:02 UTC、Beta 于 02:02:10 UTC 分别发送短请求，页面均出现指定回复；其模型请求及完成诊断记录 `explicit-proxy`。Alpha run `260aca93-c1ec-48e8-bae4-c407f5cc961c`，Beta run `1377bec3-e200-4949-b52c-062de7552e36`。
- **联系人委派通过：** 02:04:46 UTC 经 Beta 页面请求将简单计算交给 Alpha；02:04:53 页面回复给出 15 并注明 Alpha。run `a4fddd81-6f6a-41f1-a4e6-1a18d73c2674`、Beta 根任务 `c8db6449-ac27-4f08-af99-d01ee461a038`、Alpha 子任务 `1043ae57-e76e-4998-a666-9ed1583a091f` 和 `delegate_to_worker` 均完成。模型请求与完成诊断的 route 均为 `explicit-proxy`。截图 `/tmp/employee-proxy-evidence/delegate-reply.png`。
- **代理连接证据：** 只读进入预览网络命名空间采样 socket 元数据，在上述委派期间观察到三条 `172.17.0.4` 至 `172.17.0.1:7890` 的 TCP 连接，时间 02:04:46.545–02:04:52.216 UTC；三个连接分别观测到最多发送/接收 4816/17732、4072/10591、5039/13075 字节。采样仅保留端点、时间和字节计数：`/tmp/employee-proxy-evidence/delegate-sockets.jsonl`。时间相关性不单独证明每条连接所属的具体模型步骤。tcpdump 因系统权限拒绝未采集任何包；宿主命名空间 ss 未显示预览 socket，改用预览命名空间 ss。
- **群聊失败：** 两成员群选择有效模型后发送按钮仍禁用，未产生群 run 或模型请求；页面无法完成双成员真实回复。源码检查发现群刷新时按钮条件只接受 `available` 或无状态，而模型可用性判断也接受 `verified` 和 `candidate`。`/tmp/employee-proxy-evidence/group-observation.png` 是重开群的当前状态，`group-retry-failure.png` 记录两人选中、模型启用但发送禁用；原始等待超时页面未保存截图。后续源码修复需固定新镜像后再进行真实 LAN 复测。

本轮在隔离预览中增加真实 QA 私聊消息和委派任务，保留截图及脱敏 socket 元数据；没有修改预览配置、重启预览或触碰其他服务。浏览器 QA 容器已退出。

### 群交互源码复审（未部署，2026-11-02）

工作树基础 HEAD `4caa17b5051e902f15b21ff9780601f9e0c4241f`；所审工作树内容未提交。主要文件 SHA-256：`public/app.js` 为 `1395fc162bbc4834492c1d523209d381ffbd3f1b79d917d8aa598c70fbf8cf95`，`public/group-ui-state.js` 为 `558cfa4dde51fcc06aeab1ed4c1f2882f765f1b319256008a77d151d1fd4dcb0`，`test/single-user-ui.test.mjs` 为 `cea9c2452e2c7da403f4bef7513e2472a0dabe5b04b3ade6210d360f81660feb`。检查前后这些文件指纹一致。

静态复审显示：群发送使用与模型选择一致的可用状态判断；刷新保留仍属于群的接收人并剔除已移除成员；切群期间刷新、发送、创建、成员保存和取消回调有目标群或选择版本检查；慢速历史分页期间抑制同群轮询；草稿恢复同步模型 ID。未确认请求保留原始幂等键和收件人顺序；成员重新加入后按集合核对并发送原始请求，发送失败保留原记录，仅成功后清除。若原接收人已移除，界面阻止发送并提示先加回。新增静态模块有服务端路由和真实 HTTP 资源测试。上述检查包括源码和异步 helper 测试；所谓 DOM 测试使用模拟 select/option 和源码断言，未驱动实际页面事件链，不能替代新固定镜像的真实网页复测。

`npm run build` 成功。完整 `npm test` 为 151/152：`private-chat.test.mjs` 的 `each Bot uses the shared global account selection without local model configuration` 报 `conversation-busy`，日志 `/tmp/standalone-group-final2.log`；该测试单独重跑 1/1 通过。完整套件失败仍需分析，单独通过不能证明根因或将完整套件记为通过。当前 23443 预览仍为旧镜像，修订未部署，群双成员真实回复仍未验证。

为调查该失败，完整套件再运行一次，仍为 151/152，且同一私聊测试再次报 `conversation-busy`；日志 `/tmp/standalone-group-final3.log`。这与单测独立通过并存，原因尚待调查。

### 私聊夹具修订独立复验（2026-11-02）

私聊夹具先等待 setup 时的在途运行结束并清空 setup 请求，首轮私聊同时等待上游请求到达与持久状态 `completed` 后才提交第二轮。独立审查确认，未授权选择被拒绝且不发请求、保存的模型选择与显式选择的断言仍保留；`completed` 与私聊提交的 `queued/running` 忙碌检查对应。

完整 `npm test` **152/152**，日志 `/tmp/standalone-fixture-review.log`；`npm run build` 成功。测试及构建前后六个文件指纹一致，见 `/tmp/standalone-fixture-review-sha.txt`；其中 `test/private-chat.test.mjs` SHA-256 为 `4e26f9cf0d83130e0e5e6afb665cdaa249110eadcdd3ad9a6cc858bf8ee37130`，基础 HEAD 为 `4caa17b5051e902f15b21ff9780601f9e0c4241f`，工作树未提交。此前两次完整套件的 `conversation-busy` 失败仍按原记录保留；本次通过不证明真实群网页行为，须待新固定镜像复验。

### 23443 固定镜像群聊与重启复测（2026-11-02）

隔离预览使用通过 CI `41377499611` 的固定镜像 `sha256:ddc43a235d3ac051460689535faa98f4b6382d44e27b9cf1b6a86c97551dceec`，源码 revision `dbb9fb3b`。从非 root QA Chromium 经 LAN HTTP 操作页面；该 QA 使用项目窄 seccomp、Xvfb，`chrome://sandbox` 显示 namespace、PID namespace、seccomp-BPF 均启用。未使用 `--no-sandbox`。

- 原有 `Terra QA 群` 的 Alpha 和 Beta 两人选中后，7 秒轮询后接收人、草稿和模型选择仍保留，发送按钮启用。网页分别选择 `candidate` 模型 `gpt-5.3-codex-spark` 和 `verified` 模型 `gpt-6-luna`，等待轮询后两者均保持选择且发送启用；candidate 仅验证可选及启用，没有另发模型请求。
- 网页新建隔离群 `Terra QA Switch 1102`（`20380542-c5a1-456f-9697-410c595bebea`），切入时未带入原群输入和收件人，返回原群后草稿、两名收件人和模型恢复。
- 对原群发送唯一短任务 `GROUP-FINAL-QA-1102`，测试浏览器让首次 `groups.send` 到达服务端后模拟响应丢失；切到另一群再返回，未确认的正文、收件人和模型在页面恢复。同一原始 payload 和幂等键经页面重试，持久记录恰有一条用户消息和两条 Bot 回复，避免重复执行。两名 Bot 的真实页面回复与 canonical 数据一致：seq 1 为用户，seq 2 为 Beta `4eb5c785-49f6-4d9f-84f7-fab566f8c3ef`，seq 3 为 Alpha `cc8523d4-e0e2-4fd6-ab42-3f179cbf6f62`；两条 run 分别为 `adbbfdc4-6c61-458b-8ed5-44d23d88d7a8`、`6f8e3810-f13f-4215-8a9a-724898ae4e1f`，均 completed、无错误，recipient index 0/1 与页面顺序一致。两次使用 `gpt-6-luna`、model epoch 4，与账户 epoch 4 一致。
- 02:32:28 UTC 核对 runs、tasks、group runs 的 queued/running 均为零后，仅重启 `gk50-employee-preview` 一次。02:32:54 网页重新登录后仍显示同一群的两条 Bot 回复，sender ID 顺序不变；账户 `configured=true`、`signedIn=true`、代理存在。

截图及脱敏 JSON 位于 `/tmp/employee-group-final-qa/`：`pending.png`、`replies.png`、`model-status.png`、`after-restart.png`、`result.json`、`model-status.json`、`after-restart.json`。其中 `replies.png` 的连接中断提示来自测试主动模拟首次响应丢失。此次新增上述测试群及原群一条测试消息和两条回复，保留于隔离预览；本轮未触碰 20443 或 22443，QA Chromium 容器均已退出。

# 单用户员工与群聊独立验收结果（2026-10-31）

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

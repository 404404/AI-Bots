# GK50 独立 Bot 候选访问与部署

这是新独立产品的候选。既有真实 Codex、明确保存的文件记忆、主 Bot、委派和头像证据分别见 PX 及扩展报告；2026-10-31 已将员工私聊第一片固定候选切到 20443。完整边界仍有部分验证项，群聊尚未实现，产品浏览器仍受镜像门禁阻塞；IM、定时任务、Computer 和客户端继续延后。架构依据见 [ADR-0243](adr/0243-fork-bot-product-owns-an-independent-runtime.md)、[ADR-0249](adr/0249-digital-employees-share-private-and-group-chat-surfaces.md)及[迁移评估](standalone-bot-migration.md)。

## 当前体验入口：20443

当前为员工私聊候选 `e8721d4b`：工作 Bot 使用明确授权的来源直接私聊，发送左侧选择模型，来源统一在“来源与授权设置”管理，真实协作摘要进入聊天并可展开。旧历史从私聊中的“历史记录”访问，没有独立侧栏对话区。网页操作与 CLI/API 见[使用说明](../standalone/docs/digital-employee-guide.md)。真实模型、页面、重启和未覆盖项见[数字员工验收](acceptance/standalone-digital-employee-test-results-2026-10-30.md)，不能把本片当作全部能力交付。

- EasyTier：<http://10.250.250.1:20443>；局域网：<http://192.168.68.11:20443>。
- 容器：`gk50-standalone-bot-candidate`。两地址使用同一份独立数据和访问码，浏览器按地址分别建立登录会话。
- 在 GK50 SSH 终端读取访问码并填网页；不要把实际输出发到聊天或提交：

```sh
sudo cat /home/hermes/bots/.local/standalone-bot-candidate/data-v8-e8721d4b/secrets/access-code
```

2026-10-31 当前固定镜像来自成功 [CI 41077763856](https://github.com/404404/AI-Bots/actions/runs/41077763856)，源码 `e8721d4b3627adbd31f658002170307533801a16`；本地 OCI manifest/runtime ID 为 `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea`，config 为 `sha256:919dea178dc70b06910df46d0f10bd55f7054d7d1cdc6b6695cf1b94b10a5566`，tar SHA-256 为 `387d163da955134ea6561307425a5868cf53a9d62d9b08563e13de7621c42366`。未在 GK50 重建、未正式发布 GHCR。

实际挂载改为上述新的 schema 8 数据副本；旧 `data/` 保留 schema 6。迁移前全部 15 Bot、5 Conversation、6 Run、12 消息、12 Task、授权及原文件经独立比对保持，访问码和既有会话随副本保留。逐项门禁、实际 Compose、备份及回退命令见[部署记录](acceptance/standalone-employee-deployment-2026-10-30.md)。不要让旧镜像读取 schema 8，也不要把保留的旧 `data/` 误当当前写入目录。

2026-10-30 用户明确授权整个内网及 EasyTier 来源。当前候选监听 `0.0.0.0:20443`；应用数值匹配 RFC1918、CGNAT、ULA 和 loopback 来源，并只接受部署配置的精确 Host/Origin，认证与 CSRF 保留，不信任转发 IP 头。允许地址还包括 GK50 的 `192.168.68.12` 和 `192.168.110.11`。配置合同见 [network-access.md](../standalone/docs/network-access.md)。IPv6 来源规则有单元证据，本机未验证 IPv6 ULA 监听。

修复前实测：EasyTier 地址连接拒绝；使用 `10.250.250.1` 来源访问 LAN 返回 `403 source-not-allowed`。升级后两个地址及该来源组合的页面和健康检查均为 200，未认证业务 API 仍为 401。真实浏览器与跨设备覆盖分别见[逐项报告](acceptance/standalone-bot-expansion-test-results.md)，本机虚拟接口不等于远端 EasyTier 设备验证。

## 22443 对照访问（保留）

- 网页：`http://192.168.68.11:22443`，仅面向已授权 LAN。
- 新容器：`gk50-standalone-bot`；后台为独立 Node 服务，不启动 DSH。
- 模型页中的「Codex 验收」Bot 已完成独立产品登录及真实回复验证。模型目录来自锁定 SDK，不保证每个账号都可使用所有列出的模型。
- 访问码只在 GK50 本机读取，再填网页。不要将输出发到聊天或提交版本库：

```sh
sudo cat /home/hermes/bots/.local/standalone-bot/data/secrets/access-code
```

本次用户明确授权后已轮换访问码并撤销旧会话；旧码及旧会话返回 401。轮换保留 Bot、历史、文件记忆和模型授权。网页登录与 Codex 登录是两个步骤；访问码不是模型授权。

## 22443 对照部署身份

| 项目          | 身份                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| 源码          | `6486cd961a15ffd501c7ff2119672cf506557f9c`                                |
| CI            | [40887735117](https://github.com/404404/AI-Bots/actions/runs/40887735117) |
| OCI manifest  | `sha256:5d043efb55bb63c344bca5961329efd10bbeea437577bb47becfdd840f1dd81d` |
| OCI config    | `sha256:afec0539a2598102eb06e4ee7f1f431c1b608188f631cf47df4e5e86493a056d` |
| CI tar SHA256 | `074d78406a3742986d64d8ec2af8a97fdc2a18232e6723e57d07c6f87e3e5450`        |

候选来自 GitHub Actions 的未发布产物，经 ZIP CRC、tar SHA256、OCI index → manifest → config 哈希及平台/源码标签校验后导入。CI 和 GK50 使用不同 Docker 存储，`inspect` 的 ID 表示不同，引用链必须匹配，不能仅比较标签。GK50 没有重建候选。

这不是 GHCR 正式发布。上述真实模型和记忆路径已有通过证据；本轮新增能力须通过各自门禁后才能发布。正式部署仍须使用固定 registry digest，不能将本地 manifest/config 身份冒充 registry 发布回执。

## Compose 与数据

### 升级前的 schema 6 候选（历史，独立于 22443）

升级前源码 `e5444f66bb0bf43a79c3671e0e15e8d76d4e979f`，[CI 41016727806](https://github.com/404404/AI-Bots/actions/runs/41016727806) 成功归档；固定 OCI manifest 为 `sha256:e6619dcdb4370362049f4752a7c8ae90cb88139e2ceee83afc9dfb021caa7907`，config 为 `sha256:5f97ed928421d130a539091b9d1080a53cf32d2dd4a093104ddbb8b8a47198ef`，tar SHA256 `e03f27ab891fab8ddeb5d5d252f40d853bfa42998ee5d74473db6089d10b1f2f`。使用同一 CI 归档经分段 Content-Range、ZIP CRC、tar SHA 及 OCI 链验证后导入，未本机重建、未正式发布 GHCR。

本次 schema 保持 6。升级前确认无活动任务，停止候选后完整私密备份到 `.local/standalone-bot-expansion/private/candidate-pre-network-e5444f66/`；访问码和数据保留。该目录保存前一固定镜像、Compose 快照和备份记录；仅代码回退可使用同 schema6 的前一镜像 `sha256:523f044c6eddf16810225903f8686ceea44fa68be34ecfcb2018d5958325d2f3` 及其匹配配置。恢复数据是独立动作，会丢弃备份之后的写入，不能将代码回退视作数据恢复。

此候选含主身份、头像、单工作委派及对话管理修复；新真实端到端覆盖以报告为准。浏览器 schema7 接线仍在源码验收，未部署到此候选，其模型工具未实现。worker [严格扫描阻塞](acceptance/standalone-browser-security-blocker-2026-10-30.md)，整体发布门禁未达到。六个对照服务的镜像、状态与启动时间前后相同。

### 历史头像候选与迁移记录

- 网页：`http://192.168.68.11:20443`；容器：`gk50-standalone-bot-candidate`。
- 源码 `f08fd7752293d69e7b0fa870fc880e0f38ba24d3`，[CI 40981572807](https://github.com/404404/AI-Bots/actions/runs/40981572807) 的未发布头像候选；未在 GK50 重建。
- 固定 OCI manifest：`sha256:6bc20c379611c4e41d9a54278229903350d4c4e217e481bc02d5580f24665e4d`；config：`sha256:f74023a21403649cdb9b1b6d4d21a7e3e88876aa80bafbf1c2f8926d47e48046`；归档 SHA256 `3079faaf858afaf510ef84ae14e960c0c7bac8d60a10252805454c44c7d50922`。这是验证后的本地 CI 镜像身份，不是 registry 发布回执。
- Compose：[候选样例](../standalone/deploy/compose.candidate.yml)；私有数据在 `.local/standalone-bot-candidate/data/`。访问码在其中 `secrets/access-code`，仅在 GK50 本机读取，不发到聊天。没有复制 22443 的网页访问码、会话或旧 DSH 授权。
- 主身份、直接管理和单工作 Bot 的真实 Codex 主→子→主委派已取得 LAN 证据；头像源码独立 58 项测试及 CI 通过，当前补真实头像操作与布局验收。对话内创建工作 Bot、多工作任务和产品浏览器尚待交付；完整权限矩阵等仍有未覆盖项，见[逐项报告](acceptance/standalone-bot-expansion-test-results.md)，不把候选当作最终发布。
- 当前候选为 schema5，升级前有 6 个 Bot、4 条终态任务，主身份和既有测试数据保持。已加入同一稳定来源 Bot 的独立产品 Codex 测试授权，主/工作 Bot 没有新增 OAuth 记录；源 22443 数据与旧 DSH 授权不写入、不迁移。头像候选模型链还须后续针对性回归，不能把旧镜像结果写成新镜像全量通过。
- 本次 schema4→5 升级前完整私密备份位于 gitignored `.local/standalone-bot-expansion/private/candidate-pre-schema5-f08fd775/`；旧镜像 manifest 为 `sha256:6d7fff4898953b99dbb4a30d00243afa86d7718096ee003f4c951f71d0d7b68a`。Terra 在隔离副本验证升级保留原 Bot、历史、记忆和加密授权字节，旧镜像拒绝 schema5，另行恢复 schema4 备份后旧镜像可读。恢复会丢弃升级后写入；备份含密钥与授权，不能公开。更多故障注入点仍未覆盖。
- 候选升级前的完整私密备份在 gitignored `.local/standalone-bot-expansion/private/candidate-pre-schema4-35a24e28/`。主代理在副本验证 schema2→4、外键零错误、主身份/3 Bot 保持；旧固定镜像拒绝 schema4，恢复迁移前备份后旧镜像可读。镜像回退和数据恢复是两个动作，会丢弃恢复点之后的写入，不宣称自动无损降级。正式切换 22443 前仍需对最终版本及其数据重验。

源 Compose：[standalone/deploy/compose.yml](../standalone/deploy/compose.yml)。实际部署副本和 `.env` 位于 `/home/hermes/bots/.local/standalone-bot/`，唯一数据映射为该目录的 `data/` → `/data/bot`。UID/GID 10001、只读根文件系统、cap-drop ALL、no-new-privileges、Docker 默认 seccomp，无新增 GUI 安全例外或 Docker socket 映射。

数据根目录 0700；访问码、主密钥及数据文件均受私密权限保护。SQLite 保存 Bot、执行、历史和加密授权；明确保存的 Markdown 按 Bot 隔离。备份需保留整个数据目录，包括主密钥。独立登录和文件记忆不复制旧 DSH 数据。

查看新产品：

```sh
docker compose --project-directory /home/hermes/bots/.local/standalone-bot -f /home/hermes/bots/.local/standalone-bot/compose.yml ps
```

部署工具先校验再执行，任何门禁失败即停止：

```sh
node standalone/deploy/qualify.mjs --run-id 40887735117
node standalone/deploy/qualify.mjs --run-id 40887735117 --execute
```

升级先停止并备份新产品数据，保存前一固定镜像 ID。`--rollback` 只做回退预检，`--rollback --execute` 回退新产品代码；不会自动恢复数据备份。上一候选为 `ca46623a`，存在 localhost CLI Host 拒绝问题，LAN 入口仍可用。schema 不兼容时应停止并另行评估数据恢复。

原 `deepseekbot-gui` 保持停止，其数据保留。20443 当前由独立数据的 `gk50-standalone-bot-candidate` 使用；22443 当前服务维持原镜像。21443 属于其他服务，不作修改。新服务由 Docker 管理，独立于 SSH 会话；本轮没有改动 mihomo 或主机代理配置。

## CLI 和模型验收

新 CLI 使用同一认证 HTTP dispatcher，支持 Bot、Conversation、Message、Run、文件记忆、诊断及 Codex 授权命令，准确列表见[独立 README](../standalone/README.md)。它不伪造旧 Session、Channel Timeline、Activity 或 Assignment；旧产品命令保留在原代码及其数据权威中。

容器模型代理设置使用 `http://host.docker.internal:7890`，不用宿主机 localhost。模拟 CONNECT 测试已证明显式代理路径和无直连回退；既有真实模型结果见最新验收记录，不能据端口连通、配置存在或 SDK 目录宣称新任务工具链已通过。

历史“稍后登录”状态已被最新实测取代。用例、通过项、失败修复、未覆盖项和测试数据见[既有验收记录](acceptance/standalone-bot-test-results-2026-10-29.md)顶部及 PX-01–12；新主 Bot 的权限、连接和真实委派须重新按[扩展用例](acceptance/standalone-bot-expansion-test-cases.md)验收，不隐式继承既有 Bot 的授权。

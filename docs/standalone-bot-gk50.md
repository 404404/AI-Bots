# GK50 独立 Bot 候选访问与部署

这是新独立产品的候选。2026-10-29 最新 PX 复验已确认真实 Codex 登录、API 与 LAN 网页回复、明确保存的文件记忆更新及重启恢复；完整边界仍有部分验证项。主 Bot、委派、头像、产品浏览器正在按[扩展计划](standalone-bot-expansion-plan.md)实现并另行验收，不能用现有测试浏览器替代产品浏览器。群聊、IM、定时任务、Computer 和客户端继续延后。架构依据见 [ADR-0243](adr/0243-fork-bot-product-owns-an-independent-runtime.md)及[迁移评估](standalone-bot-migration.md)。

## 访问

- 网页：`http://192.168.68.11:22443`，仅面向已授权 LAN。
- 新容器：`gk50-standalone-bot`；后台为独立 Node 服务，不启动 DSH。
- 模型页中的「Codex 验收」Bot 已完成独立产品登录及真实回复验证。模型目录来自锁定 SDK，不保证每个账号都可使用所有列出的模型。
- 访问码只在 GK50 本机读取，再填网页。不要将输出发到聊天或提交版本库：

```sh
sudo cat /home/hermes/bots/.local/standalone-bot/data/secrets/access-code
```

本次用户明确授权后已轮换访问码并撤销旧会话；旧码及旧会话返回 401。轮换保留 Bot、历史、文件记忆和模型授权。网页登录与 Codex 登录是两个步骤；访问码不是模型授权。

## 当前候选身份

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

### 本轮扩展候选（独立于 22443）

- 网页：`http://192.168.68.11:20443`；容器：`gk50-standalone-bot-candidate`。
- 源码 `e841d49c15ef169f8e2e32bbd1e7226f3d2e1d5b`，[CI 40942085923](https://github.com/404404/AI-Bots/actions/runs/40942085923) 的未发布产物；未在 GK50 重建。
- 固定 OCI manifest：`sha256:54b393c84048928f27cb6f33cee43f194347b3aa88ee3a21afe83e312cb9540c`；config：`sha256:e6fa8b7b44ed664439af5badc45f4f5b2128e8249216dd36e0f198362d6ad443`。这是验证后的本地 CI 镜像身份，不是 registry 发布回执。
- Compose：[候选样例](../standalone/deploy/compose.candidate.yml)；私有数据在 `.local/standalone-bot-candidate/data/`。访问码在其中 `secrets/access-code`，仅在 GK50 本机读取，不发到聊天。没有复制 22443 的网页访问码、会话或旧 DSH 授权。
- 主身份和直接管理已完成本片 LAN、刷新、重启及自动验收；迁移故障点、权限矩阵和配置消费等仍有部分覆盖，见[逐项报告](acceptance/standalone-bot-expansion-test-results.md)。真实委派、头像和产品浏览器尚未完成，不把本片当作最终发布门禁。
- 首片未迁移或覆盖 22443 数据，原 GUI 保持停止。第二片源码开发不改变正在运行的第一片镜像。

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

原 `deepseekbot-gui` 保持停止，其数据保留。20443 已在扩展预检中确认为空闲，预留给独立数据的 `gk50-standalone-bot-candidate`，实际启动前再次核查；22443 当前服务维持原镜像。21443 属于其他服务，不作修改。新服务由 Docker 管理，独立于 SSH 会话；本轮没有改动 mihomo 或主机代理配置。

## CLI 和模型验收

新 CLI 使用同一认证 HTTP dispatcher，支持 Bot、Conversation、Message、Run、文件记忆、诊断及 Codex 授权命令，准确列表见[独立 README](../standalone/README.md)。它不伪造旧 Session、Channel Timeline、Activity 或 Assignment；旧产品命令保留在原代码及其数据权威中。

容器模型代理设置使用 `http://host.docker.internal:7890`，不用宿主机 localhost。模拟 CONNECT 测试已证明显式代理路径和无直连回退；既有真实模型结果见最新验收记录，不能据端口连通、配置存在或 SDK 目录宣称新任务工具链已通过。

历史“稍后登录”状态已被最新实测取代。用例、通过项、失败修复、未覆盖项和测试数据见[既有验收记录](acceptance/standalone-bot-test-results-2026-10-29.md)顶部及 PX-01–12；新主 Bot 的权限、连接和真实委派须重新按[扩展用例](acceptance/standalone-bot-expansion-test-cases.md)验收，不隐式继承既有 Bot 的授权。

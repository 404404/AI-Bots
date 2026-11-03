# GK50 独立 IM 预览部署与验收（2026-11-03）

## 实例和来源

| 入口 | 容器 | 镜像 OCI manifest | 源码 | 数据 |
| --- | --- | --- | --- | --- |
| 23443 | `gk50-employee-preview` | `sha256:ddc43a235d3ac051460689535faa98f4b6382d44e27b9cf1b6a86c97551dceec` | `dbb9fb3bdff140b09ab04116c5c96554ad131ab6` | `.local/standalone-bot-expansion/preview-c19a996c/data` |
| 24443 | `gk50-im-preview` | `sha256:48950b0b3a26f761b30a7429ac9e082c92d0e88c65b04ccfe8dd0cd1bb94d388` | `7cbefccffa3885e0bbb0f3bcbe1175cf337bd43e` | `.local/gk50-im-preview/data` |

路径以 `/home/hermes/bots/` 为根。24443 使用全新数据，不共享 23443 可写目录或 OAuth 授权。Compose 为 [compose.im-preview.yml](../../standalone/deploy/compose.im-preview.yml)，仅绑定私有地址来源允许访问的端口，不部署 Browser Worker。访问码仅由用户在主机终端读取：`sudo docker exec gk50-im-preview cat /data/bot/secrets/access-code`。

候选来自 [CI 41580233262](https://github.com/404404/AI-Bots/actions/runs/41580233262) 的 `standalone-candidate`。GitHub ZIP SHA-256 为 `465e6ab5b69161c0e8624fa7819e39ea98e797bbfab45a487b8578e81638c956`，内层镜像 tar 为 `3e8e102fc9420c2d9f4fdfd34c83079d496406fa265b97d42a1069addd101f36`；Config digest 为 `sha256:b44b706bafa8fbb818cabf12fcaea083e3500e51271a6d16b0d48f84f8b42c92`，平台 `linux/amd64`。

归档原携带 `standalone-bot:ci`，该标签也被 23443 使用。为不改变 23443 标签，只移除了归档外层的标签引用；派生归档 SHA-256 为 `4a9b7e8943538e63618ddd20ccf257605d501c4e2dabed3c0bbb3eaaa9f8d6b3`。22 个 OCI blob 与原归档逐一相同，manifest 和 config digest 不变；以无标签归档导入后，23443 标签仍指向原镜像。没有重建镜像。

## 旧实例备份与恢复

20443 和 22443 的旧容器已在确认无活动运行、备份及恢复演练后正常停止并移除；原始数据目录和旧镜像保留。私密备份根目录为 `/home/hermes/bots/.local/gk50-im-rollout-20261103-v2/`，访问需主机权限：

- `old-20443/`：原始数据 `.local/standalone-bot-candidate/data-v8-e8721d4b`；镜像 `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea`；源码 `e8721d4b3627adbd31f658002170307533801a16`。
- `old-22443/`：原始数据 `.local/standalone-bot/data`；镜像 `sha256:5d043efb55bb63c344bca5961329efd10bbeea437577bb47becfdd840f1dd81d`；源码 `6486cd961a15ffd501c7ff2119672cf506557f9c`。
- 每套包括 Compose、原镜像归档、加密主密钥和访问码文件、SQLite 在线一致性快照、原始 WAL/SHM 取证副本及校验清单。`owner.sqlite` 是运行时独占租约，使用文件副本并在隔离副本检查完整性。业务数据库在线快照已包含 WAL 提交数据；取证 WAL 不得覆盖快照。
- 两套副本均使用原镜像在 `--network none` 的临时容器中启动到 healthy，演练容器已删除。具体恢复命令保存在私密备份目录的 `RESTORE.md`。首次尝试因租约独占锁停止，保留的 `.local/gk50-im-rollout-20261103/` 是不完整副本，不能用于恢复。

23443 一致性副本在无网络环境由候选镜像从 schema 10 迁移至 12；Bot 4、私聊 3、消息 16、任务 9、群 2、群成员 4、群消息 3、群运行 2，迁移前后数量相同；SQLite 完整性正常，授权密文与副本主密钥匹配。未在网络中使用该授权：两个实例并用同一刷新令牌存在相互影响风险，因此 24443 使用独立新数据。

## 资源与运行状态

| 时点 | 可用内存 | Swap 已用 | 记录 |
| --- | --- | --- | --- |
| 清理前 | 4.7 GiB | 522 MiB | 23443 约 29 MiB；20443 约 18 MiB；22443 约 8 MiB |
| 旧容器移除后、新容器启动前 | 4.8 GiB | 414 MiB | 23443 约 28 MiB；负载 0.99/1.21/1.62 |
| 双实例初始状态 | 4.7 GiB | 410 MiB | 23443 约 28 MiB，24443 约 55 MiB；负载 0.82/0.96/1.39 |
| 双实例复查 | 4.7 GiB | 408 MiB | 23443 约 46 MiB，24443 约 57 MiB；CPU 瞬时分别约 0.04%、20.83%；负载 1.41/1.59/1.50 |

上表容器值是 Docker Memory Usage 快照，不等同于纯 RSS；CPU 为瞬时采样。两容器复查时重启次数 0、无 OOM。新实例限制为 768 MiB、1 CPU、128 PID，非 root、只读根文件系统、丢弃全部 capabilities、no-new-privileges。文件系统剩余约 38 GiB。`cron` 在运行；发现的 `server-status-hermes-export.timer` 状态为 active/elapsed，不能据此证明 Hermes 定时任务按计划成功运行。

双实例初始阶段额外读取 cgroup v2 的 `anon`：23443 为 16,224,256 bytes，24443 为 54,243,328 bytes；该数字是匿名内存，不直接等于进程 RSS。原始 CI 镜像 tar 和身份记录保存在私密备份目录 `candidate/`。

复查后单次读取 `/proc/stat` 的 1 秒主机 CPU 忙碌率为 30.4%；这不是长时间负载结论。

## 验收状态

- **通过：**23443 和 24443 healthy；20443/22443 不再监听；旧 `deepseekbot-gui` 保持停止。24443 的 `192.168.68.11`、`192.168.68.12`、`192.168.110.11` 和 `10.250.250.1` 健康端点返回 200；页面静态资源返回 200，未登录 API 返回 401。
- **API 通过：**Terra 使用独立测试数据验证私聊与空群共现会话栏、置顶与取消、私聊未读游标及跨会话游标拒绝。测试 Bot `6d98348c-da70-4413-b279-04e5197402f6`、私聊 `0e063bf4-0704-47ae-b87c-962ec3fe0556`、空群 `cf6a7ec8-11d6-4b6d-8f0f-53554965bc3d` 保留，名称带 `20261103 QA`。创建 Bot 可能改变仅有一个 Bot 时的主要联系人自动选择。
- **隔离副本重启通过：**对 24443 在线一致性快照使用相同候选镜像和 `--network none` 临时容器启动、重启，健康检查和 SQLite 完整性通过；QA Bot、私聊、空群及预置欢迎消息的 ID 均保留。此验证没有重启 24443，也未验证新模型回复的持久化。
- **真实 Codex API 通过：**用户单独完成 24443 授权后，Terra 使用 `gpt-6-luna` 测试私聊，运行 `e4f289da-b015-40b9-9d03-9647ee32c9d6` 成功，输入和回复均从持久化时间线读回。Bot 间运行 `b6806005-327a-4b37-add7-4f2cd4a83757` 成功，实际工具发送及接收方回复均持久化，并关联来源私聊、任务及回复消息；测试未使用模拟模型。测试创建的接收 Bot `71b78cae-1998-4564-a401-60a519986b09` 和授权线程 `85e8b749-8cf8-4d3b-994e-1cc1c2f3359b` 保留。访问码和授权未写入报告。
- **代理：**24443 的应用级模型配置使用 `http://host.docker.internal:7890`。从容器通过该代理向认证服务建立 CONNECT，返回 HTTP 200；真实 Codex 私聊随后成功。该结果不保证其他账户或上游请求始终可用。
- **未完成：**当前环境没有可连接的浏览器或系统 Chromium，尚无 24443 的真实页面截图、四视口或鼠标/键盘验收；空群未覆盖群消息未读。API 成功不能替代页面验证。
- **安全门禁：**未改动 Browser Worker 的 Node core `uncovered` 门禁或正式发布策略，也未发布 Browser Worker。

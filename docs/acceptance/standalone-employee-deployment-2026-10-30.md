# 数字员工私聊候选部署记录（2026-10-30）

执行：主代理；产品：GPT 6 Luna；独立验收：GPT 6.1 Terra。当前是私聊第一片候选，不是群聊或产品浏览器交付，也不是 GHCR 正式发布。

## 已完成的产物核对

| 项目 | 身份 |
| --- | --- |
| 用户 fork / 分支 | `404404/AI-Bots` / `feature/gui-container-codex-prototype` |
| 产品源码 | `e8721d4b3627adbd31f658002170307533801a16` |
| 成功 CI | [41077763856](https://github.com/404404/AI-Bots/actions/runs/41077763856) |
| CI artifact | `12988416933`，`standalone-candidate` |
| CI tar SHA-256 | `387d163da955134ea6561307425a5868cf53a9d62d9b08563e13de7621c42366` |
| OCI manifest / GK50 runtime image ID | `sha256:0b10be3931242ff0511f4654263e06c4f8d32c1d94b635bab9d909c78f3b4cea` |
| OCI config | `sha256:919dea178dc70b06910df46d0f10bd55f7054d7d1cdc6b6695cf1b94b10a5566` |

四段严格 Content-Range 下载后检查 ZIP CRC 与成员、tar SHA、OCI index→manifest→config、平台及 fork/source 标签。CI 记录的独立构建、协议测试、容器冒烟、重启持久化及 Trivy 均通过。加载既有产物，没有 GK50 本地重建，没有用 mutable tag 作部署身份。上述本地 OCI 身份不是 registry 发布回执。

## 独立预验收环境

- `23443` 启动前无监听；`20443`、`21443`、`22443` 均已占用，不复用其他服务端口。
- 容器 `gk50-employee-preview`；[Compose](../../standalone/deploy/compose.employee-preview.yml)；全新 `.local/standalone-employee-preview/data`，schema 8。
- LAN `http://192.168.68.11:23443`；EasyTier 本机接口 `http://10.250.250.1:23443`。外部 EasyTier 设备尚无实测。
- 非 root、只读根、cap-drop ALL、no-new-privileges、768MiB、1 CPU、128 PID；无 Docker socket 或浏览器 worker socket。
- 仅为有限真实 QA，从现有 **standalone** 20443 的同一稳定来源 Bot 读取一行加密授权和来源配置，以新的测试主密钥重加密到同一来源 ID。来源只读挂载，不复制 DSH、其他 Bot、聊天、网页访问码或登录会话。主与工作 Bot 不新增 OAuth 记录，模型共享继续用服务端授权引用。
- 授权植入要求至少十分钟有效期；真实驱动每个 Run 前核对余期，限时、首次失败停止，不做授权刷新。植入后已删除额外源密钥和加密快照，只保留不含秘密的来源说明。测试结束须停止预览、清理临时 OAuth 与网页会话并记录。
- 初次 QA 启动因专用驱动文件权限失败，尚未连接页面或调用模型；保留失败证据。准许仅修正该 QA 文件权限、无网络预检后一次有界重跑，不将其计作产品失败或通过。

现有 `gk50-standalone-bot-candidate` 20443、`gk50-standalone-bot` 22443、停止的旧 GUI 和其他项目未切换。

## 切换门禁及回退方案（待执行）

必须先通过本片真实 LAN 页面、工作 Bot 私聊和真实主→子→主链，以及受控权限、迁移和 CLI 验收。失败保存证据、停止晋级，不发布正式 GHCR，也不切换对照 22443。

若上述门禁通过，先确认 20443 无 queued/running Run/Task，只停止该候选；完整备份当前 schema 6 数据及实际 Compose/镜像身份。使用另一个新目录复制数据、逐版升级到 schema 8，核对原有 ID/记录和文件保持，再以固定候选镜像在 20443 启动。原 schema 6 数据目录保留，不能让旧代码读取 schema 8。

代码和数据回退须分别证明：旧固定镜像拒绝 schema 8；旧固定镜像能打开 schema 6 备份。实际回退使用旧镜像与原目录及对应 Compose，保留升级后目录用于恢复新增写入；恢复旧数据会丢弃备份之后写入，不能声称无损降级。执行前后均核对旧 GUI 停止、22443 及其他服务镜像/状态不变。

## 2026-10-31 接续与中断记录

最终驱动在固定候选中提交两个用户 Run：工作 Bot 真实回复 391，主→工作 Bot→主真实执行并返回 399。上游 HTTP 请求次数未测。两地址认证、主身份一致、真实页面创建及授权、模型明确选择、任务详情、390px 控件坐标与刷新身份检查已有证据。原窄屏截图抽屉展开且页面仍显示生成中，终态页面展示仍须只读补验，不能只用 API 结果通过。

额度中断发生在收尾之前，临时 23443 容器继续运行约七小时，超出计划的有限测试窗口；2026-10-31 接续后立即停止。没有在中断期间主动开展测试，是否有额外 Run 或授权刷新由离线 canonical 数据审计核对，不能仅凭设计作断言。临时授权尚待审计后清理。20443、22443 及旧 GUI 状态未切换，原有三份部署修改的 diff 摘要仍为 `13bfa2d9438bbb882cb91ace029599179ff2af50e11a5cda6a737d0bdb2f672d`。

真实执行结论和环境清理继续追加；[Terra 报告](standalone-digital-employee-test-results-2026-10-30.md)是行为验收依据，[独立迁移报告](standalone-digital-employee-migration-2026-10-30.md)记录已完成的合成副本测试。

## 2026-10-31 实际切换与回退边界

真实模型后的离线审计确认恰两个预期 completed Run、真实子任务来源/模型/epoch/revision 匹配，无新增执行或授权刷新；3 个敏感字面值在 26 个所查数据库/证据/日志对象中零命中（只证明精确字面值）。23443 的临时 OAuth 1 条、初期网页会话 4 条、最后只读窗口会话 2 条均已删除，最终 OAuth=0、sessions=0、Run=2。测试容器停止并设 `restart=no`，额外源密钥及加密快照已删。QA Chromium 只作为测试设备，不代表产品浏览器功能。

只读终态补验通过：重启后稳定 ID 与 canonical 结果保持，390px 中抽屉实际右边界 -12.85px，助手正文“19 × 21 = 399。”可见且与记录一致，状态已完成、取消隐藏、pageerror=0。初次测量在关闭动画中截图且文字断言过严，保留原失败；第二次按实际几何位置和 canonical 消息测量通过。

20443 升级前确认 queued/running Run/Task 均为 0，SQLite 及 sidecar 小于 16MiB，并核对备份空间；只停止候选，完整复制备份，再从备份复制至新目录升级。主代理确认迁移前副本逐文件一致；Terra 独立比较旧 bot 库表 18/18、owner 逻辑表 1/1、普通文件 5/5 保持，完整性通过。这里不声称 SQLite 物理文件及进程锁 sidecar 在迁移后逐字节不变。

固定旧镜像在独立临时副本上拒绝 schema8，返回 `schema-upgrade-required`；可打开 schema6 备份。初次验证脚本误指 `/verify` 而副本在 `/tmp/verify`，按失败停止后作一次路径修正，初次失败及最终回执均保留。没有让旧 Storage 打开原目录或升级后的实际目录。

新版 20443 已通过固定镜像启动及健康检查，容器名仍为 `gk50-standalone-bot-candidate`：

- 唯一当前数据挂载：`.local/standalone-bot-candidate/data-v8-e8721d4b` → `/data/bot`，schema8。
- 原数据目录 `.local/standalone-bot-candidate/data` 保留 schema6，不再作为当前写入目录。
- 完整备份及操作回执：`.local/standalone-bot-expansion/private/candidate-pre-employee-e8721d4b/`。这是含密钥和授权的私密目录，不发布其内容。
- 实际 Compose：上述私密目录的 `accepted-compose.yml`，`new.env` 仅引用固定新镜像和新数据目录；`old-compose.yml` / `old.env` 指向固定旧镜像及原 schema6 目录。
- 启动前：15 Bot、0 私聊指针、5 Conversation、6 Run、12 Task、16 既有认证 session。切换后原数据页面复验另行记录，不以健康检查代替浏览器。
- 原 GUI 保持停止，所核对的六个对照服务（含 22443、旧 GUI 及其他项目）的镜像、状态及启动时间一致。

查看当前候选（命令不输出凭据）：

```sh
docker compose --project-name gk50-standalone-bot-candidate \
  --project-directory /home/hermes/bots/.local/standalone-bot-expansion/private/candidate-pre-employee-e8721d4b \
  --env-file /home/hermes/bots/.local/standalone-bot-expansion/private/candidate-pre-employee-e8721d4b/new.env \
  -f /home/hermes/bots/.local/standalone-bot-expansion/private/candidate-pre-employee-e8721d4b/accepted-compose.yml ps
```

若需回退，先确认候选空闲并停止，保留当前 schema8 目录及其新增写入，再使用相同 project name、`old.env` 和 `old-compose.yml` 执行 `up -d --no-build --pull never`。这会恢复旧代码配原 schema6 数据；schema8 后的新消息、配置、授权更新不在该旧数据内。不能只换旧镜像继续挂 schema8，也不能把数据回退称为无损代码回退。本次只在隔离副本验证回退边界，没有在正式入口来回切换丢弃用户写入。

**门禁结论**：员工私聊片的真实固定镜像证据与独立迁移门禁通过，20443 作为候选上线；整体正式 GHCR 发布门禁未达到，群聊未实现，产品浏览器严格镜像扫描仍阻塞。没有发布新 registry 镜像，没有切换 22443，没有向上游提交或同步改动。

## 遗留主机 LAN guard 修复

切换后的第一次只读浏览器在 LAN 地址连接拒绝，尚未登录，所有业务计数未变；同一个无代理 Docker bridge 测试设备访问 EasyTier 健康检查为 200，而 LAN 为 `ECONNREFUSED`。宿主 LAN 健康检查为 200。只读核对最终定位到 iptables 之外的 nft 表 `inet gk50_bots_lan`，其中原 INPUT 规则只准 `192.168.68.0/24` 访问 LAN 地址的 TCP 20443。这一遗留规则与用户已确认的整个内网范围不一致。

主代理先备份该专用表和 `/etc/gk50-bots-lan.nft`，Luna 提供[规则样例](../../standalone/deploy/gk50-intranet.nft)及聚焦测试。只替换该表的唯一一条规则，目的仍限 `192.168.68.11:20443`，源允许范围改为 IPv4 loopback、RFC1918 与 CGNAT；同步同一持久文件，不重启任何服务，不改其他项目规则，应用认证与 Host/Origin 检查保留。没有启用旧 socket/proxy 单元。

匿名 CIDR 集合的 `nft --check replace` 在本机 nft 中触发自身断言并退出，未变更规则；改用五个连续的 `ip saddr != CIDR` 合取条件，逻辑等价于拒绝不属于任一允许网段的来源。该写法经 `--check` 后才应用。样例的 Node 聚焦测试 1/1 通过；独立复验另由 Terra 记录。该外部主机配置修复没有改动或重建已验收的运行镜像。

这是应用入口来源策略。它不代表产品浏览器可访问任意内网，也不改变浏览器 worker 的 URL 授权边界。实际远端 EasyTier 设备及 IPv6 ULA 仍未实测。

## 最终入口、增量与清理

guard 修复后，QA 设备到两个地址的健康检查均为 200。Terra 逐步复验了双地址网页登录同一主 ID、15 Bot、已有工作 Bot 的私聊及模型选项、5 条旧主历史和消息可读、发送左侧模型布局、来源设置入口。历史和设置两次初始断言未等待异步完成，分别保留失败后按实际弹窗/控件可见状态补验；组合回执明确引用各分步，不伪装为一次完整旅程。

最终数据量：15 Bot、2 个默认私聊指针、6 Conversation、6 Run、12 Task、11 认证 session。浏览器复验只新增两个指针和一个工作 Bot 空私聊，未新增 Run/Task 或修改配置。每次 QA 认证会话均以其自己的 cookie 注销；原16条会话中减少的5条，独立比较均已在首次成功登录证据时间之前过期，未过期旧会话全部保留，符合登录清理过期会话的逻辑；不据此推断具体删除时刻。

23443 最终退役：OAuth=0、session=0 后，删除这套新 QA 数据自己的 `master.key` 和访问码，再移除已停止容器，保留测试 SQLite 和脱敏证据。测试数据因此不能直接作为可运行备份；原/当前20443与22443的密钥及数据未作此清理。所有短时 QA 浏览器容器随 `--rm` 清理其匿名卷，未遗留专用网络。当前可体验入口只有本页的 20443 新候选和保留的 22443 对照。

## Fork 交付记录

交付提交 [`d79331b414c4ba77f4b626330d1cab97efb5fd35`](https://github.com/404404/AI-Bots/commit/d79331b414c4ba77f4b626330d1cab97efb5fd35) 已推送至用户 fork 的既有分支，其 [CI 41139279143](https://github.com/404404/AI-Bots/actions/runs/41139279143) 成功完成独立构建/测试、runtime 扫描、无 DSH 启动及重启持久化门禁。本提交包含文档、独立验收脚本和 Luna 的主机 guard 样例/测试，没有改动运行中的应用源码。

没有将该新 CI 归档再下载或替换到 GK50；当前仍严格使用本页已做真实模型/LAN验收的 `e8721d4b` / CI `41077763856` / `0b10be39…` 固定镜像。GitHub 项目描述已同步员工私聊、委派、记忆、头像及群聊/浏览器的阶段边界；仅更新 `404404/AI-Bots`，无上游写入、PR 或 registry 发布。原有五份未提交文件及五份未跟踪历史材料保持在工作区，本轮提交不纳入它们。

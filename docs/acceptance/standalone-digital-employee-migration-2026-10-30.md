# 数字员工独立迁移、CLI 与授权验收（2026-10-30）

验收对象：源码 HEAD `ea1ce67fe9deac9eda261d70ad6029c717d3b4a5`；旧版源码通过 `git archive e5444f66 standalone` 导出。Node 22.23.1，临时目录和 loopback 受控合成模型，未使用真实模型、现有用户数据、既有容器或服务。5 项独立测试通过；没有修改产品代码、提交或部署。

| 范围 | 结果 | 证据与边界 |
| --- | --- | --- |
| DE-06、DE-13：真实旧源码构造 schema 6，再升级到 8 | 通过 | 旧版创建合成主 Bot、2 个同时间 Conversation、2 Run、2 消息、1 Task、文件记忆和加密合成 credential。升级后主 ID、记录数量、记忆内容和 credential 解密一致；并发打开选定 `conv-b`，不新增 Conversation，重启后指针稳定。 |
| DE-13：迁移错误和恢复 | 通过 | 未知 schema 拒绝；6→7 与 7→8 分别注入冲突表，失败后版本分别保持 6 和 7，移除冲突后同目录可重新打开并升级到 8，证明锁释放及逐版本事务回滚。 |
| DE-13：代码回退和数据恢复 | 通过 | 旧源码拒绝读取 schema 8；独立 schema 6 备份可由旧源码打开并解密合成 credential。新版升级后新增的 Conversation 不在旧备份中：恢复该备份会丢弃升级后的写入。此项在临时副本执行，未恢复现场数据。 |
| DE-02、DE-09：独立 HTTP 与 CLI | 通过 | 本地服务的 owner session 驱动 CLI `private-chat.open/history/models/select-model/timeline/task-detail` 与 `runs.submit`；各 stdout 均为可解析的单 JSON 且不含合成 credential。HTTP 与 CLI 返回同一 Conversation；合成子任务详情可读，跨 Bot 查询拒绝。 |
| DE-02、DE-03：认证和权限 | 通过 | 上述七个命令无 session 时均为 401 `unauthorized`；Bot actor 在参数中伪造 owner 时均为 `forbidden`；未授权 Bot 选择其他 Bot 的连接被拒绝。 |
| DE-03：直接 TaskEngine 在途撤权 | 通过 | 合成模型请求到达后分别撤销授权和修改来源模型 epoch，随后释放迟到响应；任务均为 `failed`，分别报告 `connection-revoked`、`connection-changed`，持久任务结果不含迟到内容。覆盖 `tasks.create` 直接 worker 路径。 |
| 浏览器配置边界 | 通过 | 独立服务 `browser.status` 返回 `browser-unavailable`，`browser.open` 返回同名错误。未验证浏览器 worker 交付。 |

从仓库根目录复验：`node --experimental-strip-types --test docs/acceptance/scripts/standalone-employee-migration.mjs`。该脚本自动从 Git 导出固定 `e5444f66` 旧版源码，只创建临时合成数据并监听本地 loopback；路径调整后重跑 5/5 通过。版本化脚本：[standalone-employee-migration.mjs](scripts/standalone-employee-migration.mjs)，SHA-256 `f8ed1ccd0aa09916f63d97a3004bd9040fddecf223e0f846335b8c6bfd27a334`。

原始脚本与 TAP 保存在本机 [独立证据目录](../../.local/standalone-bot-expansion/evidence/employee-migration-ea1/run-makMAQm0/)，SHA-256 分别为 `62e9dea94c74eb5d13cf401174fb9138e197ecdc602ff9048f9edbdb0c22f2e2`、`7316c8e6029fc40e467e11b40d0dbace4a96d25c4670ed978bdd3df88a2b7d7f`；同目录 `versioned.tap` 为重跑输出，SHA-256 `2bc4a69a0115e578e268322fda80dbb3c4cb907ebd81c4fb746900d18b50545a`。该 `.local` 目录为机器本地证据，不随 Git 发布。测试生成的临时合成数据和旧源码导出保留用于复核，短时 HTTP 服务均已关闭；未操作其他服务。此报告不代表真实模型、浏览器 UI、LAN 部署或完整验收通过。

## 真实候选验收准备（尚未执行）

已准备本机私密的离线快照比较与单一来源凭据字面值检查脚本，以及固定旧镜像隔离验证清单。实际 schema 6 备份、schema 8 候选副本、旧镜像拒绝与备份打开、23443 QA 数据和日志均尚未检查；等待主代理通知及提供授权的独立快照。检查只输出布尔值和数量，不能将本次合成 5/5 推断为真实候选通过。脚本和清单位于 `.local/standalone-bot-expansion/acceptance-prep/`，不随 Git 发布。

## 真实候选离线迁移独立验收

在 20443 停止、候选尚未启动时，对授权的 schema 6 备份与静止 schema 8 候选进行独立比较：两库完整性检查通过；旧 Bot 数据库 18/18 张表、owner 锁库 1/1 张表逻辑内容相同，5/5 个原有普通文件逐字节相同，包含加密授权和私密文件。SQLite 主库及 sidecar 的物理字节允许因迁移和锁机制变化，此处比较其逻辑内容，不声明物理字节一致。

固定旧镜像在无网络、只读根文件系统、UID 10001、无端口的短时容器中，分别使用独立临时副本：拒绝 schema 8，错误码 `schema-upgrade-required`；可打开 schema 6 且版本仍为 6。首次尝试因验收驱动将副本路径误写为 `/verify` 而返回 `inspection-failed`；经授权修正为 `/tmp/verify` 后，每个版本各运行一次并得到上述结果。两份授权源目录均只读挂载，旧 Storage 未接触源目录本体；未读取原数据目录，也未启动 HTTP 服务。私密机器可读通过凭据保存在本机验收目录，不包含凭据明文或凭据哈希。此结果仅覆盖离线迁移和旧版回退边界，不代表真实页面或模型验收。

## 外部主机防火墙边界

独立聚焦测试 1/1 通过。只读核对 `inet gk50_bots_lan` 单表当前规则，与 `/etc/gk50-bots-lan.nft` 持久文件和仓库样例在规则语义及结构上相同；指定 20443 目标的允许来源覆盖 loopback、RFC 1918 和 `100.64.0.0/10`。单表前后证据显示原有 `192.168.68.0/24` 例外改为五个来源网段的合取排除；该备份只覆盖此表，不证明整个主机规则集未变。

变更记录显示匿名 CIDR 集合写法的 `nft --check` replace 触发 nft 自身断言，未应用；五个 `!=` 条件的等价写法检查通过后应用。独立检查时候选仍使用固定 `0b10be393124` 镜像且运行中，六个其他服务的容器身份、镜像、运行状态与启动时间均与基线相同。无凭据业务 API 返回 401，错误 Host 与错误 Origin 分别返回 403；未创建会话或调用模型。这是外部主机配置变更，未修改或重建运行镜像；前后对比不覆盖其他主机规则的实时变化。

## QA 后旧会话核查

只读比较 schema 6 备份与候选当前会话记录：16 条旧会话中有 5 条不再存在，5 条的过期时间均早于首次成功 QA 登录完成证据文件的修改时间；在该时间尚未过期的旧会话全部保留。比较使用只读挂载及容器私有 SQLite 副本，摘要只在内存中比较，未输出摘要或令牌。此结果与登录时清理过期会话的行为一致；不应将 QA 后状态描述为 16 条会话全部保留。该检查不单独证明每条删除的具体执行时刻。

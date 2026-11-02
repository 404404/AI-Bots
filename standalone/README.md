# GK50 独立 Bot — 候选

`standalone/` 是 `404404/AI-Bots` fork 的独立网页产品，使用自己的 Node 后台、SQLite、文件记忆和加密授权，不启动或调用 DSH Host。原项目的 MIT 许可证及归属见仓库的 `LICENSE`、`NOTICE.md`。独立产品尚未迁移原项目的全部能力。

## 当前预览

2026-11-02，GK50 的 [23443 隔离预览](http://192.168.68.11:23443) 使用固定 CI 候选 `dbb9fb3b`；[20443 旧候选](http://192.168.68.11:20443) 保留原镜像和原数据。两者是独立实例，访问码、会话、Bot 和授权互不共享。[GK50 运行说明](../docs/standalone-bot-gk50.md)列出访问码获取方式、Compose、镜像身份与备份边界。

此预览通过网页和同一后台业务入口提供：

- 单用户模型账户：在设置中配置 Codex 或兼容服务，供所有 Bot 选择；Codex 模型目录的候选仅在实际请求成功后标为已验证。显式代理失败不会自动回退直连。
- 用户创建和定义 Bot。只有一位时自动作为主要联系人；有多位且未指定时由用户选择。名称和角色是身份数据，不授予管理权限。模型不能创建或修改 Bot。
- 每位 Bot 的私聊、用户明确保存的文件记忆、真实委派和来源可追溯的任务状态；重启后未完成的执行标记为中断，不自动重发。
- 持久群聊、稳定成员 ID、按顺序显示的消息、明确选择的回应成员、相同幂等键重试、取消与错误状态。当前每次可选择一至三位成员回应，同一群同时处理一条发送链。
- 用户上传的 PNG 头像及默认占位；格式、大小和像素约束见[头像说明](docs/avatars.md)。

真实 Codex 私聊、主对话委派、双 Bot 群回复、群响应丢失后的重试和预览重启恢复有独立证据，具体覆盖与限制见[验收报告](../docs/acceptance/standalone-single-user-employee-results-2026-10-31.md)。设备码授权曾失败，不能将后续其他方式的登录成功视为设备码问题已解决。远端 EasyTier 设备未完成本轮群聊验收。

**尚未完成：** 产品浏览器 worker 的镜像安全扫描仍阻塞交付，模型尚不能使用该浏览器；Computer、IM、定时任务和客户端版本继续延后。不能用测试 Chromium 或原 DSH 功能替代独立产品验收。完整发布门禁未达到，尚未发布正式 GHCR 镜像。

## 网页、CLI 与 API

[单用户员工和群聊说明](docs/single-user-employee-guide.md)提供网页操作路径与 CLI 示例。`POST /api/v1/session` 创建会话；`POST /api/v1/command` 接收命令和参数，Web 与 CLI 调用相同的认证业务实现。CLI 使用私密 JSON 文件或标准输入传递参数，凭据不放在命令行：

```sh
export BOT_URL=http://127.0.0.1:23443
export BOT_SESSION_FILE=/tmp/private-bot-session
node --experimental-strip-types standalone/src/cli.ts login --code-file <private-access-code-file>
node --experimental-strip-types standalone/src/cli.ts model-account.get
node --experimental-strip-types standalone/src/cli.ts contacts.get
node --experimental-strip-types standalone/src/cli.ts groups.list
node --experimental-strip-types standalone/src/cli.ts --help
```

CLI 标准输出为单个 JSON 文档，错误包含明确代码。Bot、消息、任务和群使用稳定 ID；列表提供服务端游标。不要将访问码、会话、密钥、设备码或 OAuth 凭据写入仓库或聊天。

## 本地构建与部署

需要 Node ≥22.19；正式容器固定 Node 24 镜像。

```sh
cd standalone
npm ci --ignore-scripts
npm test
npm run build
BOT_DATA_DIR=/tmp/my-independent-bot BOT_PUBLIC_URL=http://127.0.0.1:3080 npm start
```

数据目录为私密目录，访问码位于 `secrets/access-code`。LAN HTTP 必须使用实际访问地址配置 Host/Origin；HTTP 承载登录和对话内容，仅供已授权可信网络使用。明确代理可填容器能访问的 `http://host.docker.internal:7890`，宿主的 `127.0.0.1` 不能原样作为容器内代理地址。

Compose 样例为 [employee-preview.yml](deploy/compose.employee-preview.yml)，只使用预先校验的不可变镜像 ID 或 registry digest、独立数据目录和空闲端口。镜像回退与数据恢复分别处理；恢复旧备份会丢失备份后的写入。当前 CI 和镜像、备份及旧候选回退边界见[GK50 运行说明](../docs/standalone-bot-gk50.md)。未通过完整门禁前不得发布正式 GHCR 镜像。

SQLite 是 Bot、群、消息、任务和加密授权的权威；每个 Bot 的文件记忆独立，写入需要用户明确保存及 revision 检查。旧 `deepseekbot` 在线 CLI 的 Bot、Session、Channel Timeline、Activity、Assignment 仍属于原部署，新产品不伪造旧 Host 数据或建立第二套旧数据权威。

# 2 核 4GB Linux VPS 从零部署 DeepSeekBot：CLI、Tailscale 与 QQ 机器人

本教程对应真实 Ubuntu 26.04 部署：核对 SSH、加入既有 tailnet、安装完整源码产品产物、用 systemd 持久运行 Host、创建 PersonaBot，并接入独立官方 QQ App，最后验证重启后的新群回复。不看视频也能按文字操作。

**候选构建教程，审阅于 [PR #1443](https://github.com/BotHarness/DeepSeekBot/pull/1443)。** 部署产品为 `1.2.1-vps.20261012.sha031a14db`，源码固定在已合并的 `031a14db43af5b3bf52e76b01c30e27828e6e9c9`。验收时 npm `deepseekbot@1.2.0` 仅提供 `botharness-profile`，没有本教程所用的新业务 CLI，不能直接替换该候选构建。QQ 原群图片及剪辑视频仍待完成；两次真实群回复已由 Human 确认并关联原生事实。

## 开始之前

你需要一台已确认的 VPS 及云控制台权限、本机 OpenSSH 客户端、可加入的既有 Tailscale tailnet、可用模型 API Key，以及独立的官方 QQ Bot App 和专用测试群。先在 [QQ 官方平台](https://bot.q.qq.com/open) 核对当前账号与应用测试资格；本次部署不能证明其他账号也有相同资格。云端登录、tailnet 设备批准和首次应用凭据输入由 Human 完成。

开发机使用 Node **24.21.0**、pnpm **12.4.2**；目标机使用 DSH **0.2.0-rc.1** 和 qualified IM Provider **602baa37fa327f7069545aaadbbd34db8a8f4636**。按基础设施、安装、模型验证、QQ 验收分阶段进行；第三方批准耗时不固定。

下文的地址、公钥、AppID、群号均为占位示例。选择目录和端口前先检查既有服务，只创建本任务资源。

| 资源                    | 教程示例                                  |
| ----------------------- | ----------------------------------------- |
| 应用目录                | `/opt/botharness/seo-tutorial`            |
| 独立运行用户            | `bh-seo`                                  |
| 可写 DSH_HOME / Profile | `home/dsh` / `seo-tutorial`               |
| systemd Unit            | `botharness-seo-tutorial.service`         |
| Host 监听               | `127.0.0.1:31971`                         |
| tailnet HTTPS           | 空闲的 HTTPS 443 路由到上述 loopback 端口 |

## 1. 核对机器并授权 SSH

在**确认目标实例的云控制台**执行：

```bash
whoami
hostname
cat /etc/os-release
nproc
free -m
df -h /
swapon --show
ss -lntup
systemctl --type=service --state=running
command -v docker >/dev/null && docker ps
```

核对云端实例身份、地域、最新账期和实际 OS。本次实机是 Ubuntu 26.04、2 CPU、约 3654 MiB 可见内存和 60 GB 云盘。保留已有应用及发行版源，不套用 Ubuntu 24.04 的 apt 源。

在开发机执行 `ssh-keygen -t ed25519 -f <私钥路径>` 创建专用密钥。私钥只留本机；在云控制台的目标 SSH 账号上下文中幂等追加其**公钥**，保留已有条目：

```bash
set -eu
umask 077
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
key='ssh-ed25519 REPLACE_WITH_YOUR_PUBLIC_KEY tutorial-client'
if ! grep -qxF -- "$key" "$HOME/.ssh/authorized_keys"; then
  printf '\n%s\n' "$key" >> "$HOME/.ssh/authorized_keys"
fi
chmod 600 "$HOME/.ssh/authorized_keys"
printf 'KEY_OK\n'
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

用 `ssh-keyscan -t ed25519 <已确认地址>` 获取临时候选，再用 `ssh-keygen -lf <候选文件>` 与可信控制台的指纹比对。只有匹配后才保存到专用 known_hosts。keyscan 本身不是可信认证。验证实际命令响应：

```bash
ssh -F none -i <private-key-path> -o IdentitiesOnly=yes \
  -o UserKnownHostsFile=<verified-known-hosts> \
  -o StrictHostKeyChecking=yes -o BatchMode=yes \
  <verified-user>@<confirmed-host> whoami
```

用户名、地址、指纹留在私有部署记录。Windows 可在 PowerShell 使用 OpenSSH，将占位值换成自己的路径并正确加引号。

## 2. 加入 Tailscale 并验证真实通信

按刚核对的 OS 使用 [官方 Linux 安装方式](https://tailscale.com/docs/install/linux)。本次用官方自动检测 OS 的脚本安装了 Tailscale 1.104.1：

```bash
curl -fsSL https://tailscale.com/install.sh -o /root/tailscale-install.sh
sha256sum /root/tailscale-install.sh
sh /root/tailscale-install.sh
tailscale version
sudo tailscale up
```

在 `tailscale up` 前暂停录制。Human 用临时链接登录**既有 tailnet**并完成设备批准；不录授权链接。批准后设置设备名称，并私下检查本机地址：

```bash
sudo tailscale set --hostname=deepseekbot-internal
tailscale ip -4
```

开发机也必须加入同一 tailnet。执行 `tailscale ping <新设备名>`，并用 tailnet 地址重复第 1 步的严格 SSH。保存该地址的 Host key 前仍与同一控制台指纹核对。设备列表或 Agent Online 不替代 ping 与真实 SSH 响应。本教程使用 Tailscale 上的普通 OpenSSH，不需启用 Tailscale SSH、路由或 exit node。

## 3. 在开发机构建完整源码候选产品

用独立 checkout 执行：

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git botharness-product
cd botharness-product
git checkout 031a14db43af5b3bf52e76b01c30e27828e6e9c9
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
git clone https://github.com/DoodleBears/dsh-im.git qualified-provider
git -C qualified-provider checkout 602baa37fa327f7069545aaadbbd34db8a8f4636
cd qualified-provider
npm ci --ignore-scripts
cd ..
node scripts/product-artifacts.mjs \
  --output .humanlayer/product-candidate \
  --provider-source qualified-provider \
  --version 1.2.1-vps.20261012.sha031a14db
```

使用仓库已验证的打包机制，产物包含 Core、Client、browser、computer、Provider、应用 Bundle 及 `artifacts.json`。直接对 workspace 源码运行 `npm pack` 不足以部署。参见 [源码 Profile 安装指南](https://github.com/BotHarness/DeepSeekBot/blob/ac30b3a4fc41a2882b3ea417bddd486fc4c22465/docs/agents/source-profile-install.md) 与 [DSH 原生打包说明](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

从公开可审阅的 helper revision 准备安装工具；它与实际产品源码 revision 分开固定：

```bash
cd ..
git clone https://github.com/BotHarness/DeepSeekBot.git botharness-helpers
git -C botharness-helpers fetch origin codex/1438-vps-qq-tutorial
git -C botharness-helpers checkout ac30b3a4fc41a2882b3ea417bddd486fc4c22465
mkdir installation-kit
for helper in install-source-profile packaged-profile product-artifacts dev-im-provider dev-package-manager; do
  cp "botharness-helpers/scripts/$helper.mjs" installation-kit/
done
tar -czf product-candidate.tar.gz -C botharness-product/.humanlayer/product-candidate .
sha256sum product-candidate.tar.gz
```

用同一专用 identity 和严格 known_hosts 策略传输。例如 `scp -F none -i <私钥> -o IdentitiesOnly=yes -o UserKnownHostsFile=<已验证文件> -o StrictHostKeyChecking=yes -o BatchMode=yes product-candidate.tar.gz <用户>@<tailnet地址>:/root/product-candidate.tar.gz`；同样选项加 `-r installation-kit` 传到 `/root/installation-kit`。在 VPS 解压前比对开发机与目标机的 archive digest；比较的是**同一传输文件**，不是另一台机器重新构建的 digest。

## 4. 安装固定工具链和全新 Profile

确认示例目录及运行用户不存在后，以已验证的管理员执行：

```bash
set -eu
umask 077
base=/opt/botharness/seo-tutorial
test ! -e "$base"
if getent passwd bh-seo >/dev/null; then exit 1; fi
apt-get update
apt-get install --no-install-recommends -y ca-certificates curl git xz-utils build-essential python3
mkdir -p "$base/toolchain" "$base/artifacts" "$base/evidence"
useradd --system --create-home --home-dir "$base/home" --shell /usr/sbin/nologin bh-seo
mkdir -p "$base/home/dsh"
chown -R bh-seo:bh-seo "$base/home"
chmod 700 "$base/home" "$base/home/dsh"
cd "$base/toolchain"
curl -fSL https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz -o node-v24.21.0-linux-x64.tar.xz
curl -fSL https://nodejs.org/dist/v24.21.0/SHASUMS256.txt -o SHASUMS256.txt
grep ' node-v24.21.0-linux-x64.tar.xz$' SHASUMS256.txt > node-checksum.txt
test "$(wc -l < node-checksum.txt)" = 1
sha256sum -c node-checksum.txt
tar -xJf node-v24.21.0-linux-x64.tar.xz --strip-components=1
export PATH="$base/toolchain/bin:$PATH"
npm install --global --prefix "$base/toolchain" pnpm@12.4.2 @deepseek-ai/dsh@0.2.0-rc.1
node --version
pnpm --version
dsh --version
```

上述 Node archive 针对本次 x86-64 实机；其他架构须选对应官方包。传输文件放在运行用户 HOME 之外，先核对 digest，再解压到新目录。安装 helper 的 `yaml@2.9.1`、`semver@7.8.5`，并给予运行用户对非敏感 kit/产物的读取与目录穿越权限：

```bash
printf '%s  /root/product-candidate.tar.gz\n' '<your-development-machine-sha256>' | sha256sum -c -
mkdir /opt/botharness/seo-tutorial/artifacts/source-candidate
tar -xzf /root/product-candidate.tar.gz -C /opt/botharness/seo-tutorial/artifacts/source-candidate
cp -R /root/installation-kit /opt/botharness/seo-tutorial/installation-kit
cd /opt/botharness/seo-tutorial/installation-kit
npm install --ignore-scripts --no-audit --no-fund yaml@2.9.1 semver@7.8.5
chmod -R a+rX /opt/botharness/seo-tutorial/installation-kit /opt/botharness/seo-tutorial/artifacts/source-candidate
cd /opt/botharness/seo-tutorial/home
runuser -u bh-seo -- env \
  DSH_HOME=/opt/botharness/seo-tutorial/home/dsh \
  PATH=/opt/botharness/seo-tutorial/toolchain/bin:/usr/bin:/bin \
  node /opt/botharness/seo-tutorial/installation-kit/install-source-profile.mjs \
  --home /opt/botharness/seo-tutorial/home/dsh --profile seo-tutorial \
  --artifacts /opt/botharness/seo-tutorial/artifacts/source-candidate \
  --dsh /opt/botharness/seo-tutorial/toolchain/bin/dsh
```

helper 用 DSH 原生 `web` 默认创建自定义 Profile，安装打包 Bundle 并验证六个组件。既有 Profile 会拒绝覆盖；失败后先检查部分安装状态。可在 VPS 的独立 `source` 目录直接 clone 同一产品 SHA，但运行的是已安装产物，不是未经构建的 workspace。安装时查看 `free -m`，不要在 2 核 4GB 上并行全量构建。

## 5. 让 loopback Host 持续运行

先查看实际安装 CLI 的 `--help` 和 `web --help`。本次 qualified 根启动命令接受下面的 flags。把 `tutorial.example.ts.net` 换成自己的精确设备 DNS 名，新建 `/etc/systemd/system/botharness-seo-tutorial.service`：

```ini
[Unit]
Description=DeepSeekBot tutorial
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=bh-seo
Group=bh-seo
WorkingDirectory=/opt/botharness/seo-tutorial/home
Environment=DSH_HOME=/opt/botharness/seo-tutorial/home/dsh
Environment=PATH=/opt/botharness/seo-tutorial/toolchain/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/opt/botharness/seo-tutorial/toolchain/bin/dsh --profile seo-tutorial --host 127.0.0.1 --port 31971 --trusted-host tutorial.example.ts.net --no-open
Restart=on-failure
RestartSec=5
UMask=0077
StandardOutput=append:/opt/botharness/seo-tutorial/home/dsh/host.log
StandardError=append:/opt/botharness/seo-tutorial/home/dsh/host.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now botharness-seo-tutorial.service
systemctl is-active botharness-seo-tutorial.service
ss -lntp '( sport = :31971 )'
```

确认仅监听 loopback。Host 日志含私有 Owner 登录 URL；查看前暂停录制，并保护日志，不公开该 URL。使用实际 Host 的 Owner token，保留原生认证。CLI 的 token 文件使用 `home/dsh/owner-token`，仅保存 token，属主 `bh-seo`、权限 `0600`。若重启签发新 token，则私下更新该文件；不要将 token 放入命令参数。

## 6. 打开 tailnet HTTPS 并登录

先看 `tailscale serve --help` 与 `tailscale serve status --json`，只在目标 HTTPS 路由空闲时继续，保留其他路由。本次新设备执行：

```bash
tailscale serve --bg --https=443 --yes http://127.0.0.1:31971
```

在同一 tailnet 的客户端打开自己的实际设备 HTTPS URL，暂停录制后完成原生 Owner 登录。分别验证 Web 可操作与已认证 native API；未认证的 `401` 是预期结果。这是 **tailnet-only** 入口，读者两端都需加入自己的 tailnet。参见 [Serve 官方说明](https://tailscale.com/docs/reference/tailscale-cli/serve)。

## 7. 配置模型并创建教程 PersonaBot

在 VPS 管理员 shell 中定义实际已安装的业务 CLI：

```bash
base=/opt/botharness/seo-tutorial
cli=$base/home/dsh/profiles/seo-tutorial/node_modules/deepseekbot/dist/deepseekbot.mjs
live() {
  runuser -u bh-seo -- env DSH_HOME="$base/home/dsh" PATH="$base/toolchain/bin:/usr/bin:/bin" \
    node "$cli" "$@" --host http://127.0.0.1:31971 --token-file "$base/home/dsh/owner-token"
}
```

暂停录制后，通过可信 stdin 将模型 Key 交给运行用户的 `secret-put`。该命令不接受 argv 中的值，写入原生 `DEEPSEEK_API_KEY` 引用。参见 [业务 CLI 文档](https://github.com/BotHarness/DeepSeekBot/blob/031a14db43af5b3bf52e76b01c30e27828e6e9c9/docs/bot-cli.md)。Bash 隐藏输入示例，先关闭命令 tracing：

```bash
set +x
read -rsp 'DeepSeek API key: ' tutorial_model_key
printf '\n'
printf '%s' "$tutorial_model_key" | runuser -u bh-seo -- env \
  DSH_HOME="$base/home/dsh" PATH="$base/toolchain/bin:/usr/bin:/bin" \
  node "$cli" secret-put DEEPSEEK_API_KEY
unset tutorial_model_key
```

先在原生模型 catalog 核对当前路由。本次实机通过以下 preset 得到真实回复：

```bash
live model-preset-create --name 'SEO Tutorial DeepSeek' \
  --orchestrator-provider deepseek-official --orchestrator-model deepseek-flash --orchestrator-effort low \
  --assignment-provider deepseek-official --assignment-model deepseek-flash --assignment-effort low
live create --name 'VPS SEO Tutorial Bot' \
  --description 'Dedicated VPS and QQ tutorial Bot' \
  --persona 'Help with deployment. For verification requests, reproduce the requested marker exactly.' \
  --preset <id-returned-by-model-preset-create>
printf 'Please reply only TUTORIAL_DM_A_OK' | live send <new-bot-id> --body-stdin
```

使用命令返回的实际 ID。核对该新请求的已提交关联回复，再打开 Web 中**同一个 Bot 的 DM**查看匹配消息。Provider 配置或 send accepted 不证明模型可用。

![源码更新后教程 Bot 的真实模型回复](https://raw.githubusercontent.com/BotHarness/DeepSeekBot/ac30b3a4fc41a2882b3ea417bddd486fc4c22465/docs/assets/vps-source/01-real-dm-031a14db.png)

_2026-10-11 17:55 UTC 的实际 1280 × 800 截图。底部回复匹配源码 marker；上方较大的欢迎卡为预设产品文字。_

## 8. 连接独立 QQ App 并绑定该 Bot

分配独立官方应用与专用测试群，并确认**所有机器上没有其他 Host 接收该 App**。不使用个人账号自动化，也不为生产 App 增加第二个接收器。

既有 App 首次授权走 **Settings → IM bots → QQ → Manual setup**。暂停录制后，Human 直接在原生表单输入 AppID 与 AppSecret 并 Connect；核对真实应用身份。当前 qualified Provider 的二维码流程用于创建 Bot，不是复用既有 App 的入口。资格和权限仍以 [QQ 官方鉴权文档](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html) 及当前平台显示为准。

若选定应用已在停止的原生 Profile 中授权，使用 [QQ QA CLI 复用指南](https://github.com/BotHarness/DeepSeekBot/blob/ac30b3a4fc41a2882b3ea417bddd486fc4c22465/docs/agents/qq-test-clients.md)。开发 helper 可认领 QA1/QA2/QA3、**只读取该应用的原生凭据**，经严格 SSH 连接远程 loopback，避免再次输入 Secret；切换分支时保留目标 Profile。它不是公开的 `deepseekbot im-authorize qq` 命令。

无论使用哪条授权路径，都要在教程 Bot 的 **External identities** 选择已认证 QQ App 并绑定。原生 Provider 授权与 application-defined Bot Binding 是两个步骤。

![已认证 QQ App 成功绑定到教程 Bot 的原生确认](https://raw.githubusercontent.com/BotHarness/DeepSeekBot/ac30b3a4fc41a2882b3ea417bddd486fc4c22465/docs/assets/vps-source/02-qq-app-bound.png)

_2026-10-11 18:10:31 UTC 的实际 1280 × 800 截图，无 Secret 或二维码。它只验证绑定就绪，不是 QQ 原群回复截图。_

## 9. 验证重启前后的 QQ 原群回复

Human 或获授权测试账号在专用 QQ 群 @mention 该 App，发送新的唯一 marker。本次首条请求为“请只回复 SEO_QQ_QA1_20261012_A_OK”，Human 确认原群出现完全匹配的回复；其 QQ Source Event、已处理 Inbox Admission、provider-accepted Outbox intent 与 receipt 已关联。

只重启本教程 Unit，必要时私下更新 Owner token，检查同一 Bot 与原生 QQ App：

```bash
systemctl restart botharness-seo-tutorial.service
systemctl is-active botharness-seo-tutorial.service
live im-apps
```

验证 Bot、模型设置、授权和 Binding 保留。再发一条**新** @mention，例如“请只回复 SEO_QQ_QA1_20261012_B_OK”。Human 同样确认原群匹配回复；这次 Source 和 Outbox 与首次不同、创建于重启之后，且属于同一原生 QQ 会话。旧进程证据不能替代这次新发送。

公开的 [有限验收摘要](https://github.com/BotHarness/DeepSeekBot/blob/codex/1438-vps-qq-tutorial/docs/assets/vps-source/qq-acceptance.json) 不含群号、Source 定位值、凭据或机器地址。QQ 原群截图/视频尚未提供公开审阅；不要用绑定图、合成聊天图或 Provider receipt 代替。

## 排错与维护

| 现象                                       | 检查与下一步                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| SSH Host key 不匹配                        | 对比所选云控制台，先调查身份变化，再决定是否信任新 key                          |
| tailnet 已列出但不通                       | 检查设备批准、所选 tailnet、ping 和严格 SSH 实际响应                            |
| 安装拒绝既有 Profile                       | 选真正新 Profile 或已验证的升级/备份路径，不删除已有数据                        |
| `host-unauthorized`                        | 私下刷新该 Host 的 Owner token 文件并重新登录                                   |
| `host-unreachable`                         | 先查看该 Unit 与 loopback 监听，再检查访问路由                                  |
| `reply-not-produced` / `send-needs-repair` | 用 `send-status` 检查该请求，不盲目重发结果不明的 mutation                      |
| QQ connected 但无回复                      | 核对 App 身份、Binding、测试群资格和新 @mention，再关联 Source / Inbox / Outbox |
| QQ QA 已被认领                             | 联系其 owner，停止准确接收器后显式 release；claim 不自动过期                    |
| 原生凭据复用拒绝                           | 检查所选 AppID、原生引用、source writer 与接收器状态，不复制整个凭据文件        |
| 安装内存紧张                               | 使用预构建产物、限制本任务并发，按实际内存数据判断                              |

用 `systemctl show botharness-seo-tutorial.service -p MemoryCurrent -p MemoryPeak` 看本 Unit 资源。本次 QQ 接入前观察到约 373 MiB Unit peak；安装采样至少有 2795 MiB available。这不是其他工作负载的上限承诺，也不是覆盖每个瞬间的峰值测量。

仅停止和恢复本任务接收器：

```bash
systemctl stop botharness-seo-tutorial.service
systemctl is-active botharness-seo-tutorial.service
systemctl start botharness-seo-tutorial.service
```

恢复后必要时刷新原生 Owner 登录，并发送新 DM 与群 @mention。移除 HTTPS 路由前查看实际 Serve 帮助和当前配置，只关闭本任务的 HTTPS 443 handler，不 reset 其他路由。保留本任务 HOME 与原生凭据；升级前对停止的 Profile 做私有备份，数据库回退需要兼容 writer 或升级前备份。

## 证据与发布检查

本次实机验证了严格 SSH、tailnet-only HTTPS、原生 Owner 登录、独立 Unit、真实模型回复及两次真实 QQ 原群回复。[素材来源清单](https://github.com/BotHarness/DeepSeekBot/blob/codex/1438-vps-qq-tutorial/docs/assets/vps-source/README.md) 记录版本、UTC 时间、digest 与每张公开图能证明的范围。

仓库原用户指南路由已重定向到 DeepSeekBot 产品站。发布本教程时仍需核对该站的中英文目标页面；此 PR 准备的是源文档与重定向，并未部署线上教程页面。

真实的 [安装及源码更新 terminal 输出/timing](https://github.com/BotHarness/DeepSeekBot/tree/codex/1438-vps-qq-tutorial/docs/assets/vps-source/terminal) 已审阅，原样公开并记录 digest。[原生 QQ 绑定实录](https://github.com/BotHarness/DeepSeekBot/blob/codex/1438-vps-qq-tutorial/docs/assets/vps-source/video/transcript.md) 提供 17 秒 MP4、中英文字幕、章节、等价文字稿及 digest；全部 516 帧已检查，保留完整原始视频数据。它展示绑定就绪，不是 QQ 原群回复。其他浏览器片段和完整教程成片仍待完成。登录链接、Owner token、模型 Key、QQ Secret、二维码、账号列表出现前暂停录制。只发布已审阅并去除无关会话和机器标识的素材。完整教程媒体交付继续由 [issue #1438](https://github.com/BotHarness/DeepSeekBot/issues/1438) 跟踪。

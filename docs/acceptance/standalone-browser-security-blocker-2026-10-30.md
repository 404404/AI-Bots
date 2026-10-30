# 独立浏览器镜像门禁阻塞（2026-10-30）

## 实际结果

| 源码 / CI | 结果 | 后续处理 |
| --- | --- | --- |
| `d67c86d2` / [40985034393](https://github.com/404404/AI-Bots/actions/runs/40985034393) | Bookworm worker 扫描报告 100 项 HIGH/CRITICAL | 停止；未发布或部署失败产物。 |
| `f27130ee` / [41013347453](https://github.com/404404/AI-Bots/actions/runs/41013347453) | 单元测试未挂载其读取的 workflow，ENOENT；未进入构建/扫描 | 保留失败，修复精确只读 fixture 挂载；缺少文件仍失败关闭。 |
| `57493d4e` / [41013969970](https://github.com/404404/AI-Bots/actions/runs/41013969970) | 测试及四个镜像构建成功；Trixie worker 扫描仍有 67 项（66 HIGH、1 CRITICAL） | 扫描门禁失败，后续扫描/真实沙箱/E2E/归档均跳过；无可晋级产物。 |

本地固定 Node24 隔离测试及 CI fixture 复测通过，不代替扫描、真实 Chromium 沙箱或容器网络隔离验收。具体日志和脱敏调查存放在 gitignored `.local/standalone-bot-expansion/evidence/`，不会随镜像公开私有测试数据。

## 修复调查与边界

扫描中的 CRITICAL 项为 Trixie `libxml2` 的 CVE-2026-6653；所安装版本被 Debian tracker 标为受影响，记录的修复位于 unstable。Chromium → GTK/GDK Pixbuf → shared-mime-info 的发行版依赖链包含 libxml2，不能删除包来假定功能或安全仍成立。[Debian 跟踪](https://security-tracker.debian.org/tracker/CVE-2026-6653)、[Chromium 依赖](https://packages.debian.org/trixie/chromium)、[GDK Pixbuf 依赖](https://packages.debian.org/trixie/libgdk-pixbuf-2.0-0)、[shared-mime-info 依赖](https://packages.debian.org/trixie/shared-mime-info)。

其他发现涉及发行版基础组件及 Chromium 必需库。当前没有建立通过门禁的受支持固定包组合；没有用删除包数据库/SBOM、伪造版本、忽略未修复项、增加豁免或无沙箱运行取得通过。更换发行版也需要实际补丁、依赖、构建及沙箱证据，不能只因扫描生态不同而假定修复。

## 对交付的影响

- 独立应用的主身份、任务、头像及内网访问切片仍使用各自成功 CI 的固定候选；它们的真实证据分别记录。
- 浏览器应用接线和协议/模拟测试可以审查，但在合格 worker 产物及真实直接工具链通过前，浏览器首片不算完成。
- 按用户规定的顺序，先真实直接工具，再真实工作 Bot 浏览器工具与主 Bot 汇总；后一项仍待实现/验收，不能以 QA 浏览器冒充。
- 整体正式 GHCR 发布及 22443 切换门禁未达到。保留原部署与数据，原 GUI 保持停止。

恢复条件：取得有修复依据的独立镜像，通过原严格扫描，再在隔离环境实际证明非 root Chromium 沙箱、网络、生命周期、CLI/API、网页和真实模型工具链；任何失败继续停止晋级。

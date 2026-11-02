# 独立 Browser Worker 验收用例（2026-11-02）

主代理编写；GPT 6 Luna 实现；GPT 6.1 Terra 独立执行。下列标准不是通过声明。所有测试使用单独 CI 或 GK50 临时 fixture，不更改 23443、20443、22443、其他服务或现有数据。外部网站必须另有明确目标授权。

| ID | 验收场景 | 通过条件与证据 |
| --- | --- | --- |
| BW-01 | 既有 Trixie 扫描 | 保留 CI 41378523337 的原始结果；完整列出 OS/应用、包、CVE、修复状态及镜像层，不能将不同 DB 时间的扫描结果混为一谈。 |
| BW-02 | Trixie、Ubuntu 24.04、可用 Ubuntu 26.04/Playwright | 每个方案在独立构建中记录固定来源、digest、时间、Node/Chromium/Playwright 版本、SBOM、Trivy 数据库版本、完整 HIGH/CRITICAL 结果及实际依赖；不可用方案记录明确原因。 |
| BW-03 | CVE-2026-6653 | 用 Debian 和 Ubuntu 各自的官方公告核对对应版本及修复状态；不跨发行版覆盖系统库，不忽略漏洞、改阈值、伪造版本或删除包数据库。 |
| BW-04 | CI 门禁 | Worker、Proxy、Gateway、Fixture 各自有完整严格扫描；真实沙箱和 E2E 独立报告；候选归档/发布必须同时依赖全部扫描和诊断通过，任何失败或缺项停止。 |
| BW-05 | Chromium 沙箱 | 非 root，Chromium sandbox、PID namespace 和 seccomp-BPF 通过真实进程检查；无 `--no-sandbox`、不放宽已批准的部署安全例外。 |
| BW-06 | Worker 网络 | 无非 loopback 网络接口；无法直接访问宿主敏感端口及未授权地址；外部请求只经 Egress Proxy；记录进程及网络命名空间证据。 |
| BW-07 | Origin 与 DNS | Origin 授权、DNS/IP 检查、私有/元数据/禁止地址规则覆盖重定向与地址变化；拒绝返回明确错误，不泄露敏感内容。 |
| BW-08 | 真实 fixture 浏览器 | 实际导航、观察、点击、输入、滚动、截图均产生真实可核对结果；测试页和数据隔离。 |
| BW-09 | 生命周期与隔离 | 取消、超时、幂等重试、进程退出清理；Bot/Task 间 session、授权和截图隔离；无后台无限运行或盲目重发。 |
| BW-10 | 应用直接操作 | SQLite Task/Run 为权威，真实 Bot ID、Task ID、授权修订、幂等键一致；用户 Web 和 CLI 使用相同业务与权限检查，产生可追溯执行事件。 |
| BW-11 | 受控模型工具 | 在隔离 fixture 上，模型真实调用受限 Browser Tool 并观察结果；工作 Bot 使用工具后向协调 Bot 返回真实来源和结果，非硬编码或手动代跑。 |
| BW-12 | 回归与环境 | 完整测试、build 和清理结果；固定源码、CI、镜像 manifest/config digest及 SBOM；三套现有容器的镜像、运行状态和数据挂载前后相同。未通过全部门禁不发布 GHCR、不修改运行预览。 |

分别标注通过、失败、部分验证、外部条件阻塞及未实现；合成 transport、API、真实页面、真实 Chromium、真实模型分别取证。凭据、访问码、cookie、设备码及 OAuth token 不进入输出、日志、截图、证据或仓库。
